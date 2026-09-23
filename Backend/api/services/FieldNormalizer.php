<?php
/**
 * FieldNormalizer.php
 * -----------------------------------------------------------------------------
 * Normalização reutilizável para comparação GLPI x GCC.
 * Reuso da lógica de reconciliação — distinguir semânticas.
 *
 * - Preserva zeros à esquerda de serial/otherserial (strings)
 * - Distingue ID e rótulo de dropdown (id vs name)
 * - Diferencia vazio/null/zero conforme campo
 * - Decodifica entidades HTML (&amp; etc)
 * - Normaliza datas/fuso para UTC ISO quando possível
 * - Não compara campos derivados (stateSummary é sintético)
 *
 * Sprint 08
 */
declare(strict_types=1);

final class FieldNormalizer
{
  // Campos que NUNCA devem ser comparados como se fossem oficiais do GLPI
  private const DERIVED_FIELDS = ['stateSummary', 'category', 'categoryLabel', 'purpose', 'cart', 'classificationConfidence', 'classificationWarnings', 'classificationSource', 'classificationVersion', 'location', 'groupPath', 'stateRaw'];

  // Campos que devem preservar zeros à esquerda (strings exatas)
  private const PRESERVE_ZEROS = ['serial', 'otherserial'];

  // Campos dropdown: comparar por ID, não por rótulo
  private const DROPDOWN_FIELDS = ['locations_id','groups_id','users_id','states_id','printermodels_id','manufacturers_id','computermodels_id','computertypes_id','printertypes_id','entities_id','operatingsystems_id'];

  // Campos que são datas
  private const DATE_FIELDS = ['date_mod','date_creation'];

  public static function isDerived(string $field): bool
  {
    return in_array($field, self::DERIVED_FIELDS, true);
  }

  public static function isDropdown(string $field): bool
  {
    return in_array($field, self::DROPDOWN_FIELDS, true);
  }

  public static function isPreserveZeros(string $field): bool
  {
    return in_array($field, self::PRESERVE_ZEROS, true);
  }

  /**
   * Normaliza valor bruto do GLPI para comparação.
   * Retorna string para campos textuais, int para dropdowns.
   */
  public static function normalize(string $field, mixed $value): mixed
  {
    if ($value === null) {
      // null vs vazio: para campos PreserveZeros, null vira '' (vazio)
      if (self::isPreserveZeros($field)) return '';
      if (self::isDropdown($field)) return 0;
      return '';
    }

    // Dropdown: sempre ID numérico
    if (self::isDropdown($field)) {
      if (is_array($value)) {
        $id = $value['id'] ?? null;
        if ($id === null || is_array($id)) return null;
        // Se veio como string com ID embutido "Group:1" não: extrair id
        if (is_string($id) && ctype_digit(trim($id))) return (int) trim($id);
        return (int) $id;
      }
      if (is_string($value) && ctype_digit(trim($value))) return (int) trim($value);
      if (is_int($value)) return $value;
      if ($value === '' || $value === '0') return 0;
      // Se veio rótulo textual, não há ID — marcar como não verificável (null)
      return null;
    }

    // Preserve zeros: NÃO trim que remove zeros internos; apenas manter exato com trim externo
    if (self::isPreserveZeros($field)) {
      if (is_array($value)) $value = $value['name'] ?? '';
      $str = (string) $value;
      // Não converter para int, não remover zeros à esquerda
      // Decodificar entidades mas manter conteúdo
      $str = html_entity_decode($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
      return $str; // zeros preservados
    }

    // Datas: normalizar para ISO UTC se parseável
    if (in_array($field, self::DATE_FIELDS, true)) {
      if (is_array($value)) $value = $value['name'] ?? '';
      $str = trim((string) $value);
      if ($str === '') return '';
      // Tenta parsear como data GLPI (YYYY-MM-DD HH:MM:SS)
      $ts = strtotime($str);
      if ($ts !== false) {
        return gmdate('Y-m-d\TH:i:s\Z', $ts);
      }
      $str = html_entity_decode($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
      return $str;
    }

    // Geral: string com entidades decodificadas, trimmed, espaços normalizados
    if (is_array($value)) {
      $value = $value['name'] ?? $value['completename'] ?? '';
    }
    $str = (string) $value;
    $str = html_entity_decode($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $str = trim($str);
    // Normalizar múltiplos espaços mas não afetar zeros not-preserved aqui
    $str = preg_replace('/\s+/', ' ', $str);
    return $str;
  }

  /**
   * Compara dois valores brutos (expected vs observed).
   * Retorna ['equal'=>bool, 'reason'=>?string, 'normalized_expected'=>mixed, 'normalized_observed'=>mixed]
   */
  public static function compare(string $field, mixed $expected, mixed $observed): array
  {
    if (self::isDerived($field)) {
      return ['equal' => true, 'skipped' => true, 'reason' => 'derived_field', 'normalized_expected' => null, 'normalized_observed' => null];
    }

    $nExp = self::normalize($field, $expected);
    $nObs = self::normalize($field, $observed);

    if ($nExp === null || $nObs === null) {
      // Dropdown sem ID → não verificável
      return ['equal' => false, 'verifiable' => false, 'reason' => 'unverifiable_dropdown_label', 'normalized_expected' => $nExp, 'normalized_observed' => $nObs];
    }

    // Para PreserveZeros, comparação estrita de string (inclui zeros)
    if (self::isPreserveZeros($field)) {
      $eq = ((string) $nExp) === ((string) $nObs);
      return ['equal' => $eq, 'normalized_expected' => $nExp, 'normalized_observed' => $nObs];
    }

    // Datas: comparar normalizado
    // Dropdown: comparar int
    // Texto: case-sensitive mas trimmed já
    $eq = $nExp === $nObs;
    // Transformação legítima: GLPI pode trim/escape — se ambos trimmed iguais, considerar igual mesmo se original diferente (mas guardamos original)
    return ['equal' => $eq, 'normalized_expected' => $nExp, 'normalized_observed' => $nObs];
  }

  /**
   * Descreve tipo de divergência para relatório.
   */
  public static function divergencyKind(string $field, array $cmp): ?string
  {
    if ($cmp['skipped'] ?? false) return null;
    if (!($cmp['verifiable'] ?? true)) return 'unverifiable';
    if ($cmp['equal']) return null;
    // Heurística transformação legítima: só espaços/entidades
    $origExp = $cmp['normalized_expected'];
    $origObs = $cmp['normalized_observed'];
    // Se após decode/trim são iguais, mas antes não — seria legítimo, mas aqui já normalizamos
    return 'divergent';
  }
}
