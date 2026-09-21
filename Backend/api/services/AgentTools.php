<?php
/**
 * GLPI Control Center - AgentTools.php
 * -----------------------------------------------------------------------------
 * Ferramentas de consulta disponíveis para o agente de IA.
 *
 * Cada ferramenta tem descrição, schema de argumentos, validação
 * e execução usando os serviços existentes.
 *
 * Sprint 06: Agente de IA
 */

class AgentTools {

  private AIProvider $provider;
  private ?string $userId;
  private array $limits;
  private array $glpiConfig;

  public function __construct(AIProvider $provider, ?string $userId = null) {
    $this->provider = $provider;
    $this->userId = $userId;
    $this->limits = [
      'max_results' => 50,
      'max_search_length' => 100,
      'tool_call_timeout' => 10,
    ];
    $this->glpiConfig = [
      'url' => getenv('GLPI_URL') ?: '',
      'app_token' => getenv('GLPI_APP_TOKEN') ?: '',
      'user_token' => getenv('GLPI_USER_TOKEN') ?: '',
      'ssl_insecure' => (getenv('GLPI_SSL_INSECURE') ?: '0') === '1',
    ];
  }

  /**
   * Retorna definição de todas as ferramentas no formato OpenAI.
   */
  public function getDefinitions(): array {
    return [
      $this->defBuscarAtivos(),
      $this->defConsultarAtivo(),
      $this->defConsultarCapacidades(),
      $this->defConsultarOpcoes(),
      $this->defConsultarHorasProjetor(),
      $this->defConsultarStatusSincronizacao(),
      $this->defConsultarReconciliacao(),
      $this->defConsultarOperacao(),
      $this->defPrepararAlteracao(),
      $this->defExecutarProposta(),
      $this->defCancelarProposta(),
      $this->defConsultarPoliticas(),
    ];
  }

