<?php
declare(strict_types=1);

/** Bounded, fail-closed pagination with an injectable reader for network-free tests. */
final class RoomTicketsReader
{
    public static function collect(callable $readPage, int $limit = 10000): array
    {
        $rows = [];
        $total = null;
        $offset = 0;
        $deadline = microtime(true) + 45;
        do {
            if (microtime(true) > $deadline) throw new RuntimeException('Prazo da consulta excedido.');
            $batch = $readPage($offset, 200);
            $currentTotal = $batch['total'] ?? null;
            if (!is_int($currentTotal) || $currentTotal < 0 || $currentTotal > $limit) {
                throw new RuntimeException('Coleção excede o limite de consulta ou tem total inválido.');
            }
            if ($total !== null && $total !== $currentTotal) {
                throw new RuntimeException('A coleção mudou durante a consulta. Atualize novamente.');
            }
            $total = $currentTotal;
            $page = $batch['items'] ?? null;
            if (!is_array($page) || $page !== array_values($page)) throw new RuntimeException('Página inválida.');
            if (!$page && count($rows) < $total) throw new RuntimeException('Consulta incompleta.');
            foreach ($page as $row) {
                if (!is_array($row) || !isset($row['id']) || !ctype_digit((string) $row['id']) || (int) $row['id'] < 1) {
                    throw new RuntimeException('Registro inválido.');
                }
                $id = (int) $row['id'];
                if (isset($rows[$id])) throw new RuntimeException('Página repetida ou coleção alterada.');
                $rows[$id] = $row;
            }
            $offset += count($page);
            if (count($rows) > $total) throw new RuntimeException('Total inconsistente.');
        } while (count($rows) < $total);
        return array_values($rows);
    }
}
