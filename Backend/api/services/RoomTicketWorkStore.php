<?php

declare(strict_types=1);

/**
 * Operational record of room tickets handled by the GCC: who will attend,
 * who registered the change, movement history and solution text.
 *
 * This file lives under Backend/data (persistent shared directory in the VPS
 * release layout) and is the only official source for handlers and history.
 * Acknowledgements live in a separate store: an old "aceite" only confirmed
 * that a technician read the alert and is never promoted to an assignment.
 */
final class RoomTicketWorkStore
{
    private const VERSION = 1;
    private const RETENTION_DAYS = 365;
    private const REQUEST_RETENTION_HOURS = 24;
    private const MAX_MOVES_PER_TICKET = 60;

    public static function all(): array
    {
        return self::withLockedFile(false, static fn(array $document): array => $document);
    }

    public static function forTicket(int $ticketId): ?array
    {
        if ($ticketId <= 0) return null;
        $entry = self::all()['items'][(string) $ticketId] ?? null;
        return is_array($entry) ? $entry : null;
    }

    /**
     * Annotates ticket-like rows with the GCC record. `work` is null when the
     * ticket was never claimed: an acknowledgement alone never creates a handler.
     */
    public static function attachList(array $items): array
    {
        $document = self::all();
        $entries = is_array($document['items'] ?? null) ? $document['items'] : [];
        return array_map(static function ($item) use ($entries) {
            if (!is_array($item)) return $item;
            $entry = $entries[(string) ((int) ($item['id'] ?? 0))] ?? null;
            $item['work'] = is_array($entry) ? self::summary($entry) : null;
            return $item;
        }, $items);
    }

    /** Compact view used by the Kanban cards and the list table. */
    public static function summary(array $entry): array
    {
        $assignment = is_array($entry['assignment'] ?? null) ? $entry['assignment'] : null;
        $solution = is_array($entry['solution'] ?? null) ? $entry['solution'] : null;
        $moves = is_array($entry['moves'] ?? null) ? $entry['moves'] : [];
        return [
            'ticketId' => (int) ($entry['ticketId'] ?? 0),
            'reference' => (string) ($entry['reference'] ?? ''),
            'handlerName' => $assignment === null ? '' : (string) ($assignment['handlerName'] ?? ''),
            'handlerSource' => $assignment === null ? '' : (string) ($assignment['source'] ?? ''),
            'glpiUserId' => $assignment === null ? 0 : (int) ($assignment['glpiUserId'] ?? 0),
            'glpiUserName' => $assignment === null ? '' : (string) ($assignment['glpiUserName'] ?? ''),
            'assignedAt' => $assignment === null ? '' : (string) ($assignment['at'] ?? ''),
            'assignedBy' => $assignment === null ? '' : (string) ($assignment['recordedBy'] ?? ''),
            'solution' => $solution === null ? '' : (string) ($solution['text'] ?? ''),
            'solutionAt' => $solution === null ? '' : (string) ($solution['at'] ?? ''),
            'solutionBy' => $solution === null ? '' : (string) ($solution['recordedBy'] ?? ''),
            'lastMoveAt' => $moves === [] ? '' : (string) (end($moves)['at'] ?? ''),
            'moveCount' => count($moves),
        ];
    }

    /**
     * Full history for the detail panel: movements, assignment and solution,
     * each with author, timestamp and confirmation state.
     */
    public static function history(int $ticketId): array
    {
        $entry = self::forTicket($ticketId);
        $acknowledgement = RoomTicketAcknowledgementStore::forTicket($ticketId);
        if ($entry === null) {
            return [
                'ticketId' => $ticketId,
                'assignment' => null,
                'solution' => null,
                'moves' => [],
                // An acknowledgement proves only that the alert was read.
                'acknowledgement' => $acknowledgement,
            ];
        }
        return [
            'ticketId' => $ticketId,
            'reference' => (string) ($entry['reference'] ?? ''),
            'assignment' => is_array($entry['assignment'] ?? null) ? $entry['assignment'] : null,
            'solution' => is_array($entry['solution'] ?? null) ? $entry['solution'] : null,
            'moves' => array_values($entry['moves'] ?? []),
            'acknowledgement' => $acknowledgement,
        ];
    }

