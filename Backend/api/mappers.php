<?php
/**
 * api/mappers.php
 * -----------------------------------------------------------------------------
 * Mapeadores: GLPI (formato bruto) -> formato padronizado do painel.
 */

declare(strict_types=1);

final class Mappers
{
  /**
   * Mapeia um Computer do GLPI para o formato do frontend.
   */
  public static function computer(array $c): array
  {
    return [
      'glpiId' => $c['id'] ?? null,
      'nome' => $c['name'] ?? '',
      'serial' => $c['serial'] ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status' => self::status($c),
      // opcional (depende do seu GLPI):
      'reparticao' => $c['locations_id'] ?? null,
    ];
  }

  /**
   * Mapeia status do GLPI para: ativo | manutencao | emprestado
   * Ajuste conforme os IDs reais do seu GLPI (states_id).
   */
  private static function status(array $item): string
  {
    $stateId = $item['states_id'] ?? null;
    if ($stateId === null) return 'ativo';

    return match ((int)$stateId) {
      2 => 'manutencao',
      3 => 'emprestado',
      default => 'ativo',
    };
  }
}