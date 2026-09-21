<?php
/**
 * api/services/CapabilitiesService.php
 * -----------------------------------------------------------------------------
 * Gerador do contrato de capacidades (capabilities contract).
 *
 * Retorna o que o backend GLPI pode fazer, quais campos são editáveis,
 * quais coleções auxiliares estão disponíveis, e metadados do sistema.
 */

declare(strict_types=1);

final class CapabilitiesService
{
  /**
   * Retorna o contrato de capacidades completo.
   */
  public static function getContract(): array
  {
    $catalog = Classifier::getCatalog();

    return [
      'version'   => '0.2.0',
      'generated' => date('c'),
      'catalog'   => [
        'version' => $catalog['version'] ?? '0.0.0',
        'categories' => Classifier::allCategories(),
      ],
      'assetTypes' => self::assetTypes(),
      'editableFields' => self::editableFields(),
      'auxiliaryCollections' => self::auxiliaryCollections(),
      'endpoints' => self::endpoints(),
      'permissions' => self::permissions(),
      'stateMapping' => $catalog['state_mapping'] ?? [],
    ];
  }

  /**
   * Tipos de ativo suportados com suas categorias.
   */
  private static function assetTypes(): array
  {
    return [
      'Computer' => [
        'label'      => 'Computadores',
        'categories' => [
          'chromebook_student' => 'Alunos',
          'chromebook_display' => 'Exibição',
          'chromebook_support' => 'Apoio',
          'computer_cs'        => 'Computadores CS/CO',
          'printer_computer'   => 'Impressoras (via Computer)',
          'projector'          => 'Projetores',
          'unclassified'       => 'Não classificado',
        ],
        'queryable' => true,
      ],
      'Printer' => [
        'label'      => 'Impressoras',
        'categories' => [
          'printer' => 'Impressora (GLPI)',
        ],
        'queryable' => true,
      ],
    ];
  }

  /**
   * Campos editáveis por itemtype.
   */
  private static function editableFields(): array
  {
    return [
      'Computer' => [
        'fields' => ['name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment'],
        'labels' => [
          'name'        => 'Nome do ativo',
          'serial'      => 'Serial',
          'otherserial' => 'Patrimônio',
          'contact'     => 'Contato',
          'contact_num' => 'Telefone / ramal',
          'comment'     => 'Observações',
        ],
      ],
      'Printer' => [
        'fields' => [],
        'labels' => [],
      ],
    ];
  }

  /**
   * Coleções auxiliares disponíveis.
   */
  private static function auxiliaryCollections(): array
  {
    $collections = OptionsService::allowedCollections();

    return array_map(function (string $col) {
      return [
        'name'  => $col,
        'label' => OptionsService::collectionLabel($col),
        'endpoint' => '/api/options/' . $col,
      ];
    }, $collections);
  }

  /**
   * Endpoints disponíveis no backend.
   */
  private static function endpoints(): array
  {
    return [
      'assets' => [
        'all'              => '/api/assets/all',
        'computers'        => '/api/assets/computers',
        'printers'         => '/api/assets/impressoras',
        'projetors'        => '/api/assets/projetores',
        'chromebooks'      => '/api/assets/chromebooks-geekiees',
        'chromebooks_apoio'=> '/api/assets/chromebooks-apoio',
        'chromebooks_exib' => '/api/assets/chromebooks-exibicao',
      ],
      'details' => [
        'computer' => '/api/assets/computers/{id}',
        'printer'  => '/api/assets/printers/{id}',
        'projetor' => '/api/projetors/{id}',
      ],
      'auxiliary' => [
        'options'     => '/api/options/{collection}',
        'capabilities'=> '/api/capabilities',
      ],
      'reconcile' => [
        'compare' => '/api/reconcile/compare',
      ],
      'sync' => [
        'status'      => '/api/sync/status',
        'report'      => '/api/sync/report',
        'cache_state' => '/api/sync/cache-state',
      ],
    ];
  }

  /**
   * Módulos de permissão disponíveis.
   */
  private static function permissions(): array
  {
    return [
      'modules' => [
        'computadores' => ['view', 'search', 'edit', 'openTicket'],
        'projetores'   => ['view', 'edit', 'maintenance'],
        'impressoras'  => ['view', 'edit'],
        'chamados'     => ['view', 'create', 'edit'],
        'relatorios'   => ['view', 'export', 'configure'],
        'auditoria'    => ['view', 'export', 'clear'],
        'assistente'   => ['view', 'chat'],
        'settings'     => ['view', 'manage'],
      ],
      'profiles' => ['ADMIN', 'SUPORTE'],
    ];
  }
}
