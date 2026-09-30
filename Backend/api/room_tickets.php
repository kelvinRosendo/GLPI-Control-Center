<?php
declare(strict_types=1);
require_once __DIR__ . '/services/RoomTicketsService.php';
require_once __DIR__ . '/services/RoomTicketsReader.php';
require_once __DIR__ . '/services/RoomTicketAcknowledgementStore.php';
require_once __DIR__ . '/services/RoomTicketWorkStore.php';
require_once __DIR__ . '/services/RoomTicketsGlpi.php';

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
            // Responsáveis vêm dos ATORES do GLPI (uma leitura da relação), não
            // de `users_id_recipient`, que é o autor do chamado.
            $actors = RoomTicketsGlpi::readActorIndex($client, $session);
            $normalized = RoomTicketsService::normalize($tickets, $locations, $categories, $links, $assets, $actors['index']);
            $result = RoomTicketsService::aggregate($normalized['items'], $filters);
            $warnings = [];
            if ($restrictedLookups) $warnings[] = 'O GLPI restringe os cadastros de locais ou categorias. Os nomes foram consultados nos próprios chamados.';
            if (!$assets && $tickets) $warnings[] = 'Nomes e patrimônios de ativos indisponíveis no cache. Os vínculos são exibidos por tipo e ID.';
            if ($normalized['invalidDates']) $warnings[] = 'Há chamados com data inválida que não puderam ser contados.';
            if ($tickets && !$actors['available']) $warnings[] = 'Responsáveis do GLPI indisponíveis nesta consulta (' . $actors['reason'] . ') O responsável mostrado é o registrado no GCC.';
            if ($actors['available'] && $actors['reason'] !== '') $warnings[] = $actors['reason'];
            $result = RoomTicketAcknowledgementStore::attach($result);
            $result = self::attachWork($result);
            $result['meta'] = [
                'collectedAt' => date(DATE_ATOM), 'complete' => $normalized['invalidDates'] === 0,
                'warnings' => $warnings, 'source' => 'GLPI',
                'assetNamesSource' => 'cache GCC (pode estar desatualizado)',
                'scope' => 'Salas, laboratórios, biblioteca e auditório identificados no chamado; referências L- sem sala entram para revisão.',
                'limitPerCollection' => 10000,
                'restrictedLookups' => $restrictedLookups,
                'glpiAssigneesAvailable' => (bool) $actors['available'],
                'contract' => [
                    'glpiMajor' => 10,
                    'assigneeSource' => 'CommonITILActor type=ASSIGN (' . RoomTicketsGlpi::ACTORS_ITEMTYPE . ')',
                    'solutionSource' => RoomTicketsGlpi::SOLUTION_ITEMTYPE,
                    'realInstanceValidated' => false,
                ],
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
            $row = RoomTicketsGlpi::readTicket($client, $session, $ticketId);
            if ($row === []) {
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
            self::logFailure('Falha ao registrar aceite', $error);
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
     * Correspondência exata de um técnico do GLPI. Nunca atribui por
     * semelhança de nome: um nome desconhecido, ambíguo ou fora da lista fica
     * como "informado" e nenhum usuário é inventado.
     */
    private static function matchTechnician(GlpiClient $client, string $session, string $name): ?array
    {
        $wanted = self::matchKey($name);
        if ($wanted === '') return null;
        $users = RoomTicketsGlpi::optionalTechnicians($client, $session);
        $found = [];
        foreach ($users as $user) {
            if (self::matchKey((string) $user['name']) !== $wanted) continue;
            $found[(int) $user['id']] = (string) $user['name'];
        }
        // Nome ambíguo: dois ou mais usuários do GLPI com o mesmo nome exato.
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
     * Aplica uma movimentação e confirma o resultado RELENDO o GLPI.
     *
     * Cada passo é persistido como aconteceu — inclusive quando falha. Um
     * sucesso parcial nunca é reportado como sucesso completo, e a resposta diz
     * exatamente o que foi aplicado e o que não foi.
     *
     * @return array{steps: array, confirmed: bool, partial: bool, applied: array}
     */
    private static function applyMove(GlpiClient $client, string $session, int $ticketId,
        string $action, int $toStatus, array $plan): array
    {
        $steps = [];
        $applied = [];
        $solutionType = $plan['solutionType'] ?? null;
        $solution = trim((string) ($plan['solution'] ?? ''));

        // ── Etapa 1: status ────────────────────────────────────────────────
        // A gravação de status e a atribuição do técnico (quando pedida) vão na
        // MESMA requisição: uma escrita por movimentação.
        $input = ['status' => $toStatus];
        if ($plan['assign'] ?? null) $input += $plan['assign'];
        $client->put('/Ticket/' . $ticketId, $session, ['input' => $input]);
        $applied['status'] = true;
        $after = RoomTicketsGlpi::readTicket($client, $session, $ticketId);
        $observedStatus = $after === [] ? 0 : RoomTicketsService::statusId($after);
        $steps[] = ['step' => 'status', 'ok' => $observedStatus === $toStatus,
            'expected' => $toStatus, 'observed' => $observedStatus,
            'label' => 'Status no GLPI'];
        $statusOk = $observedStatus === $toStatus;
        if (!$statusOk) $applied['status'] = false;

        // ── Etapa 2: atribuição do técnico pelos atores ───────────────────
        if ($plan['assign'] ?? null) {
            $expectedId = (int) ($plan['assignUserId'] ?? 0);
            $actors = RoomTicketsGlpi::readActors($client, $session, $ticketId);
            $assignee = RoomTicketsGlpi::assignee($actors, $plan['userNames'] ?? []);
            $assignOk = $assignee['userId'] === $expectedId;
            $steps[] = ['step' => 'atribuicao', 'ok' => $assignOk, 'expected' => $expectedId,
                'observed' => $assignee['userId'], 'label' => 'Técnico responsável no GLPI'];
            $applied['assign'] = $assignOk;
        }

        // ── Etapa 3: solução formal (ITILSolution) ────────────────────────
        if ($solution !== '') {
            $content = '<p>' . htmlspecialchars($solution, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
            try {
                $client->post('/' . RoomTicketsGlpi::SOLUTION_ITEMTYPE, $session,
                    ['input' => RoomTicketsGlpi::solutionInput($ticketId, $content, (int) ($solutionType['id'] ?? 0))]);
                $applied['solution'] = true;
            } catch (Throwable $error) {
                self::logFailure('Solução não registrada no GLPI', $error);
                $applied['solution'] = false;
                $steps[] = ['step' => 'solucao', 'ok' => false, 'label' => 'Solução registrada no GLPI'];
            }
            if ($applied['solution'] ?? false) {
                // Confirmar pela releitura, e não pelo-code-de-retorno da escrita.
                try {
                    $solutions = RoomTicketsGlpi::readSolutions($client, $session, $ticketId);
                    $mine = false;
                    foreach ($solutions as $row) {
                        if (RoomTicketsService::text(strip_tags((string) ($row['content'] ?? ''))) === $solution) {
                            $mine = true;
                            break;
                        }
                    }
                    $steps[] = ['step' => 'solucao_confirmada', 'ok' => $mine,
                        'label' => 'Solução confirmada pela releitura do GLPI'];
                    $applied['solution'] = $mine;
                } catch (Throwable $error) {
                    $steps[] = ['step' => 'solucao_confirmada', 'ok' => false,
                        'label' => 'Solução confirmada pela releitura do GLPI'];
                    $applied['solution'] = false;
                }
                // A solução no GLPI pode levar o status a Resolvido ou Fechado
                // conforme `autoclose_delay` da entidade. O status observado
                // depois da solução é o que vale.
                $final = RoomTicketsGlpi::readTicket($client, $session, $ticketId);
                $finalStatus = $final === [] ? 0 : RoomTicketsService::statusId($final);
                $steps[] = ['step' => 'status_final', 'ok' => in_array($finalStatus, [5, 6], true),
                    'expected' => 5, 'observed' => $finalStatus,
                    'label' => 'Status final do chamado'];
                $statusOk = $statusOk || in_array($finalStatus, [5, 6], true);
                $observedStatus = $finalStatus;
            }
        }

        $confirmed = true;
        foreach ($steps as $step) if (!$step['ok']) $confirmed = false;
        return ['steps' => $steps, 'confirmed' => $confirmed,
            'partial' => !$confirmed && $statusOk, 'applied' => $applied,
            'observedStatus' => $observedStatus];
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
        $actor = self::actor();
        $fingerprint = self::fingerprint(['action' => 'assumir', 'ticket' => $ticketId, 'handler' => $handler]);
        $outcome = ['ok' => false, 'error' => 'Não foi possível assumir o chamado. Tente novamente.', 'status' => 500];

        // Serializa a sequência verificação→gravação entre requisições do GCC.
        // Um lock por chamado impede dois técnicos do GCC de assumirem o mesmo
        // chamado ao mesmo tempo sem que nenhum dos dois veja o resultado.
        try {
            $outcome = RoomTicketWorkStore::withTicketLock($ticketId, static function () use (
                $config, $ticketId, $handler, $requestId, $actor, $fingerprint
            ): array {
                $replay = self::replayable($requestId, $ticketId, 'assumir', $fingerprint, $actor);
                if ($replay !== null) return $replay;
                return self::withGlpiSession($config, static function (GlpiClient $client, string $session)
                    use ($ticketId, $handler, $actor, $requestId): array {
                    $row = RoomTicketsGlpi::readTicket($client, $session, $ticketId);
                    if ($row === []) {
                        return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
                    }
                    $ticket = RoomTicketsService::fromGlpi($row);
                    if ($ticket === null) {
                        return ['ok' => false, 'error' => 'O chamado não pertence à fila de salas.', 'status' => 422];
                    }
                    $current = self::currentStatus($row, $ticket);
                    $target = RoomTicketsService::transition('assumir', $current);
                    // Já está em atendimento: só vale registrar quem assume.
                    if ($target === null && $current === 2) $target = 2;
                    if ($target === null) {
                        return ['ok' => false, 'status' => 409,
                            'error' => 'O chamado está ' . RoomTicketsService::statusLabel($current)
                                . ' e não pode ser assumido agora.',
                            'meta' => ['currentStatus' => $current,
                                'currentStatusLabel' => RoomTicketsService::statusLabel($current),
                                'allowedActions' => RoomTicketsService::availableActions($current)]];
                    }
                    // Responsável atual: registro do GCC e ator ASSIGN do GLPI.
                    $actorRows = RoomTicketsGlpi::readActors($client, $session, $ticketId);
                    $glpiOwner = RoomTicketsGlpi::assignee($actorRows, RoomTicketsGlpi::nameIndex(
                        RoomTicketsGlpi::optionalTechnicians($client, $session)));
                    $existing = RoomTicketWorkStore::forTicket($ticketId);
                    $assignment = is_array($existing['assignment'] ?? null) ? $existing['assignment'] : null;
                    $owner = self::currentOwner($assignment, $glpiOwner);
                    if ($owner['name'] !== '' && self::matchKey($owner['name']) !== self::matchKey($handler)) {
                        // Outro técnico já é o responsável: informar, nunca sobrescrever.
                        return ['ok' => false, 'status' => 409,
                            'error' => 'Este chamado já está com ' . $owner['name'] . '.',
                            'meta' => ['currentHandler' => $owner['name'], 'currentSource' => $owner['source'],
                                'currentUserId' => $owner['userId'], 'currentStatus' => $current,
                                'currentStatusLabel' => RoomTicketsService::statusLabel($current),
                                'allowedActions' => RoomTicketsService::availableActions($current)]];
                    }
                    $match = $owner['name'] === '' ? self::matchTechnician($client, $session, $handler) : null;
                    if ($assignment !== null && $current === $target
                        && self::matchKey((string) ($assignment['handlerName'] ?? '')) === self::matchKey($handler)) {
                        // Mesmo técnico, já no status de destino: nada a gravar.
                        return ['ok' => true, 'data' => [
                            'alreadyAssumed' => true,
                            'ticketId' => $ticketId, 'fromStatus' => $current,
                            'fromStatusLabel' => RoomTicketsService::statusLabel($current),
                            'toStatus' => $target, 'toStatusLabel' => RoomTicketsService::statusLabel($target),
                            'handlerName' => $handler,
                            'handlerSource' => (string) ($assignment['source'] ?? 'informado'),
                            'glpiUserId' => (int) ($assignment['glpiUserId'] ?? 0),
                            'glpiUserName' => (string) ($assignment['glpiUserName'] ?? ''),
                            'recordedBy' => self::actor()['name'],
                            'at' => (string) ($assignment['at'] ?? date(DATE_ATOM)),
                            'work' => RoomTicketWorkStore::summary($existing), 'steps' => [],
                            'applied' => [], 'confirmed' => true, 'partial' => false,
                        ]];
                    }
                    $userNames = RoomTicketsGlpi::nameIndex(RoomTicketsGlpi::optionalTechnicians($client, $session));
                    $plan = ['solution' => '', 'userNames' => $userNames, 'assign' => null, 'assignUserId' => 0];
                    if ($match !== null) {
                        $plan['assign'] = RoomTicketsGlpi::assignInput($actorRows, (int) $match['id']);
                        $plan['assignUserId'] = (int) $match['id'];
                    }
                    $applied = self::applyMove($client, $session, $ticketId, 'assumir', $target, $plan);
                    $written = RoomTicketWorkStore::recordAssignment($ticketId, $ticket, [
                        'handlerName' => $handler,
                        'source' => $match === null ? 'informado' : 'glpi_user',
                        'glpiUserId' => $match === null ? 0 : (int) $match['id'],
                        'glpiUserName' => $match === null ? '' : (string) $match['name'],
                    ], $actor);
                    $stored = is_array($written['result']['assignment'] ?? null) ? $written['result']['assignment'] : null;
                    // created:false = outro técnico registrou primeiro enquanto esta
                    // requisição estava em voo. O registro do servidor é o dono.
                    if ($written['created'] === false && $stored !== null
                        && self::matchKey((string) $stored['handlerName']) !== self::matchKey($handler)) {
                        RoomTicketWorkStore::recordMove($ticketId, [
                            'action' => 'assumir', 'from' => $current, 'to' => $target,
                            'confirmed' => (bool) $applied['confirmed'], 'partial' => false,
                            'note' => 'Conflito: ' . (string) $stored['handlerName'] . ' registrou primeiro.',
                            'ticket' => $ticket,
                        ], $actor);
                        return ['ok' => false, 'status' => 409,
                            'error' => 'Este chamado já está com ' . (string) $stored['handlerName'] . '.',
                            'meta' => ['currentHandler' => (string) $stored['handlerName'],
                                'currentSource' => (string) ($stored['source'] ?? 'gcc'),
                                'currentUserId' => (int) ($stored['glpiUserId'] ?? 0),
                                'currentStatus' => $applied['observedStatus'],
                                'currentStatusLabel' => RoomTicketsService::statusLabel((int) $applied['observedStatus'])]];
                    }
                    RoomTicketWorkStore::recordMove($ticketId, [
                        'action' => 'assumir', 'from' => $current, 'to' => $target,
                        'confirmed' => (bool) $applied['confirmed'], 'partial' => (bool) $applied['partial'],
                        'note' => $match === null
                            ? 'Responsável informado, sem correspondência exata no GLPI.'
                            : 'Responsável atribuído como técnico do GLPI (ator ASSIGN).',
                        'ticket' => $ticket,
                    ], $actor, $requestId);
                    // O alerta é reconhecido sem sobrescrever um aceite anterior.
                    RoomTicketAcknowledgementStore::accept($ticketId, [
                        'reference' => $ticket['reference'] ?? '', 'openedAt' => $ticket['openedAt'] ?? '',
                    ], $actor);
                    $data = [
                        'ticketId' => $ticketId,
                        'fromStatus' => $current, 'fromStatusLabel' => RoomTicketsService::statusLabel($current),
                        'toStatus' => $target, 'toStatusLabel' => RoomTicketsService::statusLabel($target),
                        'handlerName' => (string) ($stored['handlerName'] ?? $handler),
                        'handlerSource' => (string) ($stored['source'] ?? 'informado'),
                        'glpiUserId' => (int) ($stored['glpiUserId'] ?? 0),
                        'glpiUserName' => (string) ($stored['glpiUserName'] ?? ''),
                        'recordedBy' => $actor['name'],
                        'at' => (string) ($stored['at'] ?? date(DATE_ATOM)),
                        'work' => RoomTicketWorkStore::summary($written['result']),
                        'steps' => $applied['steps'], 'applied' => $applied['applied'],
                        'confirmed' => (bool) $applied['confirmed'],
                        'partial' => (bool) $applied['partial'],
                    ];
                    if (!$applied['confirmed']) {
                        return ['ok' => false, 'status' => 502, 'data' => $data,
                            'error' => $applied['partial']
                                ? 'O chamado mudou de status no GLPI, mas parte do registro não foi confirmada. Revise o histórico antes de repetir.'
                                : 'O GLPI não confirmou a movimentação. Nada foi alterado.'];
                    }
                    return ['ok' => true, 'data' => $data];
                });
            });
        } catch (RuntimeException $error) {
            $outcome = self::failure($error, 'Não foi possível assumir o chamado. Tente novamente.', 502);
        } catch (Throwable $error) {
            self::logFailure('Falha ao assumir chamado', $error);
            $outcome = ['ok' => false, 'error' => 'Não foi possível registrar o atendimento. Tente novamente.', 'status' => 500];
        }
        // A intenção fica registrada mesmo quando falhou: um reenvio da MESMA
        // operação devolve o primeiro desfecho em vez de repetir a escrita.
        if ($requestId !== '' && ($outcome['ok'] || is_array($outcome['data'] ?? null))) {
            RoomTicketWorkStore::rememberRequest($requestId, $ticketId, 'assumir', $fingerprint, $actor, $outcome);
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
        $actor = self::actor();
        $fingerprint = self::fingerprint(['action' => $action, 'ticket' => $ticketId, 'solution' => $solution]);
        $outcome = ['ok' => false, 'error' => 'Não foi possível mover o chamado. Tente novamente.', 'status' => 500];
        try {
            $outcome = RoomTicketWorkStore::withTicketLock($ticketId, static function () use (
                $config, $ticketId, $action, $solution, $requestId, $actor, $fingerprint
            ): array {
                $replay = self::replayable($requestId, $ticketId, $action, $fingerprint, $actor);
                if ($replay !== null) return $replay;
                return self::withGlpiSession($config, static function (GlpiClient $client, string $session)
                    use ($ticketId, $action, $solution, $actor, $requestId): array {
                    $row = RoomTicketsGlpi::readTicket($client, $session, $ticketId);
                    if ($row === []) {
                        return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
                    }
                    $ticket = RoomTicketsService::fromGlpi($row);
                    if ($ticket === null) {
                        return ['ok' => false, 'error' => 'O chamado não pertence à fila de salas.', 'status' => 422];
                    }
                    $current = self::currentStatus($row, $ticket);
                    $target = RoomTicketsService::transition($action, $current);
                    if ($target === null) {
                        return ['ok' => false, 'status' => 409,
                            'error' => 'Não é possível ' . self::movementLabel($action) . ' um chamado '
                                . RoomTicketsService::statusLabel($current) . ' no GLPI.',
                            'meta' => ['currentStatus' => $current,
                                'currentStatusLabel' => RoomTicketsService::statusLabel($current),
                                'allowedActions' => RoomTicketsService::availableActions($current)]];
                    }
                    $plan = ['solution' => ''];
                    if ($action === 'concluir') {
                        $type = RoomTicketsGlpi::solutionTypeId($client, $session);
                        if ($type['id'] === 0 && $type['ambiguous']) {
                            // Mais de um tipo de solução e nenhum configurado: pedir
                            // configuração em vez de chutar um ID do GLPI.
                            return ['ok' => false, 'status' => 422,
                                'error' => 'A conclusão precisa de um tipo de solução configurado no GLPI.'
                                    . ' Tipos disponíveis: ' . $type['name'] . '.',
                                'meta' => ['reason' => 'solution_type_required']];
                        }
                        $plan = ['solution' => $solution, 'solutionType' => $type];
                    }
                    $applied = self::applyMove($client, $session, $ticketId, $action, $target, $plan);
                    RoomTicketWorkStore::recordMove($ticketId, [
                        'action' => $action, 'from' => $current, 'to' => $target,
                        'confirmed' => (bool) $applied['confirmed'], 'partial' => (bool) $applied['partial'],
                        'note' => $action === 'concluir' ? $solution : '',
                        'ticket' => $ticket,
                    ], $actor, $requestId);
                    $solutionSaved = true;
                    if ($action === 'concluir') {
                        // `solution.glpi` reflete ESPECIFICAMENTE a etapa do GLPI,
                        // nunca "algum passo deu certo".
                        $saved = RoomTicketWorkStore::recordSolution($ticketId, [
                            'text' => $solution,
                            'glpi' => (bool) ($applied['applied']['solution'] ?? false),
                            'glpiFollowup' => false,
                            'ticket' => $ticket,
                        ], $actor, $requestId);
                        $solutionSaved = is_array($saved['result']['solution'] ?? null);
                    }
                    $data = [
                        'ticketId' => $ticketId, 'action' => $action,
                        'fromStatus' => $current, 'fromStatusLabel' => RoomTicketsService::statusLabel($current),
                        'toStatus' => $applied['observedStatus'] ?: $target,
                        'toStatusLabel' => RoomTicketsService::statusLabel((int) ($applied['observedStatus'] ?: $target)),
                        'solution' => $solution, 'recordedBy' => $actor['name'], 'at' => date(DATE_ATOM),
                        'work' => RoomTicketWorkStore::summary(RoomTicketWorkStore::forTicket($ticketId) ?? []),
                        'steps' => $applied['steps'], 'applied' => $applied['applied'],
                        'confirmed' => (bool) $applied['confirmed'],
                        'partial' => (bool) $applied['partial'],
                    ];
                    if (!$applied['confirmed'] || !$solutionSaved) {
                        $message = 'Nada foi alterado no GLPI.';
                        if ($applied['partial']) {
                            $message = 'O status mudou no GLPI, mas a solução não ficou registrada.'
                                . ' Confira o histórico do chamado antes de repetir.';
                        } elseif ($applied['applied']['status'] ?? false) {
                            $message = 'O GLPI aplicou parte da alteração. Confira o histórico antes de repetir.';
                        }
                        return ['ok' => false, 'status' => 502, 'data' => $data, 'error' => $message];
                    }
                    return ['ok' => true, 'data' => $data];
                });
            });
        } catch (RuntimeException $error) {
            $outcome = self::failure($error, 'Não foi possível mover o chamado. Tente novamente.', 502);
        } catch (Throwable $error) {
            self::logFailure('Falha ao mover chamado', $error);
            $outcome = ['ok' => false, 'error' => 'Não foi possível registrar a movimentação. Tente novamente.', 'status' => 500];
        }
        if ($requestId !== '' && ($outcome['ok'] || is_array($outcome['data'] ?? null))) {
            RoomTicketWorkStore::rememberRequest($requestId, $ticketId, $action, $fingerprint, $actor, $outcome);
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
                $rows = RoomTicketsGlpi::readTechnicians($client, $session);
                if (!$rows) {
                    return ['available' => false, 'technicians' => [],
                        'message' => 'Nenhum técnico encontrado no GLPI. Informe o nome.'];
                }
                return ['available' => true, 'technicians' => $rows, 'message' => ''];
            });
        } catch (RuntimeException $error) {
            if ((int) ($error->http_code ?? 0) === 403) {
                $fallback['message'] = 'Seu acesso não permite listar os técnicos do GLPI. Informe o nome.';
                Responde::ok(['data' => $fallback + ['checkedAt' => date(DATE_ATOM)]]);
                return;
            }
            $result = $fallback;
        } catch (Throwable $error) {
            self::logFailure('Falha ao listar técnicos', $error);
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

    /**
     * Log de diagnóstico. Falhas do GLPI (RuntimeException) registram apenas a
     * classe, porque a mensagem pode conter o corpo da resposta do GLPI.
     * Erros de programação (TypeError, Error) registram também a mensagem,
     * porque sãoOur bug e precisam ser encontrados.
     */
    private static function logFailure(string $context, Throwable $error): void
    {
        $suffix = $error instanceof RuntimeException ? '' : ' — ' . $error->getMessage();
        error_log('[room-tickets] ' . $context . ': ' . get_class($error) . $suffix);
    }

    private static function requestKey(array $body): string
    {
        $requestId = RoomTicketsService::text(is_scalar($body['requestId'] ?? null) ? $body['requestId'] : '');
        return preg_match('/^[A-Za-z0-9._-]{8,64}$/', $requestId) === 1 ? $requestId : '';
    }

    /**
     * Impressão digital da intenção. O servidor vincula o requestId ao autor,
     * chamado, ação e conteúdo: reenviar a MESMA intenção devolve o primeiro
     * desfecho; reutilizar o identificador para outra operação é recusado, em
     * vez de devolver um resultado antigo como se fosse novo.
     */
    private static function fingerprint(array $parts): string
    {
        ksort($parts);
        return hash('sha256', (string) json_encode($parts, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Devolve o desfecho registrado quando é realmente o mesmo reenvio.
     * `null` significa "execute de novo".
     */
    private static function replayable(string $requestId, int $ticketId, string $action,
        string $fingerprint, array $actor): ?array
    {
        $replay = RoomTicketWorkStore::findRequest($requestId);
        if ($replay === null) return null;
        if ((int) ($replay['ticketId'] ?? 0) !== $ticketId || ($replay['action'] ?? '') !== $action) {
            return ['ok' => false, 'status' => 409,
                'error' => 'Este identificador de operação já foi usado em outro chamado ou outra ação.',
                'meta' => ['reason' => 'requestId_reused']];
        }
        if ((string) ($replay['fingerprint'] ?? '') !== $fingerprint) {
            return ['ok' => false, 'status' => 409,
                'error' => 'Este identificador de operação já foi usado com outro conteúdo.',
                'meta' => ['reason' => 'requestId_content_mismatch']];
        }
        if ((string) ($replay['actor'] ?? '') !== (string) ($actor['email'] ?? $actor['name'] ?? '')) {
            return ['ok' => false, 'status' => 409,
                'error' => 'Este identificador de operação pertence a outro usuário.',
                'meta' => ['reason' => 'requestId_other_user']];
        }
        $stored = is_array($replay['outcome'] ?? null) ? $replay['outcome'] : null;
        if ($stored === null) return null;
        $stored['data'] = ((array) ($stored['data'] ?? [])) + ['replayed' => true];
        return $stored;
    }

    /**
     * Status atual do chamado, lido do REGISTRO CRU (onde o GLPI devolve
     * inteiro) e conferido contra o status da normalização. Se os dois
     * divergirem, nenhuma transição é tentada.
     */
    private static function currentStatus(array $row, array $normalized): int
    {
        $raw = RoomTicketsService::statusId($row);
        $projected = (int) ($normalized['statusId'] ?? -1);
        if ($projected !== $raw) {
            throw new ContractException('A leitura do status do chamado ficou inconsistente.');
        }
        return $raw;
    }

    private static function currentOwner(?array $assignment, array $glpiAssignee): array
    {        if (is_array($assignment) && ($assignment['handlerName'] ?? '') !== '') {
            return ['name' => (string) $assignment['handlerName'], 'source' => 'gcc',
                'userId' => (int) ($assignment['glpiUserId'] ?? 0)];
        }
        if ((int) ($glpiAssignee['userId'] ?? 0) > 0 || ($glpiAssignee['name'] ?? '') !== '') {
            return ['name' => (string) ($glpiAssignee['name'] ?? ''), 'source' => 'glpi',
                'userId' => (int) ($glpiAssignee['userId'] ?? 0)];
        }
        return ['name' => '', 'source' => '', 'userId' => 0];
    }

    private static function movementLabel(string $action): string
    {
        return RoomTicketsService::ACTION_LABELS[$action] ?? $action;
    }

    /** Upstream failures never expose GLPI payloads, tokens or messages. */
    private static function failure(RuntimeException $error, string $message, int $status): array
    {
        // Resposta do GLPI em formato inesperado: dizer isso é melhor do que
        // recusar toda movimentação com uma mensagem genérica.
        if ($error instanceof ContractException) {
            return ['ok' => false, 'error' => $error->getMessage(), 'status' => 502,
                'meta' => ['reason' => 'glpi_contract']];
        }
        $httpCode = (int) ($error->http_code ?? 0);
        if ($httpCode === 404) {
            return ['ok' => false, 'error' => 'Chamado não encontrado.', 'status' => 404];
        }
        if ($httpCode === 403) {
            return ['ok' => false, 'status' => 403,
                'error' => 'Sua conta não pode alterar este chamado no GLPI.'];
        }
        if ($httpCode === 400 || $httpCode === 422) {
            return ['ok' => false, 'status' => 422,
                'error' => 'O GLPI recusou a alteração: dados ou transição inválida para este chamado.'];
        }
        self::logFailure('Falha ao gravar no GLPI', $error);
        return ['ok' => false, 'error' => $message, 'status' => $status];
    }

    /**
     * Envia a resposta só depois de a sessão do GLPI estar encerrada.
     * Em erro, os metadados vêm em `meta` (conflito, falha parcial, passos) e a
     * interface consegue explicar o que aconteceu em vez de mostrar "HTTP 502".
     */
    private static function answer(array $outcome): void
    {
        $data = is_array($outcome['data'] ?? null) ? $outcome['data'] : [];
        $meta = is_array($outcome['meta'] ?? null) ? $outcome['meta'] : [];
        $status = (int) ($outcome['status'] ?? 0);
        if ($outcome['ok']) {
            // Metadados de erro nunca convivem com um sucesso.
            unset($data['partial'], $data['steps'], $data['applied'], $data['confirmed']);
            Responde::ok(['data' => $data], $status === 0 ? 200 : $status);
            return;
        }
        $meta += ['status' => $status === 0 ? 500 : $status, 'ok' => false];
        if (is_array($data) && $data !== []) $meta['data'] = $data;
        Responde::erro((string) $outcome['error'], $status === 0 ? 500 : $status, $meta);
    }
}
