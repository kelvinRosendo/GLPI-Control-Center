<?php
declare(strict_types=1);
require_once __DIR__ . '/services/RoomTicketsService.php';
require_once __DIR__ . '/services/RoomTicketsReader.php';
require_once __DIR__ . '/services/RoomTicketAcknowledgementStore.php';
require_once __DIR__ . '/services/RoomTicketWorkStore.php';

final class RoomTicketsEndpoint
{
    public static function list(array $config): void
    {
        header('Cache-Control: no-store');
        try {
            $filters = RoomTicketsService::filters($_GET);
        } catch (InvalidArgumentException $error) {
            Responde::erro($error->getMessage(), 422);
            return;
        }
        $client = new GlpiClient($config['glpi'] ?? []);
        $session = null;
        $result = null;
        try {
            $session = $client->initSession();
            $startedAt = microtime(true);
            $read = static function (string $path, bool $expand = false) use ($client, $session, $startedAt): array {
                return RoomTicketsReader::collect(static function (int $offset, int $size) use ($client, $session, $path, $startedAt, $expand): array {
                    if (microtime(true) - $startedAt > 45) throw new RuntimeException('Prazo da consulta excedido.');
                    return $client->getReportPage($path, $session, $offset, $size, $expand);
                });
            };
            // Collections are read in batches, never one HTTP request per ticket.
            $tickets = $read('/Ticket');

            $locations = $categories = $links = [];
            $restrictedLookups = [];
            if ($tickets) {
                // Dropdown administration may be denied while ticket reading is allowed.
                // Only a permission denial is optional; transport and incomplete reads fail.
                foreach (['/Location' => 'locations', '/ITILCategory' => 'categories'] as $path => $target) {
                    try { $$target = $read($path); }
                    catch (RuntimeException $error) {
                        if ($error->getCode() !== 403) throw $error;
                        $restrictedLookups[] = $path;
                    }
                }
                if ($restrictedLookups) {
                    // Read labels through authorized Ticket fields, retaining raw entity/asset IDs.
                    $expanded = [];
                    foreach ($read('/Ticket', true) as $row) $expanded[(int)$row['id']] = $row;
                    if (count($expanded) !== count($tickets)) throw new RuntimeException('Conjunto de chamados alterado.');
                    foreach ($tickets as &$ticket) {
                        $labels = $expanded[(int)$ticket['id']] ?? null;
                        if ($labels === null) throw new RuntimeException('Conjunto de chamados alterado.');
                        $ticket['_location_name'] = is_string($labels['locations_id'] ?? null) ? $labels['locations_id'] : '';
                        $ticket['_category_name'] = is_string($labels['itilcategories_id'] ?? null) ? $labels['itilcategories_id'] : '';
                    }
                    unset($ticket);
                }
                $links = $read('/Item_Ticket');
            }
            $cache = AssetService::fromCache();
            $assets = is_array($cache['items'] ?? null) ? $cache['items']
                : (is_array($cache) && $cache === array_values($cache) ? $cache : []);
            $normalized = RoomTicketsService::normalize($tickets, $locations, $categories, $links, $assets);
            $result = RoomTicketsService::aggregate($normalized['items'], $filters);
            $warnings = [];
            if ($restrictedLookups) $warnings[] = 'O GLPI restringe os cadastros de locais ou categorias. Os nomes foram consultados nos próprios chamados.';
            if (!$assets && $tickets) $warnings[] = 'Nomes e patrimônios de ativos indisponíveis no cache. Os vínculos são exibidos por tipo e ID.';
            if ($normalized['invalidDates']) $warnings[] = 'Há chamados com data inválida que não puderam ser contados.';
            $result = RoomTicketAcknowledgementStore::attach($result);
            $result = self::attachWork($result);
            $result['meta'] = [
                'collectedAt' => date(DATE_ATOM), 'complete' => $normalized['invalidDates'] === 0,
                'warnings' => $warnings, 'source' => 'GLPI',
                'assetNamesSource' => 'cache GCC (pode estar desatualizado)',
                'scope' => 'Salas, laboratórios, biblioteca e auditório identificados no chamado; referências L- sem sala entram para revisão.',
                'limitPerCollection' => 10000,
                'restrictedLookups' => $restrictedLookups,
            ];
            // Monitoring slice ignores report filters: one queue for every screen.
            $result['monitor'] = [
                'recent' => RoomTicketAcknowledgementStore::attachList(
                    RoomTicketsService::monitorEntries($normalized['items'])
                ),
                'recentLimit' => 30,
                'collectedAt' => $result['meta']['collectedAt'],
            ];
        } catch (Throwable $error) {
            // Do not expose GLPI payloads, tokens or upstream exception messages.
            error_log('[room-tickets] Falha na consulta: ' . get_class($error));
        } finally {
            if ($session !== null) {
                try { $client->killSession($session); } catch (Throwable $ignored) {}
            }
        }
        if ($result === null) {
            Responde::erro('Não foi possível obter o conjunto completo de chamados e vínculos. Verifique o acesso do GCC ao GLPI, o tempo de resposta e o limite de 10 mil registros por coleção.', 502);
            return;
        }
        Responde::ok(['data' => $result]);
    }

