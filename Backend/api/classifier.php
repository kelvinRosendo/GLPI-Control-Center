<?php
/**
 * api/classifier.php
 * -----------------------------------------------------------------------------
 * Classificação centralizada de ativos do GLPI.
 *
 * Esta é a interface pública para toda a classificação. Usa o pipeline interno
 * com catálogo configurável. Regras antigas mantidas por compatibilidade.
 *
 * Novos códigos de categoria (v2):
 *   printer, projector, printer_computer, chromebook_student, chromebook_display,
 *   chromebook_support, computer_cs, unclassified
 *
 * Códigos legados (v1) mapeados para v2:
 *   alunos → chromebook_student, apoio → chromebook_support, exibicao → chromebook_display,
 *   computador → computer_cs, impressora → printer_computer, projetor → projector,
 *   outros → unclassified
 *
 * NÃO altere esta arquivo sem atualizar a versão do catálogo em config/asset-catalog.php.
 */

declare(strict_types=1);

final class Classifier
{
  // ── Categorias legadas (mantidas para compatibilidade) ──────────────────────
  public const CAT_ALUNOS     = 'alunos';
  public const CAT_APOIO      = 'apoio';
  public const CAT_EXIBICAO   = 'exibicao';
  public const CAT_COMPUTADOR = 'computador';
  public const CAT_IMPRESSORA = 'impressora';
  public const CAT_PROJETOR   = 'projetor';
  public const CAT_OUTROS     = 'outros';

  // ── Categorias novas ────────────────────────────────────────────────────────
  public const CAT_PRINTER            = 'printer';
  public const CAT_PROJECTOR          = 'projector';
  public const CAT_PRINTER_COMPUTER   = 'printer_computer';
  public const CAT_CHROMEBOOK_STUDENT = 'chromebook_student';
  public const CAT_CHROMEBOOK_DISPLAY = 'chromebook_display';
  public const CAT_CHROMEBOOK_SUPPORT = 'chromebook_support';
  public const CAT_COMPUTER_CS        = 'computer_cs';
  public const CAT_UNCLASSIFIED       = 'unclassified';

  private static ?ClassificationPipeline $pipeline = null;
  private static ?array $catalog = null;

  /**
   * Retorna o pipeline de classificação (singleton).
   */
  private static function getPipeline(): ClassificationPipeline
  {
    if (self::$pipeline === null) {
      self::$catalog = require __DIR__ . '/../config/asset-catalog.php';
      self::$pipeline = new ClassificationPipeline(self::$catalog);
    }
    return self::$pipeline;
  }