    /**
     * First claim wins. A second technician is told who already owns the ticket
     * instead of overwriting the handler silently.
     */
    public static function recordAssignment(int $ticketId, array $ticket, array $assignment, array $actor): array
    {
        if ($ticketId <= 0) throw new InvalidArgumentException('Chamado inválido.');
        return self::withLockedOutcome(true, static function (array $document) use ($ticketId, $ticket, $assignment, $actor): array {
            $existing = $document['items'][(string) $ticketId] ?? null;
            if (is_array($existing) && is_array($existing['assignment'] ?? null)) {
                return ['document' => $document, 'result' => $existing, 'created' => false];
            }
            $now = date(DATE_ATOM);
            $entry = self::entryFor($document, $ticketId, $ticket);
            $entry['assignment'] = [
                'handlerName' => self::clean($assignment['handlerName'] ?? '', 160),
                // 'glpi_user' quando houve correspondencia exata; 'informado' caso contrario.
                'source' => in_array($assignment['source'] ?? '', ['glpi_user', 'informado'], true)
                    ? (string) $assignment['source'] : 'informado',
                'glpiUserId' => (int) ($assignment['glpiUserId'] ?? 0),
                'glpiUserName' => self::clean($assignment['glpiUserName'] ?? '', 160),
                'recordedBy' => self::clean($actor['name'] ?? '', 160),
                'at' => $now,
            ];
            $entry['updatedAt'] = $now;
            $document['items'][(string) $ticketId] = $entry;
            $document['updatedAt'] = $now;
            return ['document' => $document, 'result' => $entry, 'created' => true];
        });
    }

    public static function recordSolution(int $ticketId, array $solution, array $actor): array
    {
        if ($ticketId <= 0) throw new InvalidArgumentException('Chamado inválido.');
        return self::withLockedOutcome(true, static function (array $document) use ($ticketId, $solution, $actor): array {
            $now = date(DATE_ATOM);
            $entry = self::entryFor($document, $ticketId, is_array($solution['ticket'] ?? null) ? $solution['ticket'] : []);
            if (is_array($entry['solution'] ?? null)) {
                return ['document' => $document, 'result' => $entry, 'created' => false];
            }
            $entry['solution'] = [
                'text' => self::clean($solution['text'] ?? '', 4000),
                'recordedBy' => self::clean($actor['name'] ?? '', 160),
                'glpiFollowup' => (bool) ($solution['glpiFollowup'] ?? false),
                'at' => $now,
            ];
            $entry['updatedAt'] = $now;
            $document['items'][(string) $ticketId] = $entry;
            $document['updatedAt'] = $now;
            return ['document' => $document, 'result' => $entry, 'created' => true];
        });
    }

    /**
     * Appends a movement. Movements are keyed by requestId when the client sends
     * one, so a retried submission never duplicates history.
     */
    public static function recordMove(int $ticketId, array $move, array $actor, string $requestId = ''): array
    {
        if ($ticketId <= 0) throw new InvalidArgumentException('Chamado inválido.');
        return self::withLockedOutcome(true, static function (array $document) use ($ticketId, $move, $actor, $requestId): array {
            $now = date(DATE_ATOM);
            $entry = self::entryFor($document, $ticketId, is_array($move['ticket'] ?? null) ? $move['ticket'] : []);
            $moves = is_array($entry['moves'] ?? null) ? $entry['moves'] : [];
            if ($requestId !== '') {
                foreach ($moves as $previous) {
                    if (($previous['requestId'] ?? '') === $requestId) {
                        return ['document' => $document, 'result' => $entry, 'created' => false];
                    }
                }
            }
            $moves[] = [
                'action' => self::clean($move['action'] ?? '', 24),
                'from' => (int) ($move['from'] ?? 0),
                'to' => (int) ($move['to'] ?? 0),
                'fromLabel' => RoomTicketsService::STATUSES[(int) ($move['from'] ?? 0)] ?? 'desconhecido',
                'toLabel' => RoomTicketsService::STATUSES[(int) ($move['to'] ?? 0)] ?? 'desconhecido',
                'recordedBy' => self::clean($actor['name'] ?? '', 160),
                'confirmed' => (bool) ($move['confirmed'] ?? false),
                'partial' => (bool) ($move['partial'] ?? false),
                'note' => self::clean($move['note'] ?? '', 300),
                'requestId' => $requestId,
                'at' => $now,
            ];
            if (count($moves) > self::MAX_MOVES_PER_TICKET) {
                $moves = array_slice($moves, -self::MAX_MOVES_PER_TICKET);
            }
            $entry['moves'] = $moves;
            $entry['updatedAt'] = $now;
            $document['items'][(string) $ticketId] = $entry;
            $document['updatedAt'] = $now;
            return ['document' => $document, 'result' => $entry, 'created' => true];
        });
    }

