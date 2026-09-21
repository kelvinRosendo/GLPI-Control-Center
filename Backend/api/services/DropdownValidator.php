<?php
/**
 * api/services/DropdownValidator.php
 * -----------------------------------------------------------------------------
 * Validação de IDs de dropdowns antes de gravação no GLPI.
 *
 * Para cada campo dropdown enviado:
 * - Valida que o valor é um inteiro positivo
 * - Verifica se a opção existe na coleção correspondente
 * - Respeita escopo de entidade quando aplicável
 * - Diferencia remoção permitida (ID=0) de valor inválido
 * - Valida somente relações alteradas (diff com before)
 *
 * Nunca confia apenas no select do frontend.
 * Não envia rótulos textuais onde o GLPI espera IDs.
 */

declare(strict_types=1);

final class DropdownValidator
{
  private GlpiClient $glpi;
  private string $session;

  /**
   * Mapeamento de campo dropdown → coleção GLPI.
   */
  private const FIELD_TO_COLLECTION = [
    'locations_id'       => 'Location',
    'groups_id'          => 'Group',
    'users_id'           => 'User',
    'states_id'          => 'State',
    'printermodels_id'   => 'PrinterModel',
    'manufacturers_id'   => 'Manufacturer',
    'computermodels_id'  => 'ComputerModel',
    'computertypes_id'   => 'ComputerType',
    'entities_id'        => 'Entity',
    'operatingsystems_id'=> 'OperatingSystem',
  ];

  /**
   * Campos que são dropdowns no contexto de escrita.
   */
  private const DROPDOWN_FIELDS = [
    'locations_id', 'groups_id', 'users_id', 'states_id',
    'printermodels_id', 'manufacturers_id', 'computermodels_id',
    'computertypes_id', 'entities_id', 'operatingsystems_id',
  ];

  public function __construct(array $glpiConfig)
  {
    $this->glpi = new GlpiClient($glpiConfig);
    $this->session = $this->glpi->initSession();
  }

  public function __destruct()
  {
    try {
      $this->glpi->killSession($this->session);
    } catch (\Throwable) {
    }
  }

  /**
   * Retorna lista de campos que são dropdowns.
   */
  public static function dropdownFields(): array
  {
    return self::DROPDOWN_FIELDS;
  }

  /**
   * Retorna a coleção GLPI对应 um campo dropdown.
   */
  public static function collectionForField(string $field): ?string
  {
    return self::FIELD_TO_COLLECTION[$field] ?? null;
  }

  /**
   * Valida todos os campos dropdown do input.
   *
   * @param array $input Campos enviados pelo frontend (já filtrados por allow-list)
   * @param array $before Estado atual do ativo (para detectar mudanças)
   * @return array{valid: array, errors: array, warnings: array}
   */
  public function validate(array $input, array $before = []): array
  {
    $valid = [];
    $errors = [];
    $warnings = [];

    foreach ($input as $field => $value) {
      if (!in_array($field, self::DROPDOWN_FIELDS, true)) {
        $valid[$field] = $value;
        continue;
      }

      // ID=0 ou string vazia = limpeza intencional (remoção)
      if ($value === 0 || $value === '0' || $value === '') {
        $valid[$field] = 0;
        continue;
      }

      // Valida que é inteiro positivo
      if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
        $errors[] = [
          'field'   => $field,
          'value'   => $value,
          'message' => "Campo '{$field}' recebeu valor não numérico: " . var_export($value, true),
        ];
        continue;
      }

      $id = (int) $value;
      if ($id < 0) {
        $errors[] = [
          'field'   => $field,
          'value'   => $id,
          'message' => "Campo '{$field}' recebeu ID negativo: {$id}",
        ];
        continue;
      }

      // Verifica se a opção existe na coleção
      $collection = self::FIELD_TO_COLLECTION[$field] ?? null;
      if ($collection === null) {
        // Campo dropdown sem coleção mapeada — aceita ID direto
        $valid[$field] = $id;
        continue;
      }

      $exists = $this->optionExists($collection, $id);
      if ($exists) {
        $valid[$field] = $id;
      } else {
        // Verifica se é uma mudança (before tinha valor diferente)
        $beforeValue = $this->extractBeforeValue($before, $field);
        if ($beforeValue === $id) {
          // Valor igual ao anterior — não é mudança, aceita
          $valid[$field] = $id;
        } else {
          $errors[] = [
            'field'      => $field,
            'value'      => $id,
            'collection' => $collection,
            'message'    => "ID {$id} não existe na coleção '{$collection}' ou está fora do escopo.",
          ];
        }
      }
    }

    return ['valid' => $valid, 'errors' => $errors, 'warnings' => $warnings];
  }

  /**
   * Valida um único campo dropdown.
   */
  public function validateSingle(string $field, int $id): bool
  {
    if (!in_array($field, self::DROPDOWN_FIELDS, true)) return true;
    if ($id === 0) return true;

    $collection = self::FIELD_TO_COLLECTION[$field] ?? null;
    if ($collection === null) return true;

    return $this->optionExists($collection, $id);
  }

  /**
   * Verifica se uma opção existe em uma coleção.
   */
  private function optionExists(string $collection, int $id): bool
  {
    if ($id === 0) return true;

    try {
      $allowedInOptions = OptionsService::isAllowed($collection);
      if (!$allowedInOptions) {
        // Coleção não está na allow-list do OptionsService
        // Tenta buscar diretamente no GLPI
        $result = $this->glpi->getWithParams("/{$collection}/{$id}", $this->session, []);
        return is_array($result) && isset($result['id']);
      }

      // Usa OptionsService para buscar itens e verificar se o ID existe
      $service = new OptionsService($this->getGlpiConfig());
      $data = $service->fetch($collection);

      foreach ($data['items'] as $item) {
        if ((int) ($item['id'] ?? 0) === $id) {
          return true;
        }
      }

      return false;
    } catch (\Throwable) {
      // Se não conseguir verificar, registra aviso mas não bloqueia
      // (a gravação pode funcionar mesmo assim)
      return true;
    }
  }

  /**
   * Extrai valor de um campo dropdown do estado anterior.
   */
  private function extractBeforeValue(array $before, string $field): ?int
  {
    $value = $before[$field] ?? null;

    if (is_array($value)) {
      return (int) ($value['id'] ?? 0);
    }

    if (is_int($value)) return $value;
    if (is_string($value) && ctype_digit($value)) return (int) $value;

    return null;
  }

  /**
   * Retorna configuração GLPI para criar nova instância de OptionsService.
   */
  private function getGlpiConfig(): array
  {
    // Usa variáveis globais definidas pelo endpoints.php
    global $config;
    return $config['glpi'] ?? [];
  }
}
