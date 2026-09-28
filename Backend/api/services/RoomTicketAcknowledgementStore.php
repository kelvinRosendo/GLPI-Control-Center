<?php

declare(strict_types=1);

/**
 * Shared acknowledgements for room-ticket alerts.
 *
 * The file lives under Backend/data, which is a persistent shared directory in
 * the VPS release layout. Acknowledging an alert does not change the GLPI ticket.
 */
final class RoomTicketAcknowledgementStore
{
    private const VERSION = 1;
    private const RETENTION_DAYS = 180;

    public static function all(): array
    {
        return self::withLockedFile(false, static fn(array $document): array => $document);
    }

    public static function forTicket(int $ticketId): ?array
    {
        if ($ticketId <= 0) return null;
        $document = self::all();
        $entry = $document['items'][(string) $ticketId] ?? null;
        return is_array($entry) ? $entry : null;
    }

    /**
     * Reads many acknowledgements in a single lock: ids that were never
     * acknowledged are simply absent from the returned map.
     */
    public static function forIds(array $ticketIds): array
    {
        $document = self::all();
        $items = is_array($document['items'] ?? null) ? $document['items'] : [];
        $entries = [];
        foreach ($ticketIds as $ticketId) {
            $ticketId = (int) $ticketId;
            if ($ticketId < 1) continue;
            $entry = $items[(string) $ticketId] ?? null;
            if (is_array($entry)) $entries[(string) $ticketId] = $entry;
        }
        return $entries;
    }

    /**
     * First acknowledgement wins: a second acknowledgement never overwrites
     * who accepted first, it only returns the existing entry.
     */
    public static function accept(int $ticketId, array $ticket, array $actor): array
    {
        if ($ticketId <= 0) throw new InvalidArgumentException('Chamado inválido.');

        return self::withLockedFile(true, static function (array $document) use ($ticketId, $ticket, $actor): array {
            $existing = $document['items'][(string) $ticketId] ?? null;
            if (is_array($existing)) {
                return ['document' => $document, 'result' => $existing];
            }
            $now = date(DATE_ATOM);
            $entry = [
                'ticketId' => $ticketId,
                'reference' => self::clean($ticket['reference'] ?? '', 80),
                'openedAt' => self::clean($ticket['openedAt'] ?? '', 40),
                'acceptedAt' => $now,
                'acceptedBy' => [
                    'name' => self::clean($actor['name'] ?? '', 160),
                    'email' => self::clean($actor['email'] ?? '', 254),
                ],
            ];
            $document['items'][(string) $ticketId] = $entry;
            $document['updatedAt'] = $now;
            return ['document' => $document, 'result' => $entry];
        });
    }

    public static function attach(array $result): array
    {
        $result['items'] = self::attachList(is_array($result['items'] ?? null) ? $result['items'] : []);
        if (is_array($result['latest'] ?? null)) $result['latest'] = self::attachList([$result['latest']])[0];
        return $result;
    }

    /** Annotates a plain list of ticket-like rows with their acknowledgement. */
    public static function attachList(array $items): array
    {
        $document = self::all();
        $entries = is_array($document['items'] ?? null) ? $document['items'] : [];
        $attach = static function ($item) use ($entries) {
            if (!is_array($item)) return $item;
            $entry = $entries[(string) ((int) ($item['id'] ?? 0))] ?? null;
            $item['acknowledgement'] = is_array($entry) ? $entry : null;
            return $item;
        };
        return array_map($attach, $items);
    }

    private static function path(): string
    {
        $override = trim((string) getenv('GCC_ROOM_TICKET_ACKS_FILE'));
        return $override !== '' ? $override : dirname(__DIR__, 2) . '/data/room-ticket-acknowledgements.json';
    }

    private static function emptyDocument(): array
    {
        return ['version' => self::VERSION, 'updatedAt' => null, 'items' => []];
    }

    private static function withLockedFile(bool $write, callable $operation): array
    {
        $path = self::path();
        $directory = dirname($path);
        if (!$write && !is_file($path)) {
            $result = $operation(self::emptyDocument());
            return is_array($result) ? $result : [];
        }
        if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('Diretório de dados indisponível.');
        }

        $handle = @fopen($path, 'c+');
        if ($handle === false) throw new RuntimeException('Arquivo de aceite indisponível.');

        try {
            if (!flock($handle, $write ? LOCK_EX : LOCK_SH)) {
                throw new RuntimeException('Não foi possível bloquear o arquivo de aceite.');
            }
            rewind($handle);
            $raw = stream_get_contents($handle);
            $decoded = json_decode($raw ?: '', true);
            $document = is_array($decoded) ? $decoded : self::emptyDocument();
            $document['version'] = self::VERSION;
            $document['items'] = is_array($document['items'] ?? null) ? $document['items'] : [];
            $document = self::prune($document);

            $outcome = $operation($document);
            $result = $outcome;
            if ($write) {
                $document = is_array($outcome['document'] ?? null) ? $outcome['document'] : $document;
                $result = $outcome['result'] ?? $document;
                $encoded = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($encoded === false) throw new RuntimeException('Não foi possível codificar o aceite.');
                rewind($handle);
                if (!ftruncate($handle, 0) || fwrite($handle, $encoded . "\n") === false || !fflush($handle)) {
                    throw new RuntimeException('Não foi possível gravar o aceite.');
                }
            }
            flock($handle, LOCK_UN);
            return is_array($result) ? $result : [];
        } finally {
            fclose($handle);
        }
    }

    private static function prune(array $document): array
    {
        $cutoff = time() - self::RETENTION_DAYS * 86400;
        foreach ($document['items'] as $id => $entry) {
            $acceptedAt = is_array($entry) ? strtotime((string) ($entry['acceptedAt'] ?? '')) : false;
            if ($acceptedAt !== false && $acceptedAt < $cutoff) unset($document['items'][$id]);
        }
        return $document;
    }

    private static function clean(mixed $value, int $maxLength): string
    {
        $value = trim((string) $value);
        return function_exists('mb_substr') ? mb_substr($value, 0, $maxLength) : substr($value, 0, $maxLength);
    }
}
