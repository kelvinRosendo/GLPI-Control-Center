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
        return [
            'period' => $period, 'from' => $start->format('Y-m-d'),
            'to' => $end->modify('-1 day')->format('Y-m-d'),
            'start' => $start->format('Y-m-d H:i:s'), 'end' => $end->format('Y-m-d H:i:s'),
            'timezone' => $tz->getName(), 'room' => $read('room'), 'type' => $type,
            'status' => $status, 'asset' => $read('asset'), 'q' => $read('q'),
            'page' => (int) $page, 'per_page' => (int) $perPage,
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
        array $links, array $assets): array
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
            $location = $loc[(int) ($ticket['locations_id'] ?? 0)] ?? '';
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
            $hasReference = preg_match('/\[?(L-\d+)\]?/i', $title . "\n" . $description, $ref) === 1;
            // Non-room Mano Isa tickets remain visible as "review"; do not assign an invented room.
            if ($room === null && !$hasReference) continue;
            $dateString = self::text($ticket['date'] ?? '');
            $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $dateString, $tz);
            if (!$date || $date->format('Y-m-d H:i:s') !== $dateString) { $invalidDates++; continue; }
            $entity = (int) ($ticket['entities_id'] ?? 0);
            $roomKey = $room !== null ? $entity . ':' . self::key($room) : 'unknown';
            $category = $cat[(int) ($ticket['itilcategories_id'] ?? 0)] ?? '';
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
                'openedAt' => $dateString, 'status' => self::STATUSES[(int) ($ticket['status'] ?? 0)] ?? 'desconhecido',
                'urgency' => (int) ($ticket['urgency'] ?? 0), 'category' => $category,
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
        $selected = array_values($selected);
        usort($selected, static fn($a, $b) => ($b['urgency'] <=> $a['urgency']) ?: strcmp($a['openedAt'], $b['openedAt']) ?: ($a['id'] <=> $b['id']));
        $pages = max(1, (int) ceil(count($selected) / $filters['per_page']));
        $page = min($pages, $filters['page']);
        return [
            'items' => array_slice($selected, ($page - 1) * $filters['per_page'], $filters['per_page']),
            'summary' => $summary, 'rankings' => ['rooms' => $rooms, 'types' => $types, 'assets' => $assets],
            'options' => ['rooms' => array_map(static fn($key, $label) => ['key' => (string) $key, 'label' => $label], array_keys($roomOptions), array_values($roomOptions)), 'types' => self::TYPES],
            'pagination' => ['page' => $page, 'perPage' => $filters['per_page'], 'pages' => $pages, 'total' => count($selected)],
            'filters' => $filters,
        ];
    }
}
