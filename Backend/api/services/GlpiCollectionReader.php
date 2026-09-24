<?php
declare(strict_types=1);

/** Strict collection pagination, independent of transport for regression testing. */
final class GlpiCollectionReader
{
    public static function collect(callable $read, int $size = 500): array
    {
        $size = max(1, min(5000, $size));
        $items = [];
        $seen = [];
        $total = null;
        $pages = 0;
        $errors = [];
        try {
            for ($offset = 0; ; ) {
                if ($pages >= 10000) throw new RuntimeException('Limite de páginas excedido.');
                try { $batch = $read($offset, $size); }
                catch (Throwable $transportError) { throw new RuntimeException('Falha de transporte ao consultar GLPI.'); }
                $pages++;
                $http = $batch['_http_code'] ?? 0;
                if (!in_array($http, [200, 206], true) || isset($batch['_error'])) {
                    throw new RuntimeException('Falha na consulta GLPI (HTTP ' . (int)$http . ').');
                }
                $rows = $batch['items'] ?? null;
                if (!is_array($rows) || !array_is_list($rows)) {
                    throw new RuntimeException('Formato de coleção GLPI inválido.');
                }
                if (!preg_match('~/([0-9]+)$~', trim((string)($batch['_content_range'] ?? '')), $m)) {
                    throw new RuntimeException('GLPI não informou o total da coleção.');
                }
                $currentTotal = (int)$m[1];
                if ($total !== null && $currentTotal !== $total) {
                    throw new RuntimeException('Coleção alterada durante a leitura. Repita a sincronização.');
                }
                $total = $currentTotal;
                if (count($rows) > $size || $offset + count($rows) > $total) {
                    throw new RuntimeException('Quantidade inconsistente na coleção GLPI.');
                }
                foreach ($rows as $row) {
                    if (!is_array($row) || !isset($row['id']) || !ctype_digit((string)$row['id']) || (int)$row['id'] < 1) {
                        throw new RuntimeException('Ativo GLPI sem identificador válido.');
                    }
                    $key = (string)(int)$row['id'];
                    if (isset($seen[$key])) throw new RuntimeException('Página GLPI repetida ou ativo duplicado.');
                    $seen[$key] = true;
                    $items[] = $row;
                }
                $offset += count($rows);
                if ($offset === $total) break;
                if ($rows === []) throw new RuntimeException('Coleção GLPI terminou antes do total informado.');
                // A server may cap the requested page size. Advance by the received count.
            }
        } catch (Throwable $e) {
            // Never include transport exception text: upstream payloads may contain secrets.
            $errors[] = $e instanceof RuntimeException && $e->getCode() === 0
                ? $e->getMessage() : 'Falha ao ler coleção GLPI.';
        }
        return ['items' => $items, 'total' => $total, 'pages' => $pages,
            'complete' => $errors === [] && $total !== null && count($items) === $total,
            'errors' => $errors];
    }
}