  /**
   * Executa uma ferramenta pelo nome com os argumentos fornecidos.
   */
  public function execute(string $toolName, array $args): array {
    $startTime = microtime(true);

    $method = 'exec_' . str_replace('-', '_', $toolName);
    if (!method_exists($this, $method)) {
      return [
        'success' => false,
        'error' => "Ferramenta não encontrada: {$toolName}",
      ];
    }

    $validation = $this->validateArgs($toolName, $args);
    if (!$validation['valid']) {
      return [
        'success' => false,
        'error' => $validation['error'],
      ];
    }

    try {
      $result = $this->$method($args);
    } catch (\Exception $e) {
      $result = [
        'success' => false,
        'error' => 'Erro interno: ' . $e->getMessage(),
      ];
    }

    $duration = round((microtime(true) - $startTime) * 1000);
    $result['tool_name'] = $toolName;
    $result['duration_ms'] = $duration;

    return $result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEFINIÇÕES DAS FERRAMENTAS
  // ══════════════════════════════════════════════════════════════════════════

  private function defBuscarAtivos(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'buscar_ativos',
        'description' => 'Busca ativos por nome, serial ou patrimônio. Retorna lista com identificação básica. Use para localizar ativos específicos.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'query' => [
              'type' => 'string',
              'description' => 'Termo de busca (nome, serial, patrimônio ou parte do nome)',
            ],
            'category' => [
              'type' => 'string',
              'description' => 'Filtrar por categoria: computer_cs, chromebook_student, chromebook_support, chromebook_display, printer, projector',
            ],
            'limit' => [
              'type' => 'integer',
              'description' => 'Número máximo de resultados (padrão: 20, máximo: 50)',
            ],
          ],
          'required' => ['query'],
        ],
      ],
    ];
  }

  private function defConsultarAtivo(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_ativo',
        'description' => 'Consulta detalhes completos de um ativo específico por itemtype e ID. Retorna todos os campos disponíveis incluindo dados brutos do GLPI.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'itemtype' => [
              'type' => 'string',
              'description' => 'Tipo do item: Computer ou Printer',
              'enum' => ['Computer', 'Printer'],
            ],
            'id' => [
              'type' => 'integer',
              'description' => 'ID do ativo no GLPI',
            ],
          ],
          'required' => ['itemtype', 'id'],
        ],
      ],
    ];
  }

  private function defConsultarCapacidades(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_capacidades',
        'description' => 'Retorna o contrato de capacidades do sistema: tipos de ativos suportados, campos editáveis, operações de escrita permitidas, coleções auxiliares e limites.',
        'parameters' => [
          'type' => 'object',
          'properties' => [],
          'required' => [],
        ],
      ],
    ];
  }

  private function defConsultarOpcoes(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_opcoes',
        'description' => 'Lista opções disponíveis de uma coleção auxiliar (grupos, estados, localizações, usuários, fabricantes, modelos, categorias de chamado).',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'collection' => [
              'type' => 'string',
              'description' => 'Nome da coleção',
              'enum' => ['Group', 'State', 'Location', 'Manufacturer', 'ComputerModel', 'ComputerType', 'User', 'Entity', 'PrinterModel', 'PrinterType', 'ItilCategory'],
            ],
          ],
          'required' => ['collection'],
        ],
      ],
    ];
  }

  private function defConsultarHorasProjetor(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_horas_projetor',
        'description' => 'Consulta horas de uso e manutenção de um projetor. Dados vindos do projectors.json (GCC), não do GLPI.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'name' => [
              'type' => 'string',
              'description' => 'Nome do projetor para busca',
            ],
          ],
          'required' => ['name'],
        ],
      ],
    ];
  }

  private function defConsultarStatusSincronizacao(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_status_sincronizacao',
        'description' => 'Retorna status da sincronização: idade do cache, contagem de itens, última atualização.',
        'parameters' => [
          'type' => 'object',
          'properties' => [],
          'required' => [],
        ],
      ],
    ];
  }

  private function defConsultarReconciliacao(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_reconciliacao',
        'description' => 'Compara dados do GLPI com o cache local. Mostra divergências, itens apenas no GLPI, apenas no GCC, e sincronizados.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'category' => [
              'type' => 'string',
              'description' => 'Filtrar por categoria específica (opcional)',
            ],
          ],
          'required' => [],
        ],
      ],
    ];
  }

  private function defConsultarOperacao(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_operacao',
        'description' => 'Consulta status de uma operação de escrita pelo ID da operação.',
        'parameters' => [
          [
            'type' => 'object',
            'properties' => [
              'operation_id' => [
                'type' => 'string',
                'description' => 'UUID da operação',
              ],
            ],
            'required' => ['operation_id'],
          ],
        ],
      ],
    ];
  }

  private function defPrepararAlteracao(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'preparar_alteracao',
        'description' => 'Prepara uma proposta de alteração SEM executar. Retorna: identificador, ação, campos atuais vs propostos, permissões e pendências. NENHUMA alteração é feita no GLPI.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'action' => [
              'type' => 'string',
              'description' => 'Tipo de ação',
              'enum' => ['create', 'update', 'delete', 'restore'],
            ],
            'itemtype' => [
              'type' => 'string',
              'description' => 'Tipo do item',
              'enum' => ['Computer', 'Printer'],
            ],
            'id' => [
              'type' => 'integer',
              'description' => 'ID do ativo (para update, delete, restore)',
            ],
            'fields' => [
              'type' => 'object',
              'description' => 'Campos a alterar (para create/update)',
            ],
          ],
          'required' => ['action', 'itemtype'],
        ],
      ],
    ];
  }

  private function defExecutarProposta(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'executar_proposta',
        'description' => 'Executa uma proposta PREVIAMENTE CONFIRMADA pelo usuário. Retorna o resultado da operação com status, antes/depois e erros. Requer confirmação explícita do usuário.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'proposal_id' => [
              'type' => 'string',
              'description' => 'ID da proposta a executar (formato: prop_...)',
            ],
          ],
          'required' => ['proposal_id'],
        ],
      ],
    ];
  }

  private function defCancelarProposta(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'cancelar_proposta',
        'description' => 'Cancela uma proposta pendente. Impede que ela seja executada.',
        'parameters' => [
          'type' => 'object',
          'properties' => [
            'proposal_id' => [
              'type' => 'string',
              'description' => 'ID da proposta a cancelar (formato: prop_...)',
            ],
          ],
          'required' => ['proposal_id'],
        ],
      ],
    ];
  }

  private function defConsultarPoliticas(): array {
    return [
      'type' => 'function',
      'function' => [
        'name' => 'consultar_politicas',
        'description' => 'Retorna as políticas de autonomia do agente: modos disponíveis, operações permitidas, limites de lote e campos protegidos.',
        'parameters' => [
          'type' => 'object',
          'properties' => [],
          'required' => [],
        ],
      ],
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  private function validateArgs(string $toolName, array $args): array {
    switch ($toolName) {
      case 'buscar_ativos':
        if (empty($args['query'])) {
          return ['valid' => false, 'error' => 'Parâmetro "query" é obrigatório'];
        }
        if (strlen($args['query']) > $this->limits['max_search_length']) {
          return ['valid' => false, 'error' => 'Busca muito longa (máximo ' . $this->limits['max_search_length'] . ' caracteres)'];
        }
        break;

      case 'consultar_ativo':
        if (empty($args['itemtype']) || !in_array($args['itemtype'], ['Computer', 'Printer'])) {
          return ['valid' => false, 'error' => 'itemtype deve ser Computer ou Printer'];
        }
        if (empty($args['id']) || !is_numeric($args['id'])) {
          return ['valid' => false, 'error' => 'id deve ser numérico'];
        }
        break;

      case 'consultar_opcoes':
        $allowed = ['Group', 'State', 'Location', 'Manufacturer', 'ComputerModel', 'ComputerType', 'User', 'Entity', 'PrinterModel', 'PrinterType', 'ItilCategory'];
        if (empty($args['collection']) || !in_array($args['collection'], $allowed)) {
          return ['valid' => false, 'error' => 'Coleção não permitida: ' . ($args['collection'] ?? 'vazio')];
        }
        break;

      case 'consultar_operacao':
        if (empty($args['operation_id'])) {
          return ['valid' => false, 'error' => 'Parâmetro "operation_id" é obrigatório'];
        }
        break;

      case 'preparar_alteracao':
        if (empty($args['action']) || !in_array($args['action'], ['create', 'update', 'delete', 'restore'])) {
          return ['valid' => false, 'error' => 'action deve ser create, update, delete ou restore'];
        }
        if (empty($args['itemtype']) || !in_array($args['itemtype'], ['Computer', 'Printer'])) {
          return ['valid' => false, 'error' => 'itemtype deve ser Computer ou Printer'];
        }
        if (in_array($args['action'], ['update', 'delete', 'restore']) && empty($args['id'])) {
          return ['valid' => false, 'error' => 'id é obrigatório para update, delete e restore'];
        }
        break;

      case 'executar_proposta':
        if (empty($args['proposal_id'])) {
          return ['valid' => false, 'error' => 'proposal_id é obrigatório'];
        }
        if (!preg_match('/^prop_[a-f0-9]+$/', $args['proposal_id'])) {
          return ['valid' => false, 'error' => 'Formato de proposal_id inválido'];
        }
        break;

      case 'cancelar_proposta':
        if (empty($args['proposal_id'])) {
          return ['valid' => false, 'error' => 'proposal_id é obrigatório'];
        }
        break;
    }

    return ['valid' => true];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO DAS FERRAMENTAS
  // ══════════════════════════════════════════════════════════════════════════

  private function exec_buscar_ativos(array $args): array {
    $query = strtolower(trim($args['query']));
    $category = $args['category'] ?? null;
    $limit = min((int)($args['limit'] ?? 20), $this->limits['max_results']);

    $cache = AssetService::fromCache();
    if ($cache === null) {
      return [
        'success' => true,
        'data' => [],
        'message' => 'Cache não disponível. Sincronize primeiro.',
        'source' => 'cache',
      ];
    }

    $items = $cache['items'] ?? [];
    $results = [];

    foreach ($items as $item) {
      if (count($results) >= $limit) break;

      $name = strtolower($item['name'] ?? '');
      $serial = strtolower($item['serial'] ?? '');
      $otherserial = strtolower($item['otherserial'] ?? '');
      $cat = $item['_classification']['category'] ?? '';

      if ($category && $cat !== $category) continue;

      if (
        str_contains($name, $query) ||
        str_contains($serial, $query) ||
        str_contains($otherserial, $query)
      ) {
        $results[] = [
          'itemtype' => $item['itemtype'] ?? 'Unknown',
          'id' => $item['id'] ?? 0,
          'name' => $item['name'] ?? '',
          'serial' => $item['serial'] ?? '',
          'otherserial' => $item['otherserial'] ?? '',
          'category' => $cat,
          'location' => is_array($item['locations_id'] ?? null) ? ($item['locations_id']['name'] ?? '') : ($item['locations_id'] ?? ''),
        ];
      }
    }

    return [
      'success' => true,
      'data' => $results,
      'total' => count($results),
      'source' => 'cache',
      'cache_age' => $cache['_meta']['generated'] ?? 'desconhecido',
    ];
  }

  private function exec_consultar_ativo(array $args): array {
    $itemtype = $args['itemtype'];
    $id = (int)$args['id'];

    $result = AssetService::get($itemtype, $id);

    if ($result === null) {
      return [
        'success' => true,
        'data' => null,
        'message' => "Ativo não encontrado: {$itemtype}:{$id}",
        'source' => 'glpi+cache',
      ];
    }

    return [
      'success' => true,
      'data' => $result,
      'source' => 'glpi+cache',
    ];
  }

  private function exec_consultar_capacidades(array $args): array {
    $contract = CapabilitiesService::getContract();

    return [
      'success' => true,
      'data' => $contract,
      'source' => 'static',
    ];
  }

  private function exec_consultar_opcoes(array $args): array {
    $collection = $args['collection'];

    if (!OptionsService::isAllowed($collection)) {
      return [
        'success' => false,
        'error' => "Coleção não permitida: {$collection}",
      ];
    }

    try {
      $service = new OptionsService($this->glpiConfig);
      $result = $service->fetch($collection);
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => 'Erro ao buscar coleção: ' . $e->getMessage(),
      ];
    }

    return [
      'success' => true,
      'data' => $result,
      'source' => 'glpi',
      'collection' => $collection,
      'label' => OptionsService::collectionLabel($collection),
    ];
  }

  private function exec_consultar_horas_projetor(array $args): array {
    $name = strtolower(trim($args['name']));
    $projectors = [];
    $cachePath = __DIR__ . '/../../data/projectors.json';

    if (file_exists($cachePath)) {
      $raw = file_get_contents($cachePath);
      $projectors = json_decode($raw, true) ?? [];
    }

    $results = [];
    foreach ($projectors as $p) {
      $pName = strtolower($p['name'] ?? '');
      if (str_contains($pName, $name)) {
        $results[] = [
          'name' => $p['name'] ?? '',
          'lamp_hours' => $p['lamp_hours'] ?? null,
          'last_maintenance' => $p['last_maintenance'] ?? null,
          'next_maintenance' => $p['next_maintenance'] ?? null,
          'location' => $p['location'] ?? '',
          'source' => 'projectors.json (GCC)',
          'note' => 'Dados do GCC, não confirmados no GLPI',
        ];
      }
    }

    return [
      'success' => true,
      'data' => $results,
      'total' => count($results),
      'source' => 'projectors.json',
      'warning' => 'Horas e manutenção são dados locais do GCC, não consultados no GLPI.',
    ];
  }

  private function exec_consultar_status_sincronizacao(array $args): array {
    $cachePath = __DIR__ . '/../../data/classified_assets.json';
    $exists = file_exists($cachePath);
    $age = null;
    $count = 0;

    if ($exists) {
      $stat = stat($cachePath);
      $age = date('Y-m-d H:i:s', $stat['mtime']);
      $data = json_decode(file_get_contents($cachePath), true);
      $count = count($data['items'] ?? []);
    }

    return [
      'success' => true,
      'data' => [
        'cache_exists' => $exists,
        'cache_last_update' => $age,
        'total_items' => $count,
        'source' => 'local cache',
      ],
    ];
  }

  private function exec_consultar_reconciliacao(array $args): array {
    $category = $args['category'] ?? null;

    try {
      $service = new ReconcileService($this->glpiConfig);
      $result = $service->compare($category);
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => 'Erro na reconciliação: ' . $e->getMessage(),
      ];
    }

    return [
      'success' => true,
      'data' => $result,
      'source' => 'glpi+cache',
      'warning' => 'Reconciliação pode estar parcial se houver limitações de permissão.',
    ];
  }

  private function exec_consultar_operacao(array $args): array {
    $operationId = $args['operation_id'];

    try {
      $tracker = new OperationTracker();
      $operation = $tracker->find($operationId);
    } catch (\Exception $e) {
      return [
        'success' => false,
        'error' => 'Erro ao buscar operação: ' . $e->getMessage(),
      ];
    }

    if ($operation === null) {
      return [
        'success' => true,
        'data' => null,
        'message' => "Operação não encontrada: {$operationId}",
      ];
    }

    return [
      'success' => true,
      'data' => $operation,
    ];
  }

  private function exec_preparar_alteracao(array $args): array {
    $action = $args['action'];
    $itemtype = $args['itemtype'];
    $id = $args['id'] ?? null;
    $fields = $args['fields'] ?? [];

    $proposal = AgentProposal::create($action, $itemtype, $id, $fields, $this->userId);

    return [
      'success' => true,
      'data' => $proposal,
      'message' => 'Proposta preparada. NENHUMA alteração foi executada.',
      'warning' => 'PRÉVIA — nenhuma alteração executada. Use o ID da proposta para confirmar ou cancelar.',
    ];
  }

  private function exec_executar_proposta(array $args): array {
    $proposalId = $args['proposal_id'];

    $execution = new AgentExecution($this->glpiConfig, $this->userId);
    $result = $execution->executeProposal($proposalId);

    return [
      'success' => $result['success'],
      'data' => $result,
      'message' => $result['success']
        ? 'Proposta executada com sucesso.'
        : 'Falha ao executar proposta: ' . ($result['error'] ?? 'Erro desconhecido'),
    ];
  }

  private function exec_cancelar_proposta(array $args): array {
    $proposalId = $args['proposal_id'];

    $proposal = AgentProposal::cancel($proposalId);

    if ($proposal === null) {
      return [
        'success' => false,
        'error' => 'Proposta não encontrada ou não pode ser cancelada',
      ];
    }

    return [
      'success' => true,
      'data' => $proposal,
      'message' => 'Proposta cancelada com sucesso.',
    ];
  }

  private function exec_consultar_politicas(array $args): array {
    $execution = new AgentExecution($this->glpiConfig, $this->userId);

    return [
      'success' => true,
      'data' => [
        'policies' => $execution->getPolicies(),
        'user_mode' => $execution->getUserMode(),
      ],
      'source' => 'static',
    ];
  }
}
