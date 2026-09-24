<?php
declare(strict_types=1);
require_once __DIR__ . '/services/RoomTicketsService.php';
require_once __DIR__ . '/services/RoomTicketsReader.php';

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
            $read = static function (string $path) use ($client, $session, $startedAt): array {
                return RoomTicketsReader::collect(static function (int $offset, int $size) use ($client, $session, $path, $startedAt): array {
                    if (microtime(true) - $startedAt > 45) throw new RuntimeException('Prazo da consulta excedido.');
                    return $client->getReportPage($path, $session, $offset, $size);
                });
            };
            // Collections are read in batches, never one HTTP request per ticket.
            $tickets = $read('/Ticket');

            $locations = $categories = $links = [];
            if ($tickets) {
                $locations = $read('/Location');
                $categories = $read('/ITILCategory');
                $links = $read('/Item_Ticket');
            }
            $cache = AssetService::fromCache();
            $assets = is_array($cache['items'] ?? null) ? $cache['items'] : [];
            $normalized = RoomTicketsService::normalize($tickets, $locations, $categories, $links, $assets);
            $result = RoomTicketsService::aggregate($normalized['items'], $filters);
            $warnings = [];
            if (!$assets && $tickets) $warnings[] = 'Nomes e patrimônios de ativos indisponíveis no cache. Os vínculos são exibidos por tipo e ID.';
            if ($normalized['invalidDates']) $warnings[] = 'Há chamados com data inválida que não puderam ser contados.';
            $result['meta'] = [
                'collectedAt' => date(DATE_ATOM), 'complete' => $normalized['invalidDates'] === 0,
                'warnings' => $warnings, 'source' => 'GLPI',
                'assetNamesSource' => 'cache GCC (pode estar desatualizado)',
                'scope' => 'Salas, laboratórios, biblioteca e auditório identificados no chamado; referências L- sem sala entram para revisão.',
                'limitPerCollection' => 10000,
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
}
