<?php
/**
 * api/mappers.php
 * -----------------------------------------------------------------------------
 * Mapeadores: GLPI (formato bruto) -> formato padronizado do painel.
 */

declare(strict_types=1);

final class Mappers
{
  // ──────────────────────────────────────────────────────────────────────────
  // COMPUTADORES
  // ──────────────────────────────────────────────────────────────────────────

  public static function computer(array $c): array
  {
    return [
      'glpiId'     => $c['id']           ?? null,
      'nome'       => $c['name']         ?? '',
      'serial'     => $c['serial']       ?? '',
      'patrimonio' => $c['otherserial']  ?? '',
      'status'     => self::status($c),
      'reparticao' => $c['locations_id'] ?? null,
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHROMEBOOKS GEEKIEES
  // ──────────────────────────────────────────────────────────────────────────

  public static function chromebookGeekiee(array $c): array
  {
    return [
      'glpiId'     => $c['id']          ?? null,
      'nome'       => $c['name']        ?? '',
      'serial'     => $c['serial']      ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
      'grupo'      => is_string($c['groups_id'] ?? null) ? $c['groups_id'] : null,
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHROMEBOOKS APOIO — retorna { "Carrinho 1": [...], ... }
  // ──────────────────────────────────────────────────────────────────────────

  public static function chromebooksApoioAgrupados(array $items): array
  {
    $carrinhos = [
      'Carrinho 1' => [],
      'Carrinho 2' => [],
      'Carrinho 3' => [],
      'Carrinho 4' => [],
      'Apoio Geral' => [],
    ];

    foreach ($items as $c) {
      $grupo = is_string($c['groups_id'] ?? null) ? $c['groups_id'] : '';

      if (str_contains($grupo, 'Carrinho 1')) {
        $carrinhos['Carrinho 1'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 2')) {
        $carrinhos['Carrinho 2'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 3')) {
        $carrinhos['Carrinho 3'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 4')) {
        $carrinhos['Carrinho 4'][] = self::chromebookApoio($c);
      } else {
        $carrinhos['Apoio Geral'][] = self::chromebookApoio($c);
      }
    }

    return array_filter($carrinhos, fn($v) => count($v) > 0);
  }

  public static function chromebookApoio(array $c): array
  {
    return [
      'glpiId'     => $c['id']          ?? null,
      'nome'       => $c['name']        ?? '',
      'serial'     => $c['serial']      ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PROJETORES
  // ──────────────────────────────────────────────────────────────────────────

  public static function projetor(array $c): array
  {
    return [
      'glpiId'     => $c['id']           ?? null,
      'nome'       => $c['name']         ?? '',
      'serial'     => $c['serial']       ?? '',
      'patrimonio' => $c['otherserial']  ?? '',
      'status'     => self::status($c),
      'reparticao' => $c['locations_id'] ?? null,
      'modelo'     => is_string($c['computermodels_id'] ?? null)
                        ? $c['computermodels_id'] : null,
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // IMPRESSORAS
  // ──────────────────────────────────────────────────────────────────────────

  public static function impressora(array $p): array
  {
    return [
      'glpiId'     => $p['id']           ?? null,
      'nome'       => $p['name']         ?? '',
      'serial'     => $p['serial']       ?? '',
      'patrimonio' => $p['otherserial']  ?? '',
      'status'     => self::status($p),
      'reparticao' => $p['locations_id'] ?? null,
      'modelo'     => is_string($p['printermodels_id'] ?? null)
                        ? $p['printermodels_id'] : null,
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPER — mapeia states_id -> status legível
  // Ajuste os IDs conforme Configuração > Listas suspensas > Estados no GLPI
  // ──────────────────────────────────────────────────────────────────────────

  private static function status(array $item): string
  {
    $stateId = $item['states_id'] ?? null;
    if ($stateId === null || $stateId === 0) return 'ativo';

    return match ((int)$stateId) {
      2       => 'manutencao',
      3       => 'emprestado',
      default => 'ativo',
    };
  }
}