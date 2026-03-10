<?php
/**
 * api/mappers.php
 */

declare(strict_types=1);

final class Mappers
{
  public static function computer(array $c): array
  {
    return [
      'glpiId'     => $c['id']           ?? null,
      'nome'       => $c['name']         ?? '',
      'serial'     => $c['serial']       ?? '',
      'patrimonio' => $c['otherserial']  ?? '',
      'status'     => self::status($c),
      'reparticao' => is_string($c['locations_id'] ?? null) ? $c['locations_id'] : null,
    ];
  }

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

  /**
   * Agrupa Chromebooks de Apoio por carrinho.
   * Tenta usar groups_id (se vier como string do GLPI).
   * Se não tiver grupo, coloca tudo em "Apoio Geral".
   */
  public static function chromebooksApoioAgrupados(array $items): array
  {
    $carrinhos = [
      'Carrinho 1'  => [],
      'Carrinho 2'  => [],
      'Carrinho 3'  => [],
      'Carrinho 4'  => [],
      'Apoio Geral' => [],
    ];

    foreach ($items as $c) {
      $grupo = is_string($c['groups_id'] ?? null) ? $c['groups_id'] : '';

      if (str_contains($grupo, 'Carrinho 1') || str_contains($grupo, 'carrinho 1')) {
        $carrinhos['Carrinho 1'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 2') || str_contains($grupo, 'carrinho 2')) {
        $carrinhos['Carrinho 2'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 3') || str_contains($grupo, 'carrinho 3')) {
        $carrinhos['Carrinho 3'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo, 'Carrinho 4') || str_contains($grupo, 'carrinho 4')) {
        $carrinhos['Carrinho 4'][] = self::chromebookApoio($c);
      } else {
        $carrinhos['Apoio Geral'][] = self::chromebookApoio($c);
      }
    }

    // Remove carrinhos vazios
    return array_filter($carrinhos, fn($v) => count($v) > 0);
  }

  public static function projetor(array $c): array
  {
    return [
      'glpiId'     => $c['id']           ?? null,
      'nome'       => $c['name']         ?? '',
      'serial'     => $c['serial']       ?? '',
      'patrimonio' => $c['otherserial']  ?? '',
      'status'     => self::status($c),
      'reparticao' => is_string($c['locations_id'] ?? null) ? $c['locations_id'] : null,
    ];
  }

  public static function impressora(array $p): array
  {
    return [
      'glpiId'     => $p['id']           ?? null,
      'nome'       => $p['name']         ?? '',
      'serial'     => $p['serial']       ?? '',
      'patrimonio' => $p['otherserial']  ?? '',
      'status'     => self::status($p),
      'reparticao' => is_string($p['locations_id'] ?? null) ? $p['locations_id'] : null,
    ];
  }

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