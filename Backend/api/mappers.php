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
      'reparticao' => self::extractName($c['locations_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),           // ← NOVO
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),  // ← NOVO
      'grupo'      => self::extractName($c['groups_id'] ?? null),          // ← NOVO
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
      'grupo'      => self::extractName($c['groups_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),           // ← NOVO
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),  // ← NOVO
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
      'usuario'    => self::extractName($c['users_id'] ?? null),           // ← NOVO
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),  // ← NOVO
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
      'Carrinho 5'  => [],
      'Apoio Geral' => [],
    ];

    foreach ($items as $c) {
      $grupo = self::extractName($c['groups_id'] ?? null); // ← MELHORADO

      if (str_contains($grupo ?? '', 'Carrinho 1') || str_contains($grupo ?? '', 'carrinho 1')) {
        $carrinhos['Carrinho 1'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo ?? '', 'Carrinho 2') || str_contains($grupo ?? '', 'carrinho 2')) {
        $carrinhos['Carrinho 2'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo ?? '', 'Carrinho 3') || str_contains($grupo ?? '', 'carrinho 3')) {
        $carrinhos['Carrinho 3'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo ?? '', 'Carrinho 4') || str_contains($grupo ?? '', 'carrinho 4')) {
        $carrinhos['Carrinho 4'][] = self::chromebookApoio($c);
      } elseif (str_contains($grupo ?? '', 'Carrinho 5') || str_contains($grupo ?? '', 'carrinho 5')) {
        $carrinhos['Carrinho 5'][] = self::chromebookApoio($c);
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
      'reparticao' => self::extractName($c['locations_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),           // ← NOVO
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),  // ← NOVO
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
      'reparticao' => self::extractName($p['locations_id'] ?? null),
      'usuario'    => self::extractName($p['users_id'] ?? null),           // ← NOVO
      'modelo'     => self::extractName($p['printermodels_id'] ?? null),   // ← NOVO (impressora usa printermodels_id)
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

  /**
   * Extrai o nome de um campo expandido do GLPI.
   * 
   * Quando expand_dropdowns=true, o GLPI retorna:
   * - Se for string: já é o nome (ex: "João Silva")
   * - Se for int: é o ID (não expandiu - fallback)
   * - Se for null: não tem valor
   * 
   * @param mixed $value
   * @return string|null
   */
  private static function extractName(mixed $value): ?string
  {
    // Se for string válida, retorna
    if (is_string($value) && $value !== '' && $value !== '0') {
      return $value;
    }
    
    // Se for int positivo, mostra como ID (fallback)
    if (is_int($value) && $value > 0) {
      return "ID: {$value}";
    }
    
    // Senão, não tem valor
    return null;
  }
}