    /**
     * Idempotency of a submission: a repeated requestId returns the first
     * outcome instead of repeating GLPI writes.
     */
    public static function rememberRequest(string $requestId, int $ticketId, string $action, array $result): void
    {
        if ($requestId === '' || $ticketId <= 0) return;
        self::withLockedFile(true, static function (array $document) use ($requestId, $ticketId, $action, $result): array {
            $document['requests'][$requestId] = [
                'ticketId' => $ticketId, 'action' => $action,
                'result' => $result, 'at' => date(DATE_ATOM),
            ];
            $document['updatedAt'] = date(DATE_ATOM);
            return ['document' => $document, 'result' => null];
        });
    }

    public static function findRequest(string $requestId): ?array
    {
        if ($requestId === '') return null;
        $request = self::all()['requests'][$requestId] ?? null;
        return is_array($request) ? $request : null;
    }

    private static function entryFor(array $document, int $ticketId, array $ticket): array
    {
        $key = (string) $ticketId;
        $entry = $document['items'][$key] ?? null;
        if (!is_array($entry)) {
            $entry = [
                'ticketId' => $ticketId,
                'reference' => self::clean($ticket['reference'] ?? '', 80),
                'assignment' => null, 'solution' => null, 'moves' => [], 'updatedAt' => null,
            ];
        } elseif (($entry['reference'] ?? '') === '' && isset($ticket['reference'])) {
            $entry['reference'] = self::clean($ticket['reference'], 80);
        }
        return $entry;
    }

    private static function path(): string
    {
        $override = trim((string) getenv('GCC_ROOM_TICKET_WORK_FILE'));
        return $override !== '' ? $override : dirname(__DIR__, 2) . '/data/room-ticket-work.json';
    }

    private static function emptyDocument(): array
    {
        return ['version' => self::VERSION, 'updatedAt' => null, 'items' => [], 'requests' => []];
    }

    /**
     * Read operations receive and return the document itself; write operations
     * receive the document and return the envelope with 'result' and 'created'.
     */
    private static function withLockedFile(bool $write, callable $operation): array
    {
        $outcome = self::withLockedOutcome($write, $operation);
        if (array_key_exists('document', $outcome)) {
            return is_array($outcome['result'] ?? null) ? $outcome['result'] : [];
        }
        return $outcome;
    }

    /**
     * Runs the operation under the file lock and returns the full outcome, so
     * writers can tell a first write (created) from a repeated one.
     */
    private static function withLockedOutcome(bool $write, callable $operation): array
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
        if ($handle === false) throw new RuntimeException('Arquivo de atendimento indisponível.');
        try {
            if (!flock($handle, $write ? LOCK_EX : LOCK_SH)) {
                throw new RuntimeException('Não foi possível bloquear o arquivo de atendimento.');
            }
            rewind($handle);
            $decoded = json_decode(stream_get_contents($handle) ?: '', true);
            $document = is_array($decoded) ? $decoded : self::emptyDocument();
            $document['version'] = self::VERSION;
            $document['items'] = is_array($document['items'] ?? null) ? $document['items'] : [];
            $document['requests'] = is_array($document['requests'] ?? null) ? $document['requests'] : [];
            $document = self::prune($document);

            $outcome = $operation($document);
            if (!is_array($outcome)) $outcome = ['result' => $outcome];
            if ($write) {
                $document = is_array($outcome['document'] ?? null) ? $outcome['document'] : $document;
                $encoded = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($encoded === false) throw new RuntimeException('Não foi possível codificar o atendimento.');
                rewind($handle);
                if (!ftruncate($handle, 0) || fwrite($handle, $encoded . "\n") === false || !fflush($handle)) {
                    throw new RuntimeException('Não foi possível gravar o atendimento.');
                }
            }
            flock($handle, LOCK_UN);
            return $outcome;
        } finally {
            fclose($handle);
        }
    }

    private static function prune(array $document): array
    {
        $cutoff = time() - self::RETENTION_DAYS * 86400;
        foreach ($document['items'] as $id => $entry) {
            $updatedAt = is_array($entry) ? strtotime((string) ($entry['updatedAt'] ?? '')) : false;
            if ($updatedAt !== false && $updatedAt < $cutoff) unset($document['items'][$id]);
        }
        $requestCutoff = time() - self::REQUEST_RETENTION_HOURS * 3600;
        foreach ($document['requests'] as $key => $request) {
            $at = is_array($request) ? strtotime((string) ($request['at'] ?? '')) : false;
            if ($at !== false && $at < $requestCutoff) unset($document['requests'][$key]);
        }
        return $document;
    }

    private static function clean(mixed $value, int $maxLength): string
    {
        $value = trim((string) $value);
        return function_exists('mb_substr') ? mb_substr($value, 0, $maxLength) : substr($value, 0, $maxLength);
    }
}
