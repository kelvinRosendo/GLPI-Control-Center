<?php
/**
 * api/mappers.php
 */

declare(strict_types=1);

final class Mappers
{
  private const EDITABLE_COMPUTER_FIELDS = [
    'name',
    'serial',
    'otherserial',
    'contact',
    'contact_num',
    'comment',
  ];

  public static function computer(array $c): array
  {
    return [
      'glpiId'     => $c['id'] ?? null,
      'nome'       => $c['name'] ?? '',
      'serial'     => $c['serial'] ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
      'reparticao' => self::extractName($c['locations_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),
      'grupo'      => self::extractName($c['groups_id'] ?? null),
    ];
  }

  public static function chromebookGeekiee(array $c): array
  {
    return [
      'glpiId'     => $c['id'] ?? null,
      'nome'       => $c['name'] ?? '',
      'serial'     => $c['serial'] ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
      'grupo'      => self::extractName($c['groups_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),
    ];
  }

  public static function chromebookApoio(array $c): array
  {
    return [
      'glpiId'     => $c['id'] ?? null,
      'nome'       => $c['name'] ?? '',
      'serial'     => $c['serial'] ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
      'usuario'    => self::extractName($c['users_id'] ?? null),
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),
    ];
  }

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
      $grupo = self::extractName($c['groups_id'] ?? null);

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

    return array_filter($carrinhos, fn($v) => count($v) > 0);
  }

  public static function projetor(array $c): array
  {
    return [
      'glpiId'     => $c['id'] ?? null,
      'nome'       => $c['name'] ?? '',
      'serial'     => $c['serial'] ?? '',
      'patrimonio' => $c['otherserial'] ?? '',
      'status'     => self::status($c),
      'reparticao' => self::extractName($c['locations_id'] ?? null),
      'usuario'    => self::extractName($c['users_id'] ?? null),
      'modelo'     => self::extractName($c['computermodels_id'] ?? null),
    ];
  }

  public static function impressora(array $p): array
  {
    return [
      'glpiId'     => $p['id'] ?? null,
      'nome'       => $p['name'] ?? '',
      'serial'     => $p['serial'] ?? '',
      'patrimonio' => $p['otherserial'] ?? '',
      'status'     => self::status($p),
      'reparticao' => self::extractName($p['locations_id'] ?? null),
      'usuario'    => self::extractName($p['users_id'] ?? null),
      'modelo'     => self::extractName($p['printermodels_id'] ?? null),
    ];
  }

  public static function computerDetails(array $c): array
  {
    return [
      'asset' => self::computer($c),
      'editableValues' => self::extractEditableValues($c),
      'sections' => [
        self::detailSection('identificacao', 'Identificação', [
          self::detailField('name', 'Nome do ativo', $c['name'] ?? '', true),
          self::detailField('serial', 'Serial', $c['serial'] ?? '', true),
          self::detailField('otherserial', 'Patrimônio', $c['otherserial'] ?? '', true),
          self::detailField('contact', 'Contato', $c['contact'] ?? '', true),
          self::detailField('contact_num', 'Telefone / ramal', $c['contact_num'] ?? '', true),
          self::detailField('comment', 'Observações', $c['comment'] ?? '', true, 'textarea'),
        ]),
        self::detailSection('alocacao', 'Alocação', [
          self::detailField('location_name', 'Local', self::extractName($c['locations_id'] ?? null), false),
          self::detailField('group_name', 'Grupo', self::extractName($c['groups_id'] ?? null), false),
          self::detailField('user_name', 'Usuário', self::extractName($c['users_id'] ?? null), false),
          self::detailField('state_label', 'Status no GLPI', self::extractStateLabel($c), false),
          self::detailField('entity_name', 'Entidade', self::extractName($c['entities_id'] ?? null), false),
        ]),
        self::detailSection('dados_tecnicos', 'Dados técnicos', [
          self::detailField('model_name', 'Modelo', self::extractName($c['computermodels_id'] ?? null), false),
          self::detailField('manufacturer_name', 'Fabricante', self::extractName($c['manufacturers_id'] ?? null), false),
          self::detailField('type_name', 'Tipo', self::extractName($c['computertypes_id'] ?? null), false),
          self::detailField('uuid', 'UUID', $c['uuid'] ?? '', false),
          self::detailField('os_name', 'Sistema operacional', self::extractName($c['operatingsystems_id'] ?? null), false),
          self::detailField('os_version_name', 'Versão do sistema', self::extractName($c['operatingsystemversions_id'] ?? null), false),
        ]),
        self::detailSection('rastreio', 'Rastreio', [
          self::detailField('id', 'ID GLPI', self::rawString($c['id'] ?? ''), false),
          self::detailField('date_creation', 'Criado em', self::rawString($c['date_creation'] ?? ''), false),
          self::detailField('date_mod', 'Atualizado em', self::rawString($c['date_mod'] ?? ''), false),
          self::detailField('template_name', 'Template', self::extractName($c['template_name'] ?? null), false),
        ]),
      ],
    ];
  }

  public static function filterEditableComputerInput(array $input): array
  {
    $filtered = [];

    foreach (self::EDITABLE_COMPUTER_FIELDS as $field) {
      if (!array_key_exists($field, $input)) {
        continue;
      }

      $value = $input[$field];
      $filtered[$field] = is_string($value) ? trim($value) : '';
    }

    return $filtered;
  }

  private static function status(array $item): string
  {
    $stateId = $item['states_id'] ?? null;
    if ($stateId === null || $stateId === 0) return 'ativo';

    return match ((int) $stateId) {
      2       => 'manutencao',
      3       => 'emprestado',
      default => 'ativo',
    };
  }

  private static function extractName(mixed $value): ?string
  {
    if (is_string($value) && $value !== '' && $value !== '0') {
      return $value;
    }

    if (is_int($value) && $value > 0) {
      return "ID: {$value}";
    }

    return null;
  }

  private static function detailSection(string $id, string $title, array $fields): array
  {
    return [
      'id' => $id,
      'title' => $title,
      'fields' => array_values(array_filter(
        $fields,
        static fn(array $field): bool => $field['displayValue'] !== ''
      )),
    ];
  }

  private static function detailField(
    string $key,
    string $label,
    ?string $value,
    bool $editable,
    string $inputType = 'text'
  ): array {
    $normalized = self::rawString($value);

    return [
      'key' => $key,
      'label' => $label,
      'value' => $normalized,
      'displayValue' => $normalized,
      'editable' => $editable,
      'inputType' => $inputType,
    ];
  }

  private static function extractEditableValues(array $c): array
  {
    $values = [];

    foreach (self::EDITABLE_COMPUTER_FIELDS as $field) {
      $values[$field] = self::rawString($c[$field] ?? '');
    }

    return $values;
  }

  private static function rawString(mixed $value): string
  {
    if ($value === null) {
      return '';
    }

    if (is_scalar($value)) {
      return trim((string) $value);
    }

    return '';
  }

  private static function extractStateLabel(array $item): string
  {
    $expanded = self::extractName($item['states_id'] ?? null);
    if ($expanded !== null) {
      return $expanded;
    }

    return match ((int) ($item['states_id'] ?? 0)) {
      2 => 'Em manutenção',
      3 => 'Emprestado',
      default => 'Ativo',
    };
  }
}
