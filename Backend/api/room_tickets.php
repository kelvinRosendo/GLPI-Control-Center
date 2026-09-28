<?php
declare(strict_types=1);
require_once __DIR__ . '/services/RoomTicketsService.php';
require_once __DIR__ . '/services/RoomTicketsReader.php';
require_once __DIR__ . '/services/RoomTicketAcknowledgementStore.php';

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

        $client = new GlpiClient($config['glpi'] ?? []);
        $session = null;
        try {
            $session = $client->initSession();
            $row = $client->getWithParams('/Ticket/' . $ticketId, $session, ['expand_dropdowns' => 'true']);
            if (!is_array($row) || (int) ($row['id'] ?? 0) !== $ticketId) {
                Responde::erro('Chamado não encontrado.', 404);
                return;
            }
            $ticket = RoomTicketsService::fromGlpi($row);
            if ($ticket === null) {
                Responde::erro('O chamado não pertence à fila de salas.', 422);
                return;
            }
            if (!RoomTicketsService::isAlertEligible($ticket)) {
                Responde::erro('O chamado não está mais em aberto.', 422);
                return;
            }
            $entry = RoomTicketAcknowledgementStore::accept($ticketId, [
                'reference' => $ticket['reference'],
                'openedAt' => $ticket['openedAt'],
            ], [
                'name' => PermissionMiddleware::getUserName() ?? '',
                'email' => PermissionMiddleware::getUserEmail() ?? '',
            ]);
            Responde::ok(['data' => ['acknowledgement' => $entry]]);
        } catch (RuntimeException $error) {
            $httpCode = (int) ($error->http_code ?? 0);
            if ($httpCode === 404) {
                Responde::erro('Chamado não encontrado.', 404);
                return;
            }
            error_log('[room-tickets] Falha na verificação do chamado: ' . get_class($error));
            Responde::erro('Não foi possível verificar o chamado no GLPI. Tente novamente.', 502);
        } catch (Throwable $error) {
            error_log('[room-tickets] Falha ao registrar aceite: ' . get_class($error));
            Responde::erro('Não foi possível registrar o aceite do alerta.', 500);
        } finally {
            if ($session !== null) {
                try { $client->killSession($session); } catch (Throwable $ignored) {}
            }
        }
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
}