  /**
   * Retorna o catálogo carregado.
   */
  public static function getCatalog(): array
  {
    if (self::$catalog === null) {
      self::$catalog = require __DIR__ . '/../config/asset-catalog.php';
    }
    return self::$catalog;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Interface pública — Pipeline de classificação
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Classificação completa de um ativo (pipeline v2).
   *
   * @param array $raw Asset bruto do GLPI (com expand_dropdowns)
   * @return array Asset classificado com todos os campos derivados
   */
  public static function classifyAsset(array $raw): array
  {
    return self::getPipeline()->run($raw);
  }

  /**
   * Classifica um lote de ativos.
   * Retorna array com {items, stats}.
   */
  public static function classifyBatch(array $rawItems): array
  {
    $items = [];
    $stats = [
      'total'       => count($rawItems),
      'classified'  => 0,
      'unclassified'=> 0,
      'byCategory'  => [],
      'byItemtype'  => [],
      'byState'     => [],
      'byGroup'     => [],
      'byPurpose'   => [],
      'warnings'    => [],
    ];

    foreach ($rawItems as $raw) {
      if (!is_array($raw)) continue;
      $classified = self::classifyAsset($raw);
      $items[] = $classified;

      $cat = $classified['category'];
      $itemtype = $classified['itemtype'];
      $state = $classified['stateSummary'];
      $group = $classified['groupPath'] ?: '(sem grupo)';
      $purpose = $classified['purpose'] ?: '(sem purpose)';

      if ($cat === self::CAT_UNCLASSIFIED) {
        $stats['unclassified']++;
      } else {
        $stats['classified']++;
      }

      $stats['byCategory'][$cat] = ($stats['byCategory'][$cat] ?? 0) + 1;
      $stats['byItemtype'][$itemtype] = ($stats['byItemtype'][$itemtype] ?? 0) + 1;
      $stats['byState'][$state] = ($stats['byState'][$state] ?? 0) + 1;
      $stats['byGroup'][$group] = ($stats['byGroup'][$group] ?? 0) + 1;
      $stats['byPurpose'][$purpose] = ($stats['byPurpose'][$purpose] ?? 0) + 1;

      foreach ($classified['classificationWarnings'] as $w) {
        $stats['warnings'][] = [
          'id'      => $classified['id'],
          'itemtype'=> $classified['itemtype'],
          'name'    => $classified['name'],
          'warning' => $w,
        ];
      }
    }

    $stats['byCategory'] = arsort($stats['byCategory']) ? $stats['byCategory'] : $stats['byCategory'];
    $stats['byItemtype'] = arsort($stats['byItemtype']) ? $stats['byItemtype'] : $stats['byItemtype'];

    return ['items' => $items, 'stats' => $stats];
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Interface legada — compatibilidade com código existente
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Classifica um equipamento Computer pelo nome (v1 legado).
   * Retorna uma das constantes CAT_*.
   */
  public static function classifyComputerByName(string $nome): string
  {
    $n = trim($nome);
    if ($n === '') return self::CAT_OUTROS;

    if (preg_match('/^Chrome\s+G-/i', $n)) return self::CAT_ALUNOS;
    if (preg_match('/^Chrome[\s-]+.*EDU/i', $n)) return self::CAT_EXIBICAO;
    if (preg_match('/^Chrome-/i', $n)) return self::CAT_APOIO;
    if (preg_match('/^(CS-|CO-)/i', $n)) return self::CAT_COMPUTADOR;
    if (preg_match('/^Projetor/i', $n)) return self::CAT_PROJETOR;
    if (preg_match('/^(EPSON|Pantum|RICOH|SAMSUNG|Impressora)/i', $n)) return self::CAT_IMPRESSORA;

    return self::CAT_OUTROS;
  }

  /**
   * Classifica por computertypes_id do GLPI (v1 legado).
   */
  public static function classifyByType(array $item): string
  {
    $type = $item['computertypes_id'] ?? null;
    $typeName = '';
    if (is_string($type)) $typeName = strtolower(trim($type));
    elseif (is_array($type)) $typeName = strtolower(trim($type['name'] ?? ''));

    if ($typeName === 'projetor' || $typeName === 'projetores') return self::CAT_PROJETOR;
    if ($typeName === 'impressora' || $typeName === 'impressoras') return self::CAT_IMPRESSORA;

    return '';
  }

  /**
   * Classificação combinada (v1 legado).
   * Retorna [categoria, subtipo].
   */
  public static function classify(array $item): array
  {
    $nome = trim($item['name'] ?? '');

    $byType = self::classifyByType($item);
    if ($byType !== '') return [$byType, ''];

    $cat = self::classifyComputerByName($nome);

    $subtipo = '';
    if ($cat === self::CAT_ALUNOS) $subtipo = 'alunos';
    elseif ($cat === self::CAT_APOIO) $subtipo = 'apoio';
    elseif ($cat === self::CAT_EXIBICAO) $subtipo = 'exibicao';

    return [$cat, $subtipo];
  }

  // ── Carrinhos ──────────────────────────────────────────────────────────────

  /**
   * Extrai o nome do carrinho da hierarquia de grupos GLPI.
   */
  public static function extractCartFromGroup(array $item): string
  {
    $group = $item['groups_id'] ?? null;
    $groupName = '';
    if (is_array($group)) $groupName = trim($group['name'] ?? '');
    elseif (is_string($group)) $groupName = trim($group);

    if ($groupName === '') return '';

    $parts = array_map('trim', explode('>', $groupName));

    $carrinhoIdx = -1;
    foreach ($parts as $i => $part) {
      if (strtolower($part) === 'carrinho') {
        if ($i < count($parts) - 1 && strtolower($parts[$i + 1]) === 'carrinho') {
          $carrinhoIdx = $i + 1;
          break;
        }
        if ($i === count($parts) - 1 && preg_match('/carrinho\s+\d+/i', $part)) {
          return $part;
        }
        $carrinhoIdx = $i;
      }
    }

    if ($carrinhoIdx >= 0 && $carrinhoIdx < count($parts) - 1) {
      $child = $parts[$carrinhoIdx + 1];
      if (preg_match('/^carrinho\s+\d+$/i', $child)) {
        return $child;
      }
    }

    $last = end($parts);
    if (preg_match('/^carrinho\s+\d+$/i', $last)) {
      return $last;
    }

    return '';
  }

  /**
   * Extrai o caminho completo do grupo (para exibição).
   */
  public static function extractGroupPath(array $item): string
  {
    $group = $item['groups_id'] ?? null;
    $groupName = '';
    if (is_array($group)) $groupName = trim($group['name'] ?? '');
    elseif (is_string($group)) $groupName = trim($group);
    return $groupName;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Chave única: itemtype + id.
   */
  public static function uniqueKey(array $item): string
  {
    $itemtype = $item['itemtype'] ?? 'Computer';
    $id = $item['id'] ?? 0;
    return $itemtype . ':' . $id;
  }

  /**
   * Label legível da categoria.
   */
  public static function categoryLabel(string $cat): string
  {
    return match ($cat) {
      self::CAT_ALUNOS             => 'Alunos',
      self::CAT_APOIO              => 'Apoio',
      self::CAT_EXIBICAO           => 'Exibição',
      self::CAT_COMPUTADOR         => 'Computadores',
      self::CAT_IMPRESSORA         => 'Impressoras',
      self::CAT_PROJETOR           => 'Projetores',
      self::CAT_OUTROS             => 'Outros',
      self::CAT_PRINTER            => 'Impressora (GLPI)',
      self::CAT_PROJECTOR          => 'Projetor',
      self::CAT_PRINTER_COMPUTER   => 'Impressora',
      self::CAT_CHROMEBOOK_STUDENT => 'Alunos',
      self::CAT_CHROMEBOOK_DISPLAY => 'Exibição',
      self::CAT_CHROMEBOOK_SUPPORT => 'Apoio',
      self::CAT_COMPUTER_CS        => 'Computadores',
      self::CAT_UNCLASSIFIED       => 'Não classificado',
      default                      => $cat,
    };
  }

  /**
   * Retorna todas as categorias com labels.
   */
  public static function allCategories(): array
  {
    return [
      self::CAT_COMPUTER_CS        => 'Computadores',
      self::CAT_CHROMEBOOK_STUDENT => 'Alunos',
      self::CAT_CHROMEBOOK_SUPPORT => 'Apoio',
      self::CAT_CHROMEBOOK_DISPLAY => 'Exibição',
      self::CAT_PRINTER_COMPUTER   => 'Impressoras',
      self::CAT_PROJECTOR          => 'Projetores',
      self::CAT_PRINTER            => 'Impressora (GLPI)',
      self::CAT_UNCLASSIFIED       => 'Não classificado',
    ];
  }

  /**
   * Converte categoria legada para nova.
   */
  public static function legacyToNew(string $legacy): string
  {
    return match ($legacy) {
      self::CAT_ALUNOS     => self::CAT_CHROMEBOOK_STUDENT,
      self::CAT_APOIO      => self::CAT_CHROMEBOOK_SUPPORT,
      self::CAT_EXIBICAO   => self::CAT_CHROMEBOOK_DISPLAY,
      self::CAT_COMPUTADOR => self::CAT_COMPUTER_CS,
      self::CAT_IMPRESSORA => self::CAT_PRINTER_COMPUTER,
      self::CAT_PROJETOR   => self::CAT_PROJECTOR,
      self::CAT_OUTROS     => self::CAT_UNCLASSIFIED,
      default              => $legacy,
    };
  }
}