    /**
     * Acknowledges an alert in the GCC only. Eligibility, reference and
     * openedAt are always re-read from GLPI: the client cannot choose them.
     */
    public static function accept(int $ticketId, array $config): void
    {
        Request::rateLimit('room-ticket-accept', 60, 60);
        if ($ticketId < 1) {
            Responde::erro('Chamado inválido.', 422);
            return;
        }
        $existing = RoomTicketAcknowledgementStore::forTicket($ticketId);
        if ($existing !== null) {
            Responde::ok(['data' => ['acknowledgement' => $existing, 'alreadyAccepted' => true]]);
            return;
        }

        $actor = ['name' => RoomTicketsService::text(PermissionMiddleware::getUserName() ?? ''),
            'email' => RoomTicketsService::text(PermissionMiddleware::getUserEmail() ?? '')];
        // A resposta só é enviada depois do withGlpiSession encerrar a sessão.
        try {
            $outcome = self::withGlpiSession($config, static function (GlpiClient $client, string $session) use ($ticketId, $actor): array {
            $row = $client->getWithParams('/Ticket/' . $ticketId, $session, ['expand_dropdowns' => 'true']);
            if (!is_array($row) || (int) ($row['id'] ?? 0) !== $ticketId) {
                return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
            }
            $ticket = RoomTicketsService::fromGlpi($row);
            if ($ticket === null) {
                return ['ok' => false, 'error' => 'O chamado não pertence à fila de salas.', 'status' => 422];
            }
            if (!RoomTicketsService::isAlertEligible($ticket)) {
                return ['ok' => false, 'error' => 'O chamado não está mais em aberto.', 'status' => 422];
            }
            $entry = RoomTicketAcknowledgementStore::accept($ticketId, [
                'reference' => $ticket['reference'],
                'openedAt' => $ticket['openedAt'],
            ], $actor);
            return ['ok' => true, 'data' => ['acknowledgement' => $entry], 'status' => 200];
            });
        } catch (RuntimeException $error) {
            $outcome = self::failure($error, 'Não foi possível verificar o chamado no GLPI. Tente novamente.', 502);
        } catch (Throwable $error) {
            error_log('[room-tickets] Falha ao registrar aceite: ' . get_class($error));
            $outcome = ['ok' => false, 'error' => 'Não foi possível registrar o aceite do alerta.', 'status' => 500];
        }
        self::answer($outcome);
    }

    /**
     * Lightweight acknowledgement read for periodic synchronisation across
     * tabs and screens. Never touches GLPI.
     */
    public static function acknowledgements(): void
    {
        header('Cache-Control: no-store');
        Request::rateLimit('room-ticket-acks-read', 300, 60);
        $raw = $_GET['ids'] ?? '';
        if (!is_string($raw)) {
            Responde::erro('Filtro inválido: ids.', 422);
            return;
        }
        $ids = [];
        foreach (explode(',', $raw) as $piece) {
            $piece = trim($piece);
            if ($piece === '') continue;
            if (!ctype_digit($piece)) {
                Responde::erro('Identificadores de chamado inválidos.', 422);
                return;
            }
            $ids[] = (int) $piece;
        }
        if (!$ids) {
            Responde::erro('Informe ao menos um chamado.', 422);
            return;
        }
        if (count($ids) > 100) {
            Responde::erro('Limite de 100 chamados por consulta.', 422);
            return;
        }
        Responde::ok(['data' => [
            'acknowledgements' => RoomTicketAcknowledgementStore::forIds($ids),
            'checkedAt' => date(DATE_ATOM),
        ]]);
    }

