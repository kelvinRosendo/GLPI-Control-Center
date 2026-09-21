<?php
/**
 * api/services/OptionsService.php
 * -----------------------------------------------------------------------------
 * Serviço de coleções auxiliares (dropdowns, referências).
 *
 * Fornece listas de Group, State, Location, Manufacturer, ComputerModel,
 * ComputerType, User, Entity, PrinterModel, PrinterType, ItilCategory.
 *
 * Coleções permitidas são definidas na allow-list interna.
 * 403 do GLPI ≠ lista vazia — retorna erro explícito.
 */

declare(strict_types=1);

final class OptionsService
{
  private GlpiClient $glpi;
  private string $session;

  private const ALLOWED_COLLECTIONS = [
    'Group'            => '/Group',
    'State'            => '/State',
    'Location'         => '/Location',
    'Manufacturer'     => '/Manufacturer',
    'ComputerModel'    => '/ComputerModel',
    'ComputerType'     => '/ComputerType',
    'User'             => '/User',
    'Entity'           => '/Entity',
    'PrinterModel'     => '/PrinterModel',
    'PrinterType'      => '/PrinterType',
    'ItilCategory'     => '/ItilCategory',
  ];

  private const COLLECTION_LABELS = [
    'Group'            => 'Grupos',
    'State'            => 'Estados',
    'Location'         => 'Localizações',
    'Manufacturer'     => 'Fabricantes',
    'ComputerModel'    => 'Modelos de Computador',
    'ComputerType'     => 'Tipos de Computador',
    'User'             => 'Usuários',
    'Entity'           => 'Entidades',
    'PrinterModel'     => 'Modelos de Impressora',
    'PrinterType'      => 'Tipos de Impressora',
    'ItilCategory'     => 'Categorias de Chamado',
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
   * Retorna a lista de coleções permitidas.
   */
  public static function allowedCollections(): array
  {
    return array_keys(self::ALLOWED_COLLECTIONS);
  }

  /**
   * Verifica se uma coleção é permitida.
   */
  public static function isAllowed(string $collection): bool
  {
    return isset(self::ALLOWED_COLLECTIONS[$collection]);
  }

  /**
   * Retorna o label de uma coleção.
   */
  public static function collectionLabel(string $collection): string
  {
    return self::COLLECTION_LABELS[$collection] ?? $collection;
  }

  /**
   * Busca todos os itens de uma coleção permitida.
   *
   * @return array{items: array, total: int, collection: string, label: string}
   */
  public function fetch(string $collection): array
  {
    if (!self::isAllowed($collection)) {
      Responde::erro(
        "Coleção '{$collection}' não é permitida.",
        403,
        ['allowed' => self::allowedCollections()]
      );
    }

    $path = self::ALLOWED_COLLECTIONS[$collection];

    try {
      $result = $this->glpi->getAllWithParams($path, $this->session, [
        'expand_dropdowns' => 'true',
        'order' => 'ASC',
        'criteria' => json_encode([['FIELDS' => ['id', 'name', 'completename']]]),
      ], 500);

      $items = array_map(function (array $item) use ($collection) {
        return [
          'id'         => $item['id'] ?? 0,
          'name'       => $item['name'] ?? '',
          'completename' => $item['completename'] ?? $item['name'] ?? '',
        ];
      }, array_values(array_filter($result['items'], 'is_array')));

      usort($items, fn(array $a, array $b): int => strcmp($a['name'], $b['name']));

      return [
        'items'      => $items,
        'total'      => count($items),
        'collection' => $collection,
        'label'      => self::collectionLabel($collection),
      ];
    } catch (\Throwable $e) {
      $msg = $e->getMessage();
      if (str_contains($msg, '403') || stripos($msg, 'access denied') !== false) {
        Responde::erro(
          "GLPI retornou 403 para a coleção '{$collection}'. Verifique as permissões da conta de integração.",
          502,
          ['collection' => $collection, 'glpi_error' => $msg]
        );
      }
      throw $e;
    }
  }

  /**
   * Retorna dados simulados para uma coleção (para testes sem GLPI).
   */
  public static function fixtures(string $collection): array
  {
    $fixtures = [
      'Group' => [
        ['id' => 1, 'name' => 'TI', 'completename' => 'TI'],
        ['id' => 2, 'name' => 'Carrinho 1', 'completename' => 'Apoio > Carrinho > Carrinho 1'],
        ['id' => 3, 'name' => 'Carrinho 2', 'completename' => 'Apoio > Carrinho > Carrinho 2'],
      ],
      'State' => [
        ['id' => 1, 'name' => 'Em uso', 'completename' => 'Em uso'],
        ['id' => 2, 'name' => 'Comodato Geekie', 'completename' => 'Comodato Geekie'],
        ['id' => 3, 'name' => 'Finalizado', 'completename' => 'Finalizado'],
        ['id' => 4, 'name' => 'Permanente', 'completename' => 'Permanente'],
      ],
      'Location' => [
        ['id' => 1, 'name' => 'Sala 01', 'completename' => 'Sala 01'],
        ['id' => 2, 'name' => 'Sala 02', 'completename' => 'Sala 02'],
      ],
      'Manufacturer' => [
        ['id' => 1, 'name' => 'Acer', 'completename' => 'Acer'],
        ['id' => 2, 'name' => 'Samsung', 'completename' => 'Samsung'],
        ['id' => 3, 'name' => 'Dell', 'completename' => 'Dell'],
      ],
    ];

    $items = $fixtures[$collection] ?? [];

    return [
      'items'      => $items,
      'total'      => count($items),
      'collection' => $collection,
      'label'      => self::collectionLabel($collection),
      'simulated'  => true,
    ];
  }
}
