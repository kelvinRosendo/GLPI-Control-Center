<?php
/**
 * api/classification_pipeline.php
 * -----------------------------------------------------------------------------
 * Pipeline de classificação de ativos — etapas independentes e reutilizáveis.
 *
 * Fluxo:
 *   normalizeAsset()
 *   → detectAssetType()
 *   → detectPurpose()
 *   → detectLocation()
 *   → normalizeState()
 *   → extractHistory()
 *   → calculateConfidence()
 *   → classifyAsset()
 *
 * Cada etapa pode ser alterada sem quebrar as demais.
 */

declare(strict_types=1);

final class ClassificationPipeline
{
  private array $catalog;

  public function __construct(array $catalog)
  {
    $this->catalog = $catalog;
  }

  /**
   * Pipeline completo: recebe asset bruto do GLPI, retorna asset classificado.
   */
  public function run(array $raw): array
  {
    $asset = $this->normalizeAsset($raw);
    $asset = $this->detectAssetType($asset);
    $asset = $this->detectPurpose($asset);
    $asset = $this->detectLocation($asset);
    $asset = $this->normalizeState($asset);
    $asset = $this->extractHistory($asset);
    $asset = $this->calculateConfidence($asset);
    $asset = $this->classifyAsset($asset);
    return $asset;
  }

  /**
   * Normaliza o asset bruto em estrutura padrão.
   */
  public function normalizeAsset(array $raw): array
  {
    $name = is_string($raw['name'] ?? '') ? trim($raw['name']) : '';
    $itemtype = is_string($raw['itemtype'] ?? '') ? $raw['itemtype'] : 'Computer';
    $id = is_int($raw['id'] ?? 0) ? (int) $raw['id'] : 0;

    return [
      'id'             => $id,
      'itemtype'       => $itemtype,
      'name'           => $name,
      'raw'            => $raw,
      // campos extraídos do raw
      'serial'         => $raw['serial'] ?? '',
      'otherserial'    => $raw['otherserial'] ?? '',
      'comments'       => $raw['comment'] ?? '',
      'location'       => '',
      'groupPath'      => '',
      'cart'           => '',
      'stateRaw'       => '',
      'stateSummary'   => '',
      'manufacturer'   => '',
      'model'          => '',
      'typeName'       => '',
      'category'       => '',
      'categoryLabel'  => '',
      'purpose'        => '',
      'classificationSource'     => '',
      'classificationConfidence' => 0.0,
      'classificationRule'       => '',
      'classificationVersion'    => '',
      'classificationWarnings'   => [],
    ];
  }

  /**
   * Detecta tipo técnico (computertypes_id, printertypes_id).
   */
  public function detectAssetType(array $asset): array
  {
    $raw = $asset['raw'];
    $itemtype = $asset['itemtype'];

    if ($itemtype === 'Printer') {
      $typeField = $raw['printertypes_id'] ?? $raw['computertypes_id'] ?? null;
      $asset['typeName'] = $this->extractName($typeField);
      $modelField = $raw['printermodels_id'] ?? $raw['computermodels_id'] ?? null;
      $asset['model'] = $this->extractName($modelField);
    } else {
      $typeField = $raw['computertypes_id'] ?? null;
      $asset['typeName'] = $this->extractName($typeField);
      $modelField = $raw['computermodels_id'] ?? null;
      $asset['model'] = $this->extractName($modelField);
    }

    $mfgField = $raw['manufacturers_id'] ?? null;
    $asset['manufacturer'] = $this->extractName($mfgField);

    return $asset;
  }