    // ── Kanban, responsável, movimentação e conclusão ───────────────────────

    /**
     * Annotates the report and the Kanban cards with the GCC record. An
     * acknowledgement alone never produces a handler.
     */
    private static function attachWork(array $result): array
    {
        $result['items'] = RoomTicketWorkStore::attachList(is_array($result['items'] ?? null) ? $result['items'] : []);
        if (is_array($result['latest'] ?? null)) {
            $result['latest'] = RoomTicketWorkStore::attachList([$result['latest']])[0];
        }
        $kanban = is_array($result['kanban'] ?? null) ? $result['kanban'] : null;
        if ($kanban !== null && is_array($kanban['columns'] ?? null)) {
            foreach ($kanban['columns'] as $key => $column) {
                $items = is_array($column['items'] ?? null) ? $column['items'] : [];
                $items = RoomTicketAcknowledgementStore::attachList($items);
                $kanban['columns'][$key]['items'] = RoomTicketWorkStore::attachList($items);
            }
            $result['kanban'] = $kanban;
        }
        return $result;
    }

    /**
     * Runs an operation with a GLPI session that is ALWAYS closed before the
     * caller answers. Responde::ok/erro terminate the process (exit), so the
     * session must be gone before they are called.
     */
    private static function withGlpiSession(array $config, callable $operation): array
    {
        $client = new GlpiClient($config['glpi'] ?? []);
        $session = null;
        try {
            $session = $client->initSession();
            return $operation($client, $session);
        } finally {
            if ($session !== null) {
                try { $client->killSession($session); } catch (Throwable $ignored) {}
            }
        }
    }

    /**
     * Exact technician match in GLPI. Never assigns by name similarity: a
     * different or ambiguous name is recorded as "informado" only.
     */
    private static function matchTechnician(GlpiClient $client, string $session, string $name): ?array
    {
        $wanted = self::matchKey($name);
        if ($wanted === '') return null;
        $users = $client->getWithParams('/User', $session, [
            'is_technician' => '1', 'range' => '0-199', 'expand_dropdowns' => 'false', 'sort' => 'name',
        ]);
        if (!is_array($users)) return null;
        $found = [];
        foreach ($users as $user) {
            if (!is_array($user) || !isset($user['id'])) continue;
            if (array_key_exists('is_technician', $user) && (int) $user['is_technician'] !== 1) continue;
            $userName = RoomTicketsService::text($user['name'] ?? '');
            if (self::matchKey($userName) !== $wanted) continue;
            $found[(int) $user['id']] = $userName;
        }
        // Ambiguous name: two or more GLPI users with the same exact name.
        if (count($found) !== 1) return null;
        $id = (int) array_key_first($found);
        return ['id' => $id, 'name' => (string) $found[$id]];
    }

