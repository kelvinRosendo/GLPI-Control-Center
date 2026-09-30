<?php
declare(strict_types=1);

/**
 * Read-only projection. Pure normalization/aggregation; no credentials or writes.
 * GLPI IDs are kept alongside labels. Asset locations never replace ticket locations.
 */
final class RoomTicketsService
{
    public const TYPES = [
        'projector' => 'Projetor', 'pc' => 'PC', 'mouse' => 'Mouse',
        'keyboard' => 'Teclado', 'chromebook' => 'Chromebook', 'cart' => 'Carrinho',
        'other' => 'Outros', 'unknown' => 'Não identificado',
    ];
    public const STATUSES = [
        1 => 'aberto', 2 => 'em_andamento', 3 => 'em_andamento',
        4 => 'pendente', 5 => 'resolvido', 6 => 'fechado',
    ];

    /**
     * Colunas do Kanban. "Em andamento" recebe em atendimento, planejado e
     * pendente; pendente carrega a marcacao "Aguardando" no cartao.
     */
    public const KANBAN_COLUMNS = [
        'abertos' => ['label' => 'Abertos', 'statuses' => [1]],
        'andamento' => ['label' => 'Em andamento', 'statuses' => [2, 3, 4]],
        'concluidos' => ['label' => 'Concluídos', 'statuses' => [5, 6]],
    ];

    /**
     * Movimentacoes aceitas pelo GCC, a partir do status atual do GLPI.
     * `kind` diz à interface o que o formulário precisa pedir: nome do
     * responsável, texto da solução ou apenas confirmação.
     * Esta é a ÚNICA tabela de transições: botões, arraste e backend leem
     * daqui, então a interface nunca oferece uma ação que o servidor recusa.
     */
    public const ACTIONS = [
        'assumir' => ['from' => [1, 3, 4], 'to' => 2, 'label' => 'Assumir chamado', 'kind' => 'responsavel'],
        'pendente' => ['from' => [2, 3], 'to' => 4, 'label' => 'Marcar aguardando', 'kind' => 'status'],
        'retomar' => ['from' => [4], 'to' => 2, 'label' => 'Retomar', 'kind' => 'status'],
        'concluir' => ['from' => [1, 2, 3, 4], 'to' => 5, 'label' => 'Concluir', 'kind' => 'solucao'],
        'reabrir' => ['from' => [5, 6], 'to' => 1, 'label' => 'Reabrir chamado', 'kind' => 'status'],
    ];

    /** @deprecated Use self::ACTIONS; mantido apenas como espelho legível. */
    public const TRANSITIONS = [
        'assumir' => ['from' => [1, 3, 4], 'to' => 2],
        'pendente' => ['from' => [2, 3], 'to' => 4],
        'retomar' => ['from' => [4], 'to' => 2],
        'concluir' => ['from' => [1, 2, 3, 4], 'to' => 5],
        'reabrir' => ['from' => [5, 6], 'to' => 1],
    ];

    /** Rótulos usados nas mensagens de conflito e no histórico. */
    public const ACTION_LABELS = [
        'assumir' => 'assumir', 'pendente' => 'marcar como aguardando',
        'retomar' => 'retomar', 'concluir' => 'concluir', 'reabrir' => 'reabrir',
    ];

    public const DEFAULT_KANBAN_LIMIT = 25;
    public const MAX_KANBAN_LIMIT = 100;