  /**
   * Detecta purpose (grupo, carrinho, localização).
   */
  public function detectPurpose(array $asset): array
  {
    $raw = $asset['raw'];

    $groupRaw = $raw['groups_id'] ?? null;
    $groupName = '';
    if (is_array($groupRaw)) {
      $groupName = trim($groupRaw['name'] ?? '');
      $completename = trim($groupRaw['completename'] ?? $groupName);
      $asset['groupPath'] = html_entity_decode($completename, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    } elseif (is_string($groupRaw) && $groupRaw !== '' && $groupRaw !== '0') {
      $decoded = html_entity_decode(trim($groupRaw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
      $groupName = $decoded;
      $asset['groupPath'] = $decoded;
    }

    $asset['cart'] = $this->extractCartFromGroup($asset['groupPath']);

    $locationRaw = $raw['locations_id'] ?? null;
    $asset['location'] = $this->extractName($locationRaw);

    return $asset;
  }

  /**
   * Detecta localização (group hierarchy → Carrinho ou grupo atual).
   */
  public function detectLocation(array $asset): array
  {
    if ($asset['cart'] !== '') {
      $asset['location'] = $asset['cart'];
    } elseif ($asset['groupPath'] !== '') {
      $asset['location'] = $asset['groupPath'];
    }
    return $asset;
  }

  /**
   * Normaliza estado do GLPI.
   */
  public function normalizeState(array $asset): array
  {
    $raw = $asset['raw'];
    $stateId = $raw['states_id'] ?? null;

    $asset['stateRaw'] = $this->extractStateRaw($stateId);
    $asset['stateSummary'] = $this->mapStateSummary($asset['stateRaw']);

    return $asset;
  }

  /**
   * Extrai indicadores do histórico de comentários.
   * Não altera campos atuais — apenas campos derivados.
   */
  public function extractHistory(array $asset): array
  {
    $comments = $asset['comments'];
    $asset['historyIndicators'] = [
      'hasAssistencia'  => stripos($comments, 'assistência') !== false
                        || stripos($comments, 'assistencia') !== false,
      'hasDefeito'      => stripos($comments, 'defeito') !== false,
      'hasDevolucao'    => stripos($comments, 'devolução') !== false
                        || stripos($comments, 'devolucao') !== false,
      'hasEmprestimo'   => stripos($comments, 'empréstimo') !== false
                        || stripos($comments, 'emprestimo') !== false,
    ];
    return $asset;
  }

  /**
   * Calcula confiança da classificação (0.0 a 1.0).
   */
  public function calculateConfidence(array $asset): array
  {
    $score = 0.5;
    $warnings = [];

    if ($asset['itemtype'] === 'Printer') {
      $score = 0.95;
      if ($asset['name'] !== '') {
        $score = 1.0;
      }
    } elseif ($asset['typeName'] !== '') {
      $score += 0.2;
    } elseif ($asset['name'] !== '') {
      $score += 0.15;
    } else {
      $warnings[] = 'Nome vazio — classificação pode ser imprecisa';
      $score -= 0.2;
    }

    if ($asset['groupPath'] === '') {
      $score -= 0.05;
    }

    $asset['classificationConfidence'] = max(0.0, min(1.0, $score));
    $asset['classificationWarnings'] = array_merge(
      $asset['classificationWarnings'],
      $warnings
    );

    return $asset;
  }

  /**
   * Classificação final: aplica regras do catálogo por prioridade.
   */
  public function classifyAsset(array $asset): array
  {
    $rules = $this->catalog['rules'] ?? [];
    $catalogVersion = $this->catalog['version'] ?? '0.0.0';

    usort($rules, fn(array $a, array $b): int => ($b['priority'] ?? 0) <=> ($a['priority'] ?? 0));

    $matchedRule = null;
    foreach ($rules as $rule) {
      if ($this->matchesRule($asset, $rule)) {
        $matchedRule = $rule;
        break;
      }
    }

    if ($matchedRule !== null) {
      $asset['category'] = $matchedRule['category'];
      $asset['categoryLabel'] = $matchedRule['label'] ?? $matchedRule['category'];
      $asset['purpose'] = $matchedRule['purpose'] ?? '';
      $asset['classificationSource'] = 'rule:' . ($matchedRule['category'] ?? 'unknown');
      $asset['classificationRule'] = $matchedRule['category'] ?? '';
      $asset['classificationVersion'] = $matchedRule['version'] ?? $catalogVersion;
    } else {
      $asset['category'] = 'unclassified';
      $asset['categoryLabel'] = 'Não classificado';
      $asset['purpose'] = '';
      $asset['classificationSource'] = 'unclassified';
      $asset['classificationRule'] = '';
      $asset['classificationVersion'] = $catalogVersion;
      $asset['classificationWarnings'][] = 'Nenhuma regra aplicável — revisar manualmente';
    }

    return $asset;
  }

  // ── Helpers privados ─────────────────────────────────────────────────────────

  private function matchesRule(array $asset, array $rule): bool
  {
    // Filtro por itemtype
    $allowedTypes = $rule['itemtype'] ?? null;
    if ($allowedTypes !== null && !in_array($asset['itemtype'], $allowedTypes, true)) {
      return false;
    }

    // Padrões de nome
    $namePatterns = $rule['namePatterns'] ?? [];
    if ($namePatterns !== []) {
      $matched = false;
      foreach ($namePatterns as $pattern) {
        if (preg_match($pattern, $asset['name']) === 1) {
          $matched = true;
          break;
        }
      }
      if (!$matched) return false;
    }

    // Padrões de tipo
    $typePatterns = $rule['typePatterns'] ?? [];
    if ($typePatterns !== []) {
      $matched = false;
      foreach ($typePatterns as $pattern) {
        if (preg_match($pattern, $asset['typeName']) === 1) {
          $matched = true;
          break;
        }
      }
      if (!$matched) return false;
    }

    // Padrões de grupo
    $groupPatterns = $rule['groupPatterns'] ?? [];
    if ($groupPatterns !== []) {
      $matched = false;
      foreach ($groupPatterns as $pattern) {
        if (preg_match($pattern, $asset['groupPath']) === 1) {
          $matched = true;
          break;
        }
      }
      if (!$matched) return false;
    }

    // Validação opcional
    $validator = $rule['validator'] ?? null;
    if ($validator !== null && is_callable($validator)) {
      if (!$validator($asset)) return false;
    }

    return true;
  }

  private function extractName(mixed $value): string
  {
    if (is_string($value) && $value !== '' && $value !== '0') {
      return $value;
    }
    if (is_array($value)) {
      return $value['name'] ?? $value['completename'] ?? '';
    }
    return '';
  }

  private function extractStateRaw(mixed $stateId): string
  {
    if (is_string($stateId) && $stateId !== '' && $stateId !== '0') {
      return $stateId;
    }
    if (is_array($stateId)) {
      return $stateId['name'] ?? $stateId['completename'] ?? '';
    }
    if (is_int($stateId) && $stateId > 0) {
      return (string) $stateId;
    }
    return '';
  }

  private function mapStateSummary(string $stateRaw): string
  {
    $mapping = $this->catalog['state_mapping'] ?? [];
    $lower = mb_strtolower(trim($stateRaw));

    if (isset($mapping[$lower])) {
      return $mapping[$lower];
    }

    foreach ($mapping as $pattern => $summary) {
      if (str_contains($lower, $pattern)) {
        return $summary;
      }
    }

    if ($stateRaw === '' || $stateRaw === '0') {
      return 'desconhecido';
    }

    return 'desconhecido';
  }

  private function extractCartFromGroup(string $groupPath): string
  {
    if ($groupPath === '') return '';

    $parts = array_map('trim', explode('>', $groupPath));

    foreach ($parts as $i => $part) {
      if (mb_strtolower($part) === 'carrinho' && $i < count($parts) - 1) {
        $child = $parts[$i + 1];
        if (preg_match('/^carrinho\s+\d+$/i', $child)) {
          return $child;
        }
      }
      if (preg_match('/^carrinho\s+\d+$/i', $part)) {
        return $part;
      }
    }

    return '';
  }
}