    /** Normalization for exact comparison: case, accents and repeated spaces. */
    private static function matchKey(string $value): string
    {
        $value = RoomTicketsService::text($value);
        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
            if (is_string($converted) && $converted !== '') $value = $converted;
        }
        $value = strtolower($value);
        return trim(preg_replace('/[^a-z0-9]+/u', ' ', $value) ?? $value);
    }

    /**
     * Applies a movement in GLPI and confirms the resulting status by re-reading
     * the ticket. Every step is reported as it really happened: a partial write
     * is never presented as a complete success.
     */
    private static function applyMove(GlpiClient $client, string $session, int $ticketId, string $action, int $toStatus, array $plan): array
    {
        $input = ['status' => $toStatus];
        $assignField = (string) ($plan['assignField'] ?? '');
        $assignUserId = (int) ($plan['assignUserId'] ?? 0);
        if ($assignField !== '' && $assignUserId > 0) $input[$assignField] = $assignUserId;
        $solution = trim((string) ($plan['solution'] ?? ''));
        if ($solution !== '') $input['resolution'] = $solution;

        $steps = [];
        // Status (and assignment/resolution) in a single write.
        $client->put('/Ticket/' . $ticketId, $session, ['input' => $input]);
        $after = $client->getWithParams('/Ticket/' . $ticketId, $session, ['expand_dropdowns' => 'true']);
        $observed = is_array($after) ? (int) ($after['status'] ?? 0) : 0;
        $steps[] = ['step' => 'status', 'ok' => $observed === $toStatus,
            'expected' => $toStatus, 'observed' => $observed];
        if ($assignField !== '' && $assignUserId > 0) {
            $assigned = is_array($after) ? (int) (RoomTicketsService::assignee($after)['userId'] ?? 0) : 0;
            $steps[] = ['step' => 'atribuicao', 'ok' => $assigned === $assignUserId,
                'expected' => $assignUserId, 'observed' => $assigned];
        }
        $confirmed = true;
        foreach ($steps as $step) if (!$step['ok']) $confirmed = false;

        // Solution follows the official ITIL mechanism of the ticket.
        if ($solution !== '') {
            try {
                $client->post('/ITILFollowup', $session, ['input' => [
                    'itemtype' => 'Ticket', 'tickets_id' => $ticketId,
                    'type_followup' => 3, 'content' => $solution,
                ]]);
                $steps[] = ['step' => 'solucao_glpi', 'ok' => true];
            } catch (Throwable $error) {
                error_log('[room-tickets] Solução não registrada no histórico do GLPI: ' . get_class($error));
                $steps[] = ['step' => 'solucao_glpi', 'ok' => false];
                $confirmed = false;
            }
        }
        return ['steps' => $steps, 'confirmed' => $confirmed, 'row' => $after,
            'partial' => !$confirmed && $observed === $toStatus];
    }

    /**
     * "Assumir chamado": registers who will attend, moves the ticket to
     * Em andamento in GLPI, acknowledges the shared alert and shares the
     * change with every screen. An old acknowledgement is preserved and never
     * promoted to an assignment.
     */
    public static function assume(int $ticketId, array $config): void
    {
        Request::rateLimit('room-ticket-assume', 30, 60);
        if ($ticketId < 1) {
            Responde::erro('Chamado inválido.', 422);
            return;
        }
        $body = Request::json();
        $handler = RoomTicketsService::text(is_scalar($body['handler'] ?? null) ? $body['handler'] : '');
        if ($handler === '') {
            Responde::erro('Informe quem do TI foi resolver o problema.', 422);
            return;
        }
        $requestId = self::requestKey($body);
        $replay = RoomTicketWorkStore::findRequest($requestId);
        if ($replay !== null && (int) ($replay['ticketId'] ?? 0) === $ticketId
            && ($replay['action'] ?? '') === 'assumir') {
            Responde::ok(['data' => self::replayed((array) ($replay['result'] ?? []))]);
            return;
        }
        $actor = self::actor();
        $outcome = ['ok' => false, 'error' => 'Não foi possível assumir o chamado. Tente novamente.', 'status' => 500];
        try {
            $outcome = self::withGlpiSession($config, static function (GlpiClient $client, string $session) use ($ticketId, $handler, $actor): array {
                $row = $client->getWithParams('/Ticket/' . $ticketId, $session, ['expand_dropdowns' => 'true']);
                if (!is_array($row) || (int) ($row['id'] ?? 0) !== $ticketId) {
                    return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
                }
                $ticket = RoomTicketsService::fromGlpi($row);
                if ($ticket === null) {
                    return ['ok' => false, 'error' => 'O chamado não pertence à fila de salas.', 'status' => 422];
                }
                $current = (int) ($ticket['statusId'] ?? 0);
                $target = RoomTicketsService::transition('assumir', $current);
                // Already Em andamento: only a claim without owner is allowed.
                if ($target === null && $current === 2) $target = 2;
                if ($target === null) {
                    return ['ok' => false, 'status' => 409,
                        'error' => 'O chamado está ' . self::statusLabel($current) . ' e não pode ser assumido agora.',
                        'meta' => ['currentStatus' => $current, 'currentStatusLabel' => self::statusLabel($current)]];
                }
                $existing = RoomTicketWorkStore::forTicket($ticketId);
                $assignment = is_array($existing['assignment'] ?? null) ? $existing['assignment'] : null;
                $glpiAssignee = RoomTicketsService::assignee($row);
                $owner = self::currentOwner($assignment, $glpiAssignee);
                if ($owner['name'] !== '' && self::matchKey($owner['name']) !== self::matchKey($handler)) {
                    // Another technician already owns it: report, never overwrite.
                    return ['ok' => false, 'status' => 409,
                        'error' => 'Este chamado já está com ' . $owner['name'] . '.',
                        'meta' => ['currentHandler' => $owner['name'], 'currentSource' => $owner['source'],
                            'currentUserId' => $owner['userId'], 'currentStatus' => $current,
                            'currentStatusLabel' => self::statusLabel($current)]];
                }
                if ($assignment !== null && $current === $target) {
                    // Same technician, already in the target status: no new write.
                    return ['ok' => true, 'alreadyAssumed' => true, 'data' => [
                        'ticketId' => $ticketId, 'fromStatus' => $current,
                        'fromStatusLabel' => self::statusLabel($current), 'toStatus' => $target,
                        'toStatusLabel' => self::statusLabel($target), 'handlerName' => $handler,
                        'handlerSource' => (string) ($assignment['source'] ?? 'informado'),
                        'glpiUserId' => (int) ($assignment['glpiUserId'] ?? 0),
                        'glpiUserName' => (string) ($assignment['glpiUserName'] ?? ''),
                        'recordedBy' => self::actor()['name'], 'at' => (string) ($assignment['at'] ?? date(DATE_ATOM)),
                        'work' => RoomTicketWorkStore::summary($existing), 'steps' => [],
                        'confirmed' => true, 'partial' => false,
                    ]];
                }
                $match = $owner['name'] === '' ? self::matchTechnician($client, $session, $handler) : null;
                $applied = self::applyMove($client, $session, $ticketId, 'assumir', $target, [
                    'assignField' => $match === null ? '' : RoomTicketsService::assigneeField($row),
                    'assignUserId' => $match === null ? 0 : (int) $match['id'],
                    'solution' => '',
                ]);
                $written = RoomTicketWorkStore::recordAssignment($ticketId, $ticket, [
                    'handlerName' => $handler,
                    'source' => $match === null ? 'informado' : 'glpi_user',
                    'glpiUserId' => $match === null ? 0 : (int) $match['id'],
                    'glpiUserName' => $match === null ? '' : (string) $match['name'],
                ], $actor);
                RoomTicketWorkStore::recordMove($ticketId, [
                    'action' => 'assumir', 'from' => $current, 'to' => $target,
                    'confirmed' => (bool) $applied['confirmed'], 'partial' => (bool) $applied['partial'],
                    'note' => $match === null ? 'Responsável informado, sem correspondência exata no GLPI.'
                        : 'Responsável atribuído como técnico do GLPI.',
                    'ticket' => $ticket,
                ], $actor);
                // The alert is acknowledged without overwriting an earlier one.
                RoomTicketAcknowledgementStore::accept($ticketId, [
                    'reference' => $ticket['reference'] ?? '', 'openedAt' => $ticket['openedAt'] ?? '',
                ], $actor);
                $data = [
                    'ticketId' => $ticketId,
                    'fromStatus' => $current, 'fromStatusLabel' => self::statusLabel($current),
                    'toStatus' => $target, 'toStatusLabel' => self::statusLabel($target),
                    'handlerName' => $handler,
                    'handlerSource' => $match === null ? 'informado' : 'glpi_user',
                    'glpiUserId' => $match === null ? 0 : (int) $match['id'],
                    'glpiUserName' => $match === null ? '' : (string) $match['name'],
                    'recordedBy' => $actor['name'],
                    'at' => date(DATE_ATOM),
                    'work' => RoomTicketWorkStore::summary($written['result']),
                    'steps' => $applied['steps'],
                    'confirmed' => (bool) $applied['confirmed'],
                    'partial' => (bool) $applied['partial'],
                ];
                if (!$applied['confirmed']) {
                    return ['ok' => false, 'status' => 502, 'data' => $data,
                        'error' => $applied['partial']
                            ? 'O chamado mudou de status, mas parte do registro não foi confirmada no GLPI. Revise o histórico.'
                            : 'O GLPI não confirmou a movimentação. O chamado permanece como estava.'];
                }
                return ['ok' => true, 'data' => $data];
            });
        } catch (RuntimeException $error) {
            $outcome = self::failure($error, 'Não foi possível assumir o chamado. Tente novamente.', 502);
        } catch (Throwable $error) {
            error_log('[room-tickets] Falha ao assumir chamado: ' . get_class($error));
            $outcome = ['ok' => false, 'error' => 'Não foi possível registrar o atendimento. Tente novamente.', 'status' => 500];
        }
        if ($outcome['ok'] && $requestId !== '') {
            RoomTicketWorkStore::rememberRequest($requestId, $ticketId, 'assumir', (array) ($outcome['data'] ?? []));
        }
        self::answer($outcome);
    }

    /**
     * Kanban movement: pendente, retomar, concluir (with solution) or reabrir.
     * "Concluído" means Resolvido; the ticket is never force-closed.
     */
    public static function move(int $ticketId, array $config): void
    {
        Request::rateLimit('room-ticket-move', 60, 60);
        if ($ticketId < 1) {
            Responde::erro('Chamado inválido.', 422);
            return;
        }
        $body = Request::json();
        $action = RoomTicketsService::text(is_scalar($body['action'] ?? null) ? $body['action'] : '');
        if (!isset(RoomTicketsService::TRANSITIONS[$action]) || $action === 'assumir') {
            Responde::erro('Movimentação inválida.', 422);
            return;
        }
        $solution = RoomTicketsService::text(is_scalar($body['solution'] ?? null) ? $body['solution'] : '');
        if ($action === 'concluir' && mb_strlen($solution) < 5) {
            Responde::erro('Descreva como o problema foi resolvido para concluir o chamado.', 422);
            return;
        }
        $requestId = self::requestKey($body);
        $replay = RoomTicketWorkStore::findRequest($requestId);
        if ($replay !== null && (int) ($replay['ticketId'] ?? 0) === $ticketId
            && ($replay['action'] ?? '') === $action) {
            Responde::ok(['data' => self::replayed((array) ($replay['result'] ?? []))]);
            return;
        }
        $actor = self::actor();
        $outcome = ['ok' => false, 'error' => 'Não foi possível mover o chamado. Tente novamente.', 'status' => 500];
        try {
            $outcome = self::withGlpiSession($config, static function (GlpiClient $client, string $session) use ($ticketId, $action, $solution, $actor): array {
                $row = $client->getWithParams('/Ticket/' . $ticketId, $session, ['expand_dropdowns' => 'true']);
                if (!is_array($row) || (int) ($row['id'] ?? 0) !== $ticketId) {
                    return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
                }
                $ticket = RoomTicketsService::fromGlpi($row);
                if ($ticket === null) {
                    return ['ok' => false, 'error' => 'O chamado não pertence à fila de salas.', 'status' => 422];
                }
                $current = (int) ($ticket['statusId'] ?? 0);
                $target = RoomTicketsService::transition($action, $current);
                if ($target === null) {
                    return ['ok' => false, 'status' => 409,
                        'error' => 'Não é possível ' . self::movementLabel($action) . ' um chamado '
                            . self::statusLabel($current) . ' no GLPI.',
                        'meta' => ['currentStatus' => $current, 'currentStatusLabel' => self::statusLabel($current)]];
                }
                $applied = self::applyMove($client, $session, $ticketId, $action, $target, ['solution' => $solution]);
                RoomTicketWorkStore::recordMove($ticketId, [
                    'action' => $action, 'from' => $current, 'to' => $target,
                    'confirmed' => (bool) $applied['confirmed'], 'partial' => (bool) $applied['partial'],
                    'note' => $action === 'concluir' ? $solution : '',
                    'ticket' => $ticket,
                ], $actor);
                if ($action === 'concluir') {
                    $saved = RoomTicketWorkStore::recordSolution($ticketId, [
                        'text' => $solution,
                        'glpiFollowup' => in_array(true, array_column($applied['steps'], 'ok'), true),
                        'ticket' => $ticket,
                    ], $actor);
                    $solutionSaved = is_array($saved['result']['solution'] ?? null);
                } else {
                    $solutionSaved = true;
                }
                $data = [
                    'ticketId' => $ticketId, 'action' => $action,
                    'fromStatus' => $current, 'fromStatusLabel' => self::statusLabel($current),
                    'toStatus' => $target, 'toStatusLabel' => self::statusLabel($target),
                    'solution' => $solution, 'recordedBy' => $actor['name'], 'at' => date(DATE_ATOM),
                    'work' => RoomTicketWorkStore::summary(RoomTicketWorkStore::forTicket($ticketId) ?? []),
                    'steps' => $applied['steps'],
                    'confirmed' => (bool) $applied['confirmed'],
                    'partial' => (bool) $applied['partial'],
                ];
                if (!$applied['confirmed'] || !$solutionSaved) {
                    return ['ok' => false, 'status' => 502, 'data' => $data,
                        'error' => $applied['confirmed'] && !$solutionSaved
                            ? 'O status foi alterado no GLPI, mas a solução não ficou registrada no GCC.'
                            : 'O GLPI não confirmou a movimentação. O chamado permanece como estava.'];
                }
                return ['ok' => true, 'data' => $data];
            });
        } catch (RuntimeException $error) {
            $outcome = self::failure($error, 'Não foi possível mover o chamado. Tente novamente.', 502);
        } catch (Throwable $error) {
            error_log('[room-tickets] Falha ao mover chamado: ' . get_class($error));
            $outcome = ['ok' => false, 'error' => 'Não foi possível registrar a movimentação. Tente novamente.', 'status' => 500];
        }
        if ($outcome['ok'] && $requestId !== '') {
            RoomTicketWorkStore::rememberRequest($requestId, $ticketId, $action, (array) ($outcome['data'] ?? []));
        }
        self::answer($outcome);
    }

    /** Consultation of the GCC record: movements, handler, solution and acceptance. */
    public static function historico(int $ticketId): void
    {
        header('Cache-Control: no-store');
        Request::rateLimit('room-ticket-history', 120, 60);
        if ($ticketId < 1) {
            Responde::erro('Chamado inválido.', 422);
            return;
        }
        Responde::ok(['data' => RoomTicketWorkStore::history($ticketId) + ['checkedAt' => date(DATE_ATOM)]]);
    }

    /**
     * GLPI technicians for the "Assumir chamado" selector. When the list cannot
     * be read the form still works with free text: availability is explicit.
     */
    public static function responsaveis(array $config): void
    {
        header('Cache-Control: no-store');
        Request::rateLimit('room-ticket-technicians', 30, 60);
        $fallback = ['available' => false, 'technicians' => [], 'message' => 'Lista de técnicos indisponível. Informe o nome.'];
        try {
            $result = self::withGlpiSession($config, static function (GlpiClient $client, string $session): array {
                $users = $client->getWithParams('/User', $session, [
                    'is_technician' => '1', 'range' => '0-199', 'expand_dropdowns' => 'false', 'sort' => 'name',
                ]);
                $rows = [];
                foreach (is_array($users) ? $users : [] as $user) {
                    if (!is_array($user) || !isset($user['id'])) continue;
                    if (array_key_exists('is_technician', $user) && (int) $user['is_technician'] !== 1) continue;
                    $name = RoomTicketsService::text($user['name'] ?? '');
                    if ($name === '') continue;
                    $rows[] = ['id' => (int) $user['id'], 'name' => $name];
                }
                usort($rows, static fn($a, $b) => strnatcasecmp($a['name'], $b['name']) ?: ($a['id'] <=> $b['id']));
                return ['available' => true, 'technicians' => $rows, 'message' => ''];
            });
        } catch (RuntimeException $error) {
            if ((int) ($error->http_code ?? 0) === 403) {
                $fallback['message'] = 'Seu acesso não permite listar os técnicos do GLPI. Informe o nome.';
                Responde::ok(['data' => $fallback]);
                return;
            }
            $result = $fallback;
        } catch (Throwable $error) {
            error_log('[room-tickets] Falha ao listar técnicos: ' . get_class($error));
            $result = $fallback;
        }
        Responde::ok(['data' => $result + ['checkedAt' => date(DATE_ATOM)]]);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static function actor(): array
    {
        return [
            'name' => RoomTicketsService::text(PermissionMiddleware::getUserName() ?? ''),
            'email' => RoomTicketsService::text(PermissionMiddleware::getUserEmail() ?? ''),
        ];
    }

    private static function requestKey(array $body): string
    {
        $requestId = RoomTicketsService::text(is_scalar($body['requestId'] ?? null) ? $body['requestId'] : '');
        return preg_match('/^[A-Za-z0-9._-]{8,64}$/', $requestId) === 1 ? $requestId : '';
    }

    private static function replayed(array $result): array
    {
        return $result + ['replayed' => true];
    }

    private static function currentOwner(?array $assignment, array $glpiAssignee): array
    {
        if (is_array($assignment) && ($assignment['handlerName'] ?? '') !== '') {
            return ['name' => (string) $assignment['handlerName'], 'source' => 'gcc',
                'userId' => (int) ($assignment['glpiUserId'] ?? 0)];
        }
        if ((int) ($glpiAssignee['userId'] ?? 0) > 0 || ($glpiAssignee['name'] ?? '') !== '') {
            return ['name' => (string) ($glpiAssignee['name'] ?? ''), 'source' => 'glpi',
                'userId' => (int) ($glpiAssignee['userId'] ?? 0)];
        }
        return ['name' => '', 'source' => '', 'userId' => 0];
    }

    private static function statusLabel(int $statusId): string
    {
        $labels = [
            1 => 'Novo', 2 => 'Em atendimento', 3 => 'Planejado',
            4 => 'Pendente', 5 => 'Resolvido', 6 => 'Fechado',
        ];
        return $labels[$statusId] ?? 'em status desconhecido';
    }

    private static function movementLabel(string $action): string
    {
        $labels = [
            'pendente' => 'marcar como pendente', 'retomar' => 'retomar',
            'concluir' => 'concluir', 'reabrir' => 'reabrir',
        ];
        return $labels[$action] ?? $action;
    }

    /** Upstream failures never expose GLPI payloads, tokens or messages. */
    private static function failure(RuntimeException $error, string $message, int $status): array
    {
        $httpCode = (int) ($error->http_code ?? 0);
        if ($httpCode === 404) {
            return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
        }
        if ($httpCode === 403) {
            return ['ok' => false, 'error' => 'O GLPI recusou a alteração deste chamado.', 'status' => 403];
        }
        if ($httpCode === 400 || $httpCode === 422) {
            return ['ok' => false, 'status' => 422,
                'error' => 'O GLPI recusou a alteração: dados ou transição inválida para este chamado.'];
        }
        error_log('[room-tickets] Falha ao gravar no GLPI: ' . get_class($error));
        return ['ok' => false, 'error' => $message, 'status' => $status];
    }

    /** Sends the response only after the GLPI session has been closed. */
    private static function answer(array $outcome): void
    {
        $data = is_array($outcome['data'] ?? null) ? $outcome['data'] : [];
        $meta = is_array($outcome['meta'] ?? null) ? $outcome['meta'] : [];
        if ($outcome['ok']) {
            Responde::ok(['data' => $data], (int) ($outcome['status'] ?? 200));
            return;
        }
        Responde::erro((string) $outcome['error'], (int) ($outcome['status'] ?? 500), $meta + $data);
    }
}
