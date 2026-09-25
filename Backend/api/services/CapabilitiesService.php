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
      'version'   => '0.3.0',
      'generated' => date('c'),
      'catalog'   => [
        'version' => $catalog['version'] ?? '0.0.0',
        'categories' => Classifier::allCategories(),
      ],
      'assetTypes' => self::assetTypes(),
      'editableFields' => self::editableFields(),
      'writeOperations' => self::writeOperations(),
      'auxiliaryCollections' => self::auxiliaryCollections(),
      'endpoints' => self::endpoints(),
      'permissions' => self::permissions(),
      'stateMapping' => $catalog['state_mapping'] ?? [],
    ];
  }

  /**
   * Tipos de ativo suportados com suas categorias e operações.
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
        'queryable'  => true,
        'creatable'  => true,
        'updatable'  => true,
        'deletable'  => true,
        'restorable' => true,
      ],
      'Printer' => [
        'label'      => 'Impressoras',
        'categories' => [
          'printer' => 'Impressora (GLPI)',
        ],
        'queryable'  => true,
        'creatable'  => true,
        'updatable'  => true,
        'deletable'  => true,
        'restorable' => true,
      ],
    ];
  }

  /**
   * Campos editáveis por itemtype, com separação de strings e dropdowns.
   */
  private static function editableFields(): array
  {
    return [
      'Computer' => [
        'strings' => [
          'name'        => 'Nome do ativo',
          'serial'      => 'Serial',
          'otherserial' => 'Patrimônio',
          'contact'     => 'Contato',
          'contact_num' => 'Telefone / ramal',
          'comment'     => 'Observações',
        ],
        'dropdowns' => [
          'locations_id' => 'Localização',
          'groups_id'    => 'Grupo',
          'users_id'     => 'Usuário',
          'states_id'    => 'Estado',
        ],
      ],
      'Printer' => [
        'strings' => [
          'name'        => 'Nome da impressora',
          'serial'      => 'Serial',
          'otherserial' => 'Patrimônio',
          'contact'     => 'Contato',
          'contact_num' => 'Telefone / ramal',
          'comment'     => 'Observações',
        ],
        'dropdowns' => [
          'locations_id'    => 'Localização',
          'users_id'        => 'Usuário',
          'states_id'       => 'Estado',
          'printermodels_id'=> 'Modelo',
          'manufacturers_id'=> 'Fabricante',
        ],
      ],
    ];
  }

  /**
   * Operações de escrita suportadas por itemtype.
   */
  private static function writeOperations(): array
  {
    return [
      'Computer' => [
        'create' => [
          'label'              => 'Criar Computador',
          'required'           => ['name'],
          'optional'           => ['serial', 'otherserial', 'contact', 'contact_num', 'comment', 'locations_id', 'groups_id', 'users_id', 'states_id'],
          'requiresEntity'     => true,
        ],
        'update' => [
          'label'              => 'Atualizar Computador',
          'editable'           => ['name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment', 'locations_id', 'groups_id', 'users_id', 'states_id'],
        ],
        'delete' => [
          'label'              => 'Excluir Computador (logicamente)',
          'description'        => 'Define states_id como Inativo',
          'requiresStateCollection' => true,
        ],
        'restore' => [
          'label'              => 'Restaurar Computador',
          'description'        => 'Define states_id como Em uso',
          'requiresStateCollection' => true,
        ],
      ],
      'Printer' => [
        'create' => [
          'label'              => 'Criar Impressora',
          'required'           => ['name'],
          'optional'           => ['serial', 'otherserial', 'contact', 'contact_num', 'comment', 'locations_id', 'users_id', 'states_id', 'printermodels_id', 'manufacturers_id'],
          'requiresEntity'     => true,
        ],
        'update' => [
          'label'              => 'Atualizar Impressora',
          'editable'           => ['name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment', 'locations_id', 'users_id', 'states_id', 'printermodels_id', 'manufacturers_id'],
        ],
        'delete' => [
          'label'              => 'Excluir Impressora (logicamente)',
          'description'        => 'Define states_id como Inativo',
          'requiresStateCollection' => true,
        ],
        'restore' => [
          'label'              => 'Restaurar Impressora',
          'description'        => 'Define states_id como Em uso',
          'requiresStateCollection' => true,
        ],
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
        'name'     => $col,
        'label'    => OptionsService::collectionLabel($col),
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
        'all'               => '/api/assets/all',
        'computers'         => '/api/assets/computers',
        'printers'          => '/api/assets/impressoras',
        'projetors'         => '/api/assets/projetores',
        'chromebooks'       => '/api/assets/chromebooks-geekiees',
        'chromebooks_apoio' => '/api/assets/chromebooks-apoio',
        'chromebooks_exib'  => '/api/assets/chromebooks-exibicao',
      ],
      'details' => [
        'computer' => '/api/assets/computers/{id}',
        'printer'  => '/api/assets/printers/{id}',
        'projetor' => '/api/projetors/{id}',
      ],
      'write' => [
        'create_computer'  => ['method' => 'POST',   'path' => '/api/assets/computers'],
        'update_computer'  => ['method' => 'POST',   'path' => '/api/assets/computers/{id}'],
        'delete_computer'  => ['method' => 'POST',   'path' => '/api/assets/computers/{id}/delete'],
        'restore_computer' => ['method' => 'POST',   'path' => '/api/assets/computers/{id}/restore'],
        'create_printer'   => ['method' => 'POST',   'path' => '/api/assets/printers'],
        'update_printer'   => ['method' => 'POST',   'path' => '/api/assets/printers/{id}'],
        'delete_printer'   => ['method' => 'POST',   'path' => '/api/assets/printers/{id}/delete'],
        'restore_printer'  => ['method' => 'POST',   'path' => '/api/assets/printers/{id}/restore'],
      ],
      'auxiliary' => [
        'options'      => '/api/options/{collection}',
        'capabilities' => '/api/capabilities',
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
        'computadores' => ['view', 'search', 'edit', 'openTicket', 'create', 'delete', 'restore'],
        'projetores'   => ['view', 'edit', 'maintenance'],
        'impressoras'  => ['view', 'edit', 'create', 'delete', 'restore'],
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