    public static function filters(array $query, ?DateTimeImmutable $now = null): array
    {
        $tz = new DateTimeZone('America/Sao_Paulo');
        $now = ($now ?? new DateTimeImmutable('now', $tz))->setTimezone($tz);
        $read = static function (string $key, string $default = '') use ($query): string {
            $value = $query[$key] ?? $default;
            if (!is_scalar($value) || strlen((string) $value) > 200) {
                throw new InvalidArgumentException('Filtro inválido: ' . $key);
            }
            return trim((string) $value);
        };
        $period = $read('period', '30d');
        if (!in_array($period, ['30d', 'previous_month', 'custom'], true)) {
            throw new InvalidArgumentException('Período inválido.');
        }
        $start = $now->setTime(0, 0)->modify('-29 days');
        $end = $now->setTime(0, 0)->modify('+1 day');
        if ($period === 'previous_month') {
            $end = $now->modify('first day of this month')->setTime(0, 0);
            $start = $end->modify('-1 month');
        } elseif ($period === 'custom') {
            $parse = static function (string $value) use ($tz): DateTimeImmutable {
                $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, $tz);
                if (!$date || $date->format('Y-m-d') !== $value) {
                    throw new InvalidArgumentException('Use datas válidas no formato AAAA-MM-DD.');
                }
                return $date;
            };
            $start = $parse($read('from'));
            $end = $parse($read('to'))->modify('+1 day');
        }
        if ($end <= $start || $start->diff($end)->days > 366) {
            throw new InvalidArgumentException('Selecione um intervalo de 1 a 366 dias.');
        }
        $type = $read('type');
        $status = $read('status');
        if ($type !== '' && !isset(self::TYPES[$type])) {
            throw new InvalidArgumentException('Tipo de equipamento inválido.');
        }
        if ($status !== '' && !in_array($status, array_values(self::STATUSES), true)) {
            throw new InvalidArgumentException('Status inválido.');
        }
        $page = $read('page', '1');
        $perPage = $read('per_page', '25');
        if (!ctype_digit($page) || (int) $page < 1 || (int) $page > 100000
            || !ctype_digit($perPage) || (int) $perPage < 1 || (int) $perPage > 100) {
            throw new InvalidArgumentException('Paginação inválida.');
        }
        // Limite explicito por coluna do Kanban; a contagem nunca depende dele.
        $kanbanLimit = $read('kanban_limit', (string) self::DEFAULT_KANBAN_LIMIT);
        if (!ctype_digit($kanbanLimit) || (int) $kanbanLimit < 1
            || (int) $kanbanLimit > self::MAX_KANBAN_LIMIT) {
            throw new InvalidArgumentException('Limite do Kanban inválido.');
        }
        return [
            'period' => $period, 'from' => $start->format('Y-m-d'),
            'to' => $end->modify('-1 day')->format('Y-m-d'),
            'start' => $start->format('Y-m-d H:i:s'), 'end' => $end->format('Y-m-d H:i:s'),
            'timezone' => $tz->getName(), 'room' => $read('room'), 'type' => $type,
            'status' => $status, 'asset' => $read('asset'), 'q' => $read('q'),
            'page' => (int) $page, 'per_page' => (int) $perPage,
            'kanban_limit' => (int) $kanbanLimit,
        ];
    }

    public static function text($value): string
    {
        if (!is_scalar($value)) return '';
        $text = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('#<(?:br\s*/?|/p|/div|/li)>#i', "\n", $text) ?? $text;
        return trim(strip_tags($text));
    }

    private static function key(string $value): string
    {
        $value = strtr($value, [
            'Á'=>'a','À'=>'a','Ã'=>'a','Â'=>'a','á'=>'a','à'=>'a','ã'=>'a','â'=>'a',
            'É'=>'e','Ê'=>'e','é'=>'e','ê'=>'e','Í'=>'i','í'=>'i',
            'Ó'=>'o','Ô'=>'o','Õ'=>'o','ó'=>'o','ô'=>'o','õ'=>'o',
            'Ú'=>'u','Ü'=>'u','ú'=>'u','ü'=>'u','Ç'=>'c','ç'=>'c',
        ]);
        return strtolower(trim(preg_replace('/\s+/u', ' ', $value) ?? $value));
    }

    private static function roomName(string $value): ?string
    {
        $value = self::key($value);
        // Keep the hierarchy: two different buildings must not collapse into one room.
        $parts = preg_split('/\s*>\s*/', $value);
        $leaf = end($parts);
        if (count($parts) > 1) {
            $name = self::roomName($leaf);
            return $name !== null ? implode(' > ', array_slice($parts, 0, -1)) . ' > ' . $name : null;
        }
        if (preg_match('/^sala\s*(?:de aula\s*)?(?:n[ºo°.]?\s*)?0*(\d+)(?:\s*[-\/]?\s*([a-z]))?$/u', $value, $m)) {
            return 'Sala ' . (int) $m[1] . (isset($m[2]) ? ' ' . strtoupper($m[2]) : '');
        }
        if (preg_match('/^(sala\b|laboratorio\b|biblioteca\b|auditorio\b)/u', $value)) {
            return ucfirst($value);
        }
        return null;
    }

    /**
     * Room detection shared by the report and by single-ticket validation.
     * Returns [?room, source] keeping the original precedence of sources.
     */
    public static function detectRoom(array $ticket, array $locations): array
    {
        $title = self::text($ticket['name'] ?? '');
        $description = self::text($ticket['content'] ?? '');
        $location = $locations[(int) ($ticket['locations_id'] ?? 0)] ?? self::text($ticket['_location_name'] ?? '');
        $room = self::roomName($location);
        $roomSource = $room !== null ? 'local_glpi' : 'nao_identificado';
        if ($room === null && preg_match('/^\s*Local\s*:\s*([^\n\r|;]+)/imu', $description, $m)) {
            $room = self::roomName(trim($m[1]));
            if ($room !== null) $roomSource = 'campo_local';
        }
        if ($room === null && preg_match_all('/\bsala\s+0*\d+(?:\s*[-\/]\s*[a-z])?\b/iu', $title, $m)) {
            $names = array_values(array_unique(array_filter(array_map([self::class, 'roomName'], $m[0]))));
            if (count($names) === 1) { $room = $names[0]; $roomSource = 'titulo_inferido'; }
        }
        return [$room, $roomSource];
    }

    /**
     * Normalizes a single expanded GLPI ticket (dropdowns already resolved to
     * names) for eligibility checks. Returns null when the ticket does not
     * belong to the room queue (no room and no L- reference) or has no usable date.
     */
    public static function fromGlpi(array $ticket): ?array
    {
        $row = $ticket;
        if (is_string($row['locations_id'] ?? null)) $row['_location_name'] = $row['locations_id'];
        if (is_string($row['itilcategories_id'] ?? null)) $row['_category_name'] = $row['itilcategories_id'];
        $normalized = self::normalize([$row], [], [], [], []);
        return $normalized['items'][0] ?? null;
    }
    /** Alertable statuses: alerts follow the queue, never the GLPI lifecycle writes. */
    public static function isAlertEligible(array $ticket): bool
    {
        return in_array($ticket['status'] ?? '', ['aberto', 'em_andamento', 'pendente'], true);
    }

    /**
     * Ações realmente disponíveis para um status atual, na ordem em que a
     * interface deve apresentá-las. Derivada de ACTIONS: arrastar, botões e
     * backend usam exatamente a mesma lista.
     */
    public static function availableActions(int $statusId): array
    {
        $order = ['assumir', 'concluir', 'pendente', 'retomar', 'reabrir'];
        $out = [];
        foreach ($order as $action) {
            $rule = self::ACTIONS[$action];
            if (in_array($statusId, $rule['from'], true)) {
                $out[] = ['action' => $action, 'label' => $rule['label'],
                    'kind' => $rule['kind'], 'target' => $rule['to']];
            }
        }
        return $out;
    }

    /**
     * Status lido do GLPI. Nunca converte silenciosamente um valor que não
     * reconheça: um status indecifrável precisa aparecer como erro, não como 0.
     */
    public static function statusId(array $ticket): int
    {
        $raw = $ticket['status'] ?? null;
        if (is_int($raw)) return $raw;
        if (is_string($raw) && ctype_digit($raw)) return (int) $raw;
        if (is_float($raw) && (float) (int) $raw === $raw) return (int) $raw;
        throw new ContractException('O GLPI devolveu o status do chamado em um formato desconhecido.');
    }

    public static function kanbanColumn(int $statusId): ?string
    {
        foreach (self::KANBAN_COLUMNS as $key => $column) {
            if (in_array($statusId, $column['statuses'], true)) return $key;
        }
        return null;
    }

    /** Coluna de destino de uma movimentacao a partir do status atual do GLPI. */
    public static function transition(string $action, int $currentStatusId): ?int
    {
        $rule = self::TRANSITIONS[$action] ?? null;
        if ($rule === null || !in_array($currentStatusId, $rule['from'], true)) return null;
        return (int) $rule['to'];
    }

    /** Cartao compacto do Kanban: numero, sala, resumo, equipamento, abertura, status, responsavel. */
    public static function kanbanCard(array $ticket): array
    {
        $statusId = (int) ($ticket['statusId'] ?? 0);
        return [
            'id' => (int) $ticket['id'],
            'reference' => (string) ($ticket['reference'] ?? ''),
            'title' => (string) ($ticket['title'] ?? ''),
            'room' => (string) ($ticket['room'] ?? ''),
            'roomKey' => (string) ($ticket['roomKey'] ?? ''),
            'types' => array_values($ticket['types'] ?? []),
            'openedAt' => (string) ($ticket['openedAt'] ?? ''),
            'status' => (string) ($ticket['status'] ?? ''),
            'statusId' => $statusId,
            'statusLabel' => self::statusLabel($statusId),
            'column' => self::kanbanColumn($statusId),
            'waiting' => $statusId === 4,
            'urgency' => (int) ($ticket['urgency'] ?? 0),
            'assignee' => is_array($ticket['assignee'] ?? null) ? $ticket['assignee'] : ['userId' => 0, 'name' => ''],
            'review' => (bool) ($ticket['review'] ?? false),
            // Ações permitidas para ESTE status, vindas da tabela única.
            'actions' => self::availableActions($statusId),
        ];
    }

    public static function statusLabel(int $statusId): string
    {
        $labels = [1 => 'Novo', 2 => 'Em atendimento', 3 => 'Planejado',
            4 => 'Pendente', 5 => 'Resolvido', 6 => 'Fechado'];
        return $labels[$statusId] ?? 'em status desconhecido';
    }

    /**
     * Colunas do Kanban montadas sobre o conjunto filtrado INTEIRO: a contagem
     * nao depende da pagina da tabela, do limite por coluna nem da lista de 30
     * chamados recentes do monitor.
     */
    public static function kanban(array $selected, int $limit): array
    {
        $limit = max(1, min(self::MAX_KANBAN_LIMIT, $limit));
        $buckets = [];
        foreach (array_keys(self::KANBAN_COLUMNS) as $key) $buckets[$key] = [];
        $unmapped = 0;
        foreach ($selected as $ticket) {
            $column = self::kanbanColumn((int) ($ticket['statusId'] ?? 0));
            if ($column === null) { $unmapped++; continue; }
            $buckets[$column][] = $ticket;
        }
        $columns = [];
        foreach (self::KANBAN_COLUMNS as $key => $meta) {
            $rows = $buckets[$key];
            // Mais antigo primeiro: o que espera ha mais tempo fica no topo.
            usort($rows, static fn($a, $b) => strcmp($a['openedAt'], $b['openedAt']) ?: ($a['id'] <=> $b['id']));
            $columns[$key] = [
                'key' => $key, 'label' => $meta['label'], 'statuses' => $meta['statuses'],
                'count' => count($rows), 'shown' => min($limit, count($rows)),
                'hasMore' => count($rows) > $limit,
                'items' => array_map([self::class, 'kanbanCard'], array_slice($rows, 0, $limit)),
            ];
        }
        return [
            'limit' => $limit, 'columns' => $columns,
            'total' => count($selected), 'unmapped' => $unmapped,
        ];
    }

    /**
     * Filter-independent monitoring slice: newest tickets first, limit applied
     * after ordering so the queue does not depend on report filters or paging.
     */
    public static function monitorEntries(array $items, int $limit = 30): array
    {
        $rows = [];
        foreach ($items as $ticket) {
            if (!is_array($ticket) || !isset($ticket['id'])) continue;
            $rows[] = [
                'id' => (int) $ticket['id'],
                'title' => (string) ($ticket['title'] ?? ''),
                'room' => (string) ($ticket['room'] ?? ''),
                'roomKey' => (string) ($ticket['roomKey'] ?? ''),
                'reference' => (string) ($ticket['reference'] ?? ''),
                'openedAt' => (string) ($ticket['openedAt'] ?? ''),
                'status' => (string) ($ticket['status'] ?? ''),
                'urgency' => (int) ($ticket['urgency'] ?? 0),
                'types' => array_values(is_array($ticket['types'] ?? null) ? $ticket['types'] : []),
                'review' => (bool) ($ticket['review'] ?? false),
                'eligible' => self::isAlertEligible($ticket),
            ];
        }
        usort($rows, static fn(array $a, array $b): int =>
            strcmp($b['openedAt'], $a['openedAt']) ?: ($b['id'] <=> $a['id']));
        return array_slice($rows, 0, max(1, $limit));
    }

    private static function types(string $text): array
    {
        $text = self::key($text);
        $rules = [
            'projector' => '/\bprojetor(?:es)?\b/',
            'chromebook' => '/\bchromebook[s]?\b|\bchrome(?:\s*[- ]\s*(?:g|edu|\d)|$)/',
            'pc' => '/\b(?:pc|computador(?:es)?|desktop|notebook)[s]?\b/',
            'mouse' => '/\b(?:mouse[s]?|mice)\b/',
            'keyboard' => '/\bteclado[s]?\b/',
            'cart' => '/\bcarrinho[s]?\b/',
        ];
        $types = [];
        foreach ($rules as $type => $pattern) {
            if (preg_match($pattern, $text)) $types[] = $type;
        }
        return $types;
    }

    public static function normalize(array $tickets, array $locations, array $categories,
        array $links, array $assets, array $actorIndex = []): array
    {
        $loc = $cat = $assetIndex = $byTicket = [];
        foreach ($locations as $row) $loc[(int) ($row['id'] ?? 0)] = self::text($row['completename'] ?? $row['name'] ?? '');
        foreach ($categories as $row) $cat[(int) ($row['id'] ?? 0)] = self::text($row['completename'] ?? $row['name'] ?? '');
        foreach ($assets as $row) {
            $raw = is_array($row['raw'] ?? null) ? $row['raw'] : $row;
            $id = (int) ($row['id'] ?? $row['glpiId'] ?? $raw['id'] ?? 0);
            $itemtype = self::text($row['itemtype'] ?? $raw['itemtype'] ?? '');
            if ($id > 0 && $itemtype !== '') $assetIndex[$itemtype . ':' . $id] = $row;
        }
        foreach ($links as $row) {
            $ticketId = (int) ($row['tickets_id'] ?? 0);
            $id = (int) ($row['items_id'] ?? 0);
            $itemtype = self::text($row['itemtype'] ?? '');
            if ($ticketId > 0 && $id > 0 && preg_match('/^[A-Za-z][A-Za-z0-9_]*$/', $itemtype)) {
                $byTicket[$ticketId][$itemtype . ':' . $id] = ['id' => $id, 'itemtype' => $itemtype];
            }
        }
        $items = [];
        $invalidDates = 0;
        $tz = new DateTimeZone('America/Sao_Paulo');
        foreach ($tickets as $ticket) {
            $id = (int) ($ticket['id'] ?? 0);
            if ($id < 1 || !empty($ticket['is_deleted']) || isset($items[$id])) continue;
            $title = self::text($ticket['name'] ?? '');
            $description = self::text($ticket['content'] ?? '');
            [$room, $roomSource] = self::detectRoom($ticket, $loc);
            $hasReference = preg_match('/\[?(L-\d+)\]?/i', $title . "\n" . $description, $ref) === 1;
            // Non-room Mano Isa tickets remain visible as "review"; do not assign an invented room.
            if ($room === null && !$hasReference) continue;
            $dateString = self::text($ticket['date'] ?? '');
            $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $dateString, $tz);
            if (!$date || $date->format('Y-m-d H:i:s') !== $dateString) { $invalidDates++; continue; }
            $entity = (int) ($ticket['entities_id'] ?? 0);
            $roomKey = $room !== null ? $entity . ':' . self::key($room) : 'unknown';
            $category = $cat[(int) ($ticket['itilcategories_id'] ?? 0)] ?? self::text($ticket['_category_name'] ?? '');
            $statusRaw = $ticket['status'] ?? null;
            $statusId = (is_int($statusRaw) || (is_string($statusRaw) && ctype_digit($statusRaw)))
                ? (int) $statusRaw : 0;
            $ticketAssets = [];
            $types = [];
            foreach ($byTicket[$id] ?? [] as $key => $link) {
                $asset = $assetIndex[$key] ?? [];
                $raw = is_array($asset['raw'] ?? null) ? $asset['raw'] : $asset;
                $name = self::text($asset['name'] ?? $asset['nome'] ?? $raw['name'] ?? '');
                $tag = self::text($raw['otherserial'] ?? $asset['patrimonio'] ?? '');
                $assetTypes = self::types($name);
                $categoryKey = self::text($asset['category'] ?? '');
                if (str_starts_with($categoryKey, 'chromebook_')) $assetTypes = ['chromebook'];
                elseif ($categoryKey === 'projector') $assetTypes = ['projector'];
                elseif ($categoryKey === 'computer_cs') $assetTypes = ['pc'];
                // Unknown Computer names do not imply PC: projectors also use Computer in this GCC.
                $types = array_merge($types, $assetTypes);
                $ticketAssets[] = [
                    'key' => $key, 'id' => $link['id'], 'itemtype' => $link['itemtype'],
                    'name' => $name !== '' ? $name : $key, 'tag' => $tag,
                    'source' => $asset ? 'vinculo_glpi_nome_cache' : 'vinculo_glpi',
                ];
            }
            $typeSource = $types ? 'ativo_vinculado' : 'nao_identificado';
            // An incident about a mouse can be attached to its PC. Prefer the
            // explicitly reported equipment, then category, before the linked asset type.
            $reportedTypes = [];
            if (preg_match('/^\s*(?:Equipamento|Tipo de equipamento)\s*:\s*([^\n\r|;]+)/imu', $description, $m)) {
                $reportedTypes = self::types($m[1]);
            }
            $categoryTypes = self::types($category);
            if ($reportedTypes) {
                $types = $reportedTypes;
                $typeSource = 'campo_equipamento';
            } elseif ($categoryTypes) {
                $types = $categoryTypes;
                $typeSource = 'categoria_glpi';
            }
            if (!$types) {
                $types = self::types($title);
                if ($types) $typeSource = 'titulo_inferido';
            }
            if (!$types) $types = [$category !== '' ? 'other' : 'unknown'];
            $items[$id] = [
                'id' => $id, 'title' => $title, 'description' => $description,
                'openedAt' => $dateString, 'status' => self::STATUSES[$statusId] ?? 'desconhecido',
                'statusId' => $statusId, 'urgency' => (int) ($ticket['urgency'] ?? 0), 'category' => $category,
                // Técnico responsável vem do índice de ATORES do GLPI, nunca de
                // `users_id_recipient` (que é o autor do chamado).
                'assignee' => is_array($actorIndex[$id] ?? null) ? $actorIndex[$id]
                    : ['userId' => 0, 'name' => '', 'source' => '', 'ambiguous' => false],
                'assigneeKnown' => isset($actorIndex[$id]),
                'roomKey' => $roomKey, 'room' => $room ?? 'Sala não identificada',
                'roomSource' => $roomSource, 'types' => array_values(array_unique($types)),
                'typeSource' => $typeSource, 'assets' => $ticketAssets,
                'reference' => $hasReference ? strtoupper($ref[1]) : '',
                'review' => $room === null || $roomSource === 'titulo_inferido' || $typeSource === 'titulo_inferido',
            ];
        }
        return ['items' => array_values($items), 'invalidDates' => $invalidDates];
    }

    public static function aggregate(array $items, array $filters): array
    {
        $periodItems = array_values(array_filter($items, static fn($t) =>
            $t['openedAt'] >= $filters['start'] && $t['openedAt'] < $filters['end']));
        $roomOptions = [];
        foreach ($periodItems as $t) $roomOptions[$t['roomKey']] = $t['room'];
        asort($roomOptions, SORT_NATURAL | SORT_FLAG_CASE);
        $selected = [];
        foreach ($periodItems as $t) {
            if ($filters['room'] !== '' && $t['roomKey'] !== $filters['room']) continue;
            if ($filters['type'] !== '' && !in_array($filters['type'], $t['types'], true)) continue;
            if ($filters['status'] !== '' && $t['status'] !== $filters['status']) continue;
            if ($filters['asset'] !== '' && !in_array($filters['asset'], array_column($t['assets'], 'key'), true)) continue;
            $haystack = self::key($t['id'] . ' ' . $t['title'] . ' ' . $t['description'] . ' ' . $t['reference']);
            if ($filters['q'] !== '' && !str_contains($haystack, self::key($filters['q']))) continue;
            $selected[$t['id']] = $t;
        }
        $rooms = $types = $assets = [];
        $summary = ['total' => count($selected), 'open' => 0, 'withoutRoom' => 0, 'withoutAsset' => 0, 'review' => 0];
        foreach ($selected as $t) {
            if (in_array($t['status'], ['aberto', 'em_andamento', 'pendente'], true)) $summary['open']++;
            if ($t['roomKey'] === 'unknown') $summary['withoutRoom']++;
            if (!$t['assets']) $summary['withoutAsset']++;
            if ($t['review']) $summary['review']++;
            if ($t['roomKey'] !== 'unknown') {
                $rooms[$t['roomKey']] ??= ['key' => $t['roomKey'], 'label' => $t['room'], 'count' => 0];
                $rooms[$t['roomKey']]['count']++;
            }
            foreach (array_unique($t['types']) as $type) {
                $types[$type] ??= ['key' => $type, 'label' => self::TYPES[$type], 'count' => 0];
                $types[$type]['count']++;
            }
            foreach ($t['assets'] as $asset) {
                $key = $asset['key'];
                $assets[$key] ??= ['key' => $key, 'label' => $asset['name'], 'tag' => $asset['tag'], 'count' => 0, 'lastOpenedAt' => ''];
                $assets[$key]['count']++;
                $assets[$key]['lastOpenedAt'] = max($assets[$key]['lastOpenedAt'], $t['openedAt']);
            }
        }
        $rank = static function (array $rows): array {
            $rows = array_values($rows);
            usort($rows, static fn($a, $b) => ($b['count'] <=> $a['count']) ?: strnatcasecmp($a['label'], $b['label']) ?: strcmp($a['key'], $b['key']));
            return $rows;
        };
        $rooms = $rank($rooms); $types = $rank($types); $assets = $rank($assets);
        $leaders = static function (array $rows): array {
            return $rows ? array_values(array_filter($rows, static fn($r) => $r['count'] === $rows[0]['count'])) : [];
        };
        $knownTypes = array_values(array_filter($types, static fn($r) => !in_array($r['key'], ['unknown', 'other'], true)));
        $summary['topRooms'] = $leaders($rooms);
        $summary['topTypes'] = $leaders($knownTypes);
        $latestCandidates = array_values($periodItems);
        usort($latestCandidates, static fn($a, $b) => strcmp($b['openedAt'], $a['openedAt']) ?: ($b['id'] <=> $a['id']));
        $latest = $latestCandidates[0] ?? null;
        $selected = array_values($selected);
        usort($selected, static fn($a, $b) => ($b['urgency'] <=> $a['urgency']) ?: strcmp($a['openedAt'], $b['openedAt']) ?: ($a['id'] <=> $b['id']));
        $pages = max(1, (int) ceil(count($selected) / $filters['per_page']));
        $page = min($pages, $filters['page']);
        return [
            'items' => array_slice($selected, ($page - 1) * $filters['per_page'], $filters['per_page']),
            'latest' => $latest,
            // Kanban calculado sobre $selected completo, antes de qualquer paginacao.
            'kanban' => self::kanban($selected, (int) ($filters['kanban_limit'] ?? self::DEFAULT_KANBAN_LIMIT)),
            'summary' => $summary, 'rankings' => ['rooms' => $rooms, 'types' => $types, 'assets' => $assets],
            'options' => ['rooms' => array_map(static fn($key, $label) => ['key' => (string) $key, 'label' => $label], array_keys($roomOptions), array_values($roomOptions)), 'types' => self::TYPES],
            'pagination' => ['page' => $page, 'perPage' => $filters['per_page'], 'pages' => $pages, 'total' => count($selected)],
            'filters' => $filters,
        ];
    }
}
