<?php
/**
 * VerificationService.php
 * -----------------------------------------------------------------------------
 * Serviço reutilizável de verificação GLPI × GCC.
 * Integrado a OperationTracker e ReconcileService.
 *
 * Para cada operação registra:
 *  operationId, proposalId, usuário, ação, itemtype:id, campos,
 *  resultado esperado, observado por camada, horários, cache version,
 *  divergências e limitações.
 *
 * Estados independentes: execution | glpi | cache | api | frontend
 *
 * Nunca armazena credenciais ou respostas completas desnecessárias.
 * Resposta de escrita é evidência distinta da releitura.
 *
 * Sprint 08
 */
declare(strict_types=1);

final class VerificationService
{
  private string $verifDir;
  private string $cacheFile;
  private OperationTracker $tracker;

  // Timeout e tentativas de verificação
  private const READ_TIMEOUT_MS = 5000;
  private const MAX_RETRIES = 3;

  public function __construct(?string $baseDir = null, ?OperationTracker $tracker = null)
  {
    $base = $baseDir ?? (realpath(__DIR__ . '/../../data') ?: __DIR__ . '/../../data');
    $this->verifDir = $base . '/verifications';
    $this->cacheFile = $base . '/cache/classified_assets.json';
    $this->tracker = $tracker ?? new OperationTracker();
    if (!is_dir($this->verifDir)) @mkdir($this->verifDir, 0755, true);
  }

  /**
   * Executa verificação completa das 5 camadas sem repetir escrita.
   *
   * @param string $operationId UUID da operação
   * @param array $glpiConfig config para re-leitura GLPI (se null, pula GLPI)
   * @param bool $isLocalOperation se true, GLPI = not_applicable
   * @return array verification report
   */
  public function verify(string $operationId, array $glpiConfig = [], bool $isLocalOperation = false): array
  {
    $op = $this->tracker->find($operationId);
    if ($op === null) {
      return ['error' => 'Operação não encontrada', 'operation_id' => $operationId, 'status' => 'not_found'];
    }

    $proposalId = $op['idempotency_key'] ?? $op['proposal_id'] ?? null;
    // Extrair proposalId de idempotency_key agent:prop_xxx
    if ($proposalId && str_starts_with($proposalId, 'agent:')) $proposalId = substr($proposalId, 6);

    $itemtype = $op['itemtype'];
    $id = $op['id'];
    $action = $op['action'];
    $userId = $op['user_id'] ?? 'unknown';
    $fields = $op['requested_fields'] ?? [];
    $isCreate = $action === 'create';

    $now = date('c');
    $layers = $this->emptyLayers();
    $divergences = [];
    $limitations = [];
    $expected = $fields;
    $observed = [];

    // ── 1) Execução (do tracker) ──────────────────────────────────────────
    $layers['execution'] = $this->mapExecutionLayer($op);

    // ── 2) GLPI (releitura) ───────────────────────────────────────────────
    if ($isLocalOperation || $this->isLocalAction($action, $fields)) {
      $layers['glpi'] = ['state' => 'not_applicable', 'verified' => null, 'checked_at' => $now, 'detail' => 'Operação exclusiva GCC (horas/manutenção local)'];
      $limitations[] = 'glpi_not_applicable_local';
    } elseif ($action === 'delete' || $action === 'restore') {
      $layers['glpi'] = $this->verifyDeleteRestore($op, $glpiConfig, $action, $observed, $divergences, $limitations);
    } elseif ($isCreate) {
      $layers['glpi'] = $this->verifyCreate($op, $glpiConfig, $observed, $divergences, $limitations);
    } else {
      $layers['glpi'] = $this->verifyUpdate($op, $glpiConfig, $observed, $divergences, $limitations);
    }

    // ── 3) Cache ──────────────────────────────────────────────────────────
    $cacheVer = $this->cacheVersion();
    $layers['cache'] = $this->verifyCache($itemtype, (int)$id, $action, $observed, $divergences, $cacheVer);

    // ── 4) API (representação via cache, pois API serve cache classificado) ──
    $layers['api'] = $this->verifyApi($itemtype, (int)$id, $action, $observed, $divergences);
    if ($layers['cache']['state'] !== 'confirmed') $layers['api'] = ['state' => 'pending', 'verified' => false, 'detail' => 'Representação depende do cache conferido'];

    // ── 5) Frontend (se houver confirmação persistida) ───────────────────
    $layers['frontend'] = $this->frontendState($operationId);

    // Resultado global
    $overall = $this->overallResult($layers, $divergences);

    $report = [
      'operation_id' => $operationId,
      'proposal_id' => $proposalId,
      'user_id' => $userId,
      'action' => $action,
      'itemtype' => $itemtype,
      'id' => $id,
      'fields' => $fields,
      'expected' => $expected,
      'observed' => $observed,
      'layers' => $layers,
      'divergences' => $divergences,
      'limitations' => $limitations,
      'cache_version' => $cacheVer,
      'verified_at' => $now,
      'overall' => $overall,
      'evidence' => [
        'glpi_write_response' => $op['glpi_result'] ?? null,
        'glpi_readback' => $op['readback_result'] ?? null,
        'cache_result' => $op['cache_result'] ?? null,
      ],
    ];

    $this->persistVerification($report, $op);

    return $report;
  }

  /**
   * Reexecuta verificação sem repetir escrita (chamado por POST /verify).
   */
  public function reverify(string $operationId, array $glpiConfig = []): array
  {
    return $this->verify($operationId, $glpiConfig);
  }

  /**
   * Recupera cache quando GLPI confirmado mas cache desatualizado.
   * Respeita locks e versão — não sobrescreve dados mais novos.
   */
  public function recoverCache(string $operationId, array $glpiConfig = []): array
  {
    $op = $this->tracker->find($operationId);
    if ($op === null) return ['success' => false, 'error' => 'Operação não encontrada'];

    $verif = $this->verify($operationId, $glpiConfig);
    $glpiState = $verif['layers']['glpi']['state'] ?? 'unknown';
    $cacheState = $verif['layers']['cache']['state'] ?? 'unknown';

    if ($glpiState !== 'confirmed') {
      return ['success' => false, 'error' => 'GLPI não confirmado, recuperação de cache não aplicável', 'verification' => $verif];
    }
    if ($cacheState === 'confirmed') {
      return ['success' => true, 'message' => 'Cache já atualizado', 'verification' => $verif];
    }

    // Tentar atualizar cache a partir do GLPI observado
    $observed = $verif['observed']['glpi'] ?? null;
    if ($observed === null && !empty($glpiConfig)) {
      // Tentar ler novamente
      $observed = $this->readGlpiWithRetry($op['itemtype'], (int)$op['id'], $glpiConfig);
    }

    if ($observed === null) {
      return ['success' => false, 'error' => 'Não foi possível obter dado do GLPI para recuperar cache', 'verification' => $verif];
    }

    $updater = new CacheUpdater();
    $action = $op['action'];
    $result = match($action) {
      'create' => $updater->addAsset(array_merge($observed, ['itemtype' => $op['itemtype']])),
      'delete' => $updater->removeAsset($op['itemtype'], (int)$op['id']),
      'restore' => $updater->restoreAsset($op['itemtype'], (int)$op['id']),
      default => $updater->updateAsset($op['itemtype'], (int)$op['id'], $observed),
    };

    if ($result['success']) {
      // Registrar no tracker
      $op2 = $this->tracker->recordCacheUpdate($op, true);
      // Re-verificar
      $verif2 = $this->verify($operationId, $glpiConfig);
      return ['success' => true, 'cache_result' => $result, 'verification' => $verif2];
    } else {
      // Verificar se falha foi por lock/versão — não sobrescrever
      return ['success' => false, 'error' => $result['error'] ?? 'Falha ao atualizar cache', 'cache_partial' => $result['cache_partial'] ?? false, 'verification' => $verif];
    }
  }

  /**
   * Registra confirmação do frontend vinculada a operationId + userId + versão.
   */
  public function frontendConfirm(string $operationId, string $userId, string $apiVersion): array
  {
    $op = $this->tracker->find($operationId);
    if ($op === null) return ['success' => false, 'error' => 'Operação não encontrada'];
    if (($op['user_id'] ?? '') !== $userId) return ['success' => false, 'error' => 'Operação pertence a outro usuário'];
    $snapshot = $this->representation($operationId, $userId);
    if (!($snapshot['success'] ?? false) || !hash_equals($snapshot['api_version'], $apiVersion)) {
      return ['success' => false, 'error' => 'A representação mudou. Atualize os dados antes de confirmar a tela.'];
    }

    $file = $this->verifDir . '/' . $operationId . '.frontend.json';
    $payload = [
      'operation_id' => $operationId,
      'user_id' => $userId,
      'api_version' => $apiVersion,
      'confirmed_at' => date('c'),
      'ua' => $_SERVER['HTTP_USER_AGENT'] ?? '',
    ];
    @file_put_contents($file, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);

    // Marcar camada frontend como confirmada na próxima verificação
    return ['success' => true, 'frontend_confirm' => $payload];
  }

  /**
   * Histórico de verificações (append, nunca apaga evidências anteriores).
   */
  public function verificationHistory(string $operationId): array
  {
    $pattern = $this->verifDir . '/' . $operationId . '.history.*.json';
    $files = glob($pattern) ?: [];
    $history = [];
    foreach ($files as $f) {
      $c = @file_get_contents($f);
      if ($c === false) continue;
      $j = json_decode($c, true);
      if (is_array($j)) $history[] = $j;
    }
    usort($history, fn($a,$b)=> strcmp($a['verified_at'] ?? '', $b['verified_at'] ?? ''));
    return $history;
  }

  // ── helpers verificação ───────────────────────────────────────────────

  private function emptyLayers(): array
  {
    return [
      'execution' => ['state' => 'unknown'],
      'glpi' => ['state' => 'unknown'],
      'cache' => ['state' => 'unknown'],
      'api' => ['state' => 'unknown'],
      'frontend' => ['state' => 'pending'],
    ];
  }

  private function mapExecutionLayer(array $op): array
  {
    $state = $op['state'] ?? 'unknown';
    $map = [
      'completed' => 'confirmed',
      'partial' => 'partial',
      'failed' => 'failed',
      'refused' => 'failed',
      'executing' => 'pending',
      'verifying' => 'pending',
      'prepared' => 'pending',
    ];
    $s = $map[$state] ?? 'unknown';
    return ['state' => $s, 'tracker_state' => $state, 'checked_at' => date('c')];
  }

  private function verifyUpdate(array $op, array $glpiConfig, array &$observed, array &$divergences, array &$limitations): array
  {
    $itemtype = $op['itemtype'];
    $id = (int)$op['id'];
    $fields = $op['requested_fields'] ?? [];

    // Tentar usar readback já persistido (evidência) + nova releitura
    $readbackData = $op['readback_result']['data'] ?? null;
    $glpiData = $readbackData;

    // Nova releitura com retry/timeout
    if (!empty($glpiConfig)) {
      $fresh = $this->readGlpiWithRetry($itemtype, $id, $glpiConfig);
      if ($fresh !== null) {
        $glpiData = $fresh;
        $observed['glpi_fresh_read_at'] = date('c');
      } else {
        $limitations[] = 'glpi_read_timeout_after_retries';
        $glpiData = null;
      }
    }

    if ($glpiData === null) {
      $limitations[] = 'glpi_unreachable_or_not_found';
      return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c'), 'detail' => 'Releitura falhou — verificado = null (não repetir escrita)'];
    }

    $observed['glpi'] = $glpiData;

    // Comparar campos solicitados
    $allEqual = true;
    $hasUnverifiable = false;
    foreach ($fields as $field => $expectedVal) {
      if (FieldNormalizer::isDerived($field)) continue;
      $obsVal = $this->extractField($glpiData, $field);
      $cmp = FieldNormalizer::compare($field, $expectedVal, $obsVal);
      if ($cmp['skipped'] ?? false) continue;
      if (!($cmp['verifiable'] ?? true)) {
        $hasUnverifiable = true;
        $limitations[] = "unverifiable_field:{$field}";
        continue;
      }
      if (!$cmp['equal']) {
        $allEqual = false;
        $divergences[] = [
          'field' => $field,
          'expected' => $expectedVal,
          'observed' => $obsVal,
          'normalized_expected' => $cmp['normalized_expected'],
          'normalized_observed' => $cmp['normalized_observed'],
          'layer' => 'glpi',
        ];
      }
    }

    // Detectar mudança concorrente posterior (se date_mod mudou após execução)
    $afterMod = $glpiData['date_mod'] ?? null;
    $glpiResultTime = $op['glpi_result']['recorded_at'] ?? null;
    if ($afterMod && $glpiResultTime) {
      // Se date_mod posterior ao registro GLPI, avisar
      $tsMod = strtotime((string)$afterMod);
      $tsWrite = strtotime((string)$glpiResultTime);
      if ($tsMod !== false && $tsWrite !== false && $tsMod > $tsWrite + 2) {
        $limitations[] = 'concurrent_modification_after_write';
        $divergences[] = ['field' => 'date_mod', 'note' => 'Registro mudou após a operação (alteração concorrente legítima)', 'observed' => $afterMod];
      }
    }

    if ($allEqual && !$hasUnverifiable) {
      return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
    }
    if ($hasUnverifiable && $allEqual) {
      return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c'), 'detail' => 'Campos não verificáveis'];
    }
    return ['state' => 'divergent', 'verified' => false, 'checked_at' => date('c')];
  }

  private function verifyCreate(array $op, array $glpiConfig, array &$observed, array &$divergences, array &$limitations): array
  {
    $id = $op['id'];
    if (!$id) {
      return ['state' => 'failed', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Create sem ID retornado'];
    }
    return $this->verifyUpdate($op, $glpiConfig, $observed, $divergences, $limitations);
  }

  private function verifyDeleteRestore(array $op, array $glpiConfig, string $action, array &$observed, array &$divergences, array &$limitations): array
  {
    $itemtype = $op['itemtype'];
    $id = (int)$op['id'];

    if (empty($glpiConfig)) {
      return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c'), 'detail' => 'GLPI não configurado — não é possível confirmar exclusão/restauração'];
    }

    // 404 isolado não é prova suficiente
    $data = $this->readGlpiWithRetry($itemtype, $id, $glpiConfig, true);
    // data null pode ser 404 ou erro de rede
    if ($data === null) {
      // Tentar distinguir: se antes existia e agora 404, pode ser excluído definitivamente (não é nosso caso: é lógico)
      // Nossa exclusão lógica é via states_id, então o registro deve ainda existir
      // 404 isolado -> unknown
      $limitations[] = 'delete_404_ambiguous';
      return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c'), 'detail' => '404 isolado não prova exclusão lógica — verificar states_id necessário'];
    }

    $observed['glpi'] = $data;

    // Conferir o ID efetivamente solicitado; não inferir sucesso de rótulo vazio.
    $expectedState = $op['requested_fields']['states_id'] ?? null;
    $comparison = FieldNormalizer::compare('states_id', $expectedState, $data['states_id'] ?? null);
    if ($expectedState !== null && ($comparison['verifiable'] ?? true)) {
      if ($comparison['equal']) return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
      $divergences[] = ['field' => 'states_id', 'expected' => $expectedState, 'observed' => $data['states_id'] ?? null, 'layer' => 'glpi'];
      return ['state' => 'divergent', 'verified' => false, 'checked_at' => date('c')];
    }

    // Compatibilidade com respostas GLPI que expandem apenas rótulos.
    $state = $data['states_id'] ?? null;
    $isDeleted = $data['is_deleted'] ?? null;
    $stateName = is_array($state) ? ($state['name'] ?? '') : (string)($state ?? '');
    $stateNameLower = mb_strtolower($stateName);

    if ($action === 'delete') {
      // Deve estar Inativo
      $isInactive = str_contains($stateNameLower, 'inativo') || str_contains($stateNameLower, 'inactive');
      // Também verificar se saiu das listas normais: nossa API lista com expand_dropdowns inclui mesmo inativos — então não usar 404 como filtro
      if ($isInactive || $isDeleted === 1 || $isDeleted === true || $isDeleted === '1') {
        // Confirmar que saiu das listas normais (se cache marca _inactive)
        return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c'), 'detail' => 'Exclusão lógica confirmada via API (states_id)'];
      }
      $divergences[] = ['field' => 'states_id', 'expected' => 'Inativo', 'observed' => $stateName, 'layer' => 'glpi'];
      return ['state' => 'divergent', 'verified' => false, 'checked_at' => date('c')];
    } else { // restore
      $isActive = in_array(trim($stateNameLower), ['em uso', 'em_uso', 'active', 'in_use'], true);
      $notDeleted = $isDeleted === 0 || $isDeleted === false || $isDeleted === '0' || $isDeleted === null;
      if ($isActive && $notDeleted) {
        return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c'), 'detail' => 'Restauração confirmada — registro presente em visões apropriadas'];
      }
      $divergences[] = ['field' => 'states_id', 'expected' => 'Em uso', 'observed' => $stateName, 'layer' => 'glpi'];
      return ['state' => 'divergent', 'verified' => false, 'checked_at' => date('c')];
    }
  }

  private function verifyCache(string $itemtype, int $id, string $action, array &$observed, array &$divergences, ?string $cacheVer): array
  {
    if (!file_exists($this->cacheFile)) {
      return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Cache inexistente'];
    }
    $content = @file_get_contents($this->cacheFile);
    $data = json_decode($content ?: '', true);
    if (!is_array($data)) return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c')];

    $items = $data['items'] ?? $data;
    if (!is_array($items)) return ['state' => 'unknown', 'verified' => null, 'checked_at' => date('c')];

    $found = null;
    foreach ($items as $it) {
      if (($it['itemtype'] ?? '') === $itemtype && (int)($it['id'] ?? 0) === $id) { $found = $it; break; }
    }

    if ($action === 'delete') {
      if ($found === null) {
        // Cache não tem — pode ter sido removido por sync? Não interpretar como sucesso se parcial
        return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Ativo não encontrado no cache (pode ser remoção por sync parcial — não sobrescrever)'];
      }
      $state = $found['stateSummary'] ?? $found['stateRaw'] ?? '';
      $isInactive = str_contains(mb_strtolower((string)$state), 'inativo');
      $observed['cache'] = $found;
      if ($isInactive || ($found['_inactive'] ?? false)) return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
      return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
    }

    if ($action === 'restore') {
      if ($found === null) return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
      $state = $found['stateSummary'] ?? '';
      $isActive = in_array(mb_strtolower((string)$state), ['em uso', 'ativo', 'active'], true);
      $observed['cache'] = $found;
      if ($isActive && !($found['_inactive'] ?? false)) return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
      return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
    }

    // create/update: verificar se cache reflete glpi observado
    if ($found === null) {
      if ($action === 'create') return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
      return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Não encontrado no cache — GCC desatualizado, recuperação possível'];
    }

    $observed['cache'] = $found;
    $raw = $found['raw'] ?? $found;
    $glpiObs = $observed['glpi'] ?? null;
    // Comparar campos do GLPI observado vs cache
    if ($glpiObs !== null) {
      foreach ($glpiObs as $field => $glpiVal) {
        if (FieldNormalizer::isDerived($field)) continue;
        if (!array_key_exists($field, $raw)) {
          $divergences[] = ['field' => $field, 'expected' => $glpiVal, 'observed' => null, 'layer' => 'cache'];
          return ['state' => 'outdated', 'verified' => false, 'detail' => 'Campo ausente no cache'];
        }
        $cacheVal = $raw[$field] ?? null;
        $cmp = FieldNormalizer::compare($field, $glpiVal, $cacheVal);
        if (($cmp['skipped'] ?? false) || !($cmp['verifiable'] ?? true)) continue;
        if (!$cmp['equal']) {
          $divergences[] = ['field'=>$field,'expected'=>$glpiVal,'observed'=>$cacheVal,'layer'=>'cache','note'=>'Cache diverge do GLPI confirmado'];
          return ['state' => 'outdated', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Cache desatualizado — GCC diverge do GLPI confirmado'];
        }
      }
    }
    // Checagem date_mod
    $cacheMod = $raw['date_mod'] ?? $found['date_mod'] ?? null;
    $glpiMod = $observed['glpi']['date_mod'] ?? null;
    if ($cacheMod && $glpiMod && $cacheMod !== $glpiMod) {
      return ['state' => 'outdated', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'Cache desatualizado — GCC diverge do GLPI confirmado'];
    }

    return ['state' => $glpiObs !== null ? 'confirmed' : 'unknown', 'verified' => $glpiObs !== null, 'checked_at' => date('c')];
  }

  private function verifyApi(string $itemtype, int $id, string $action, array &$observed, array &$divergences): array
  {
    // API GCC serve cache classificado; se cache pendente, API desatualizada
    if (!file_exists($this->cacheFile)) return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
    $content = @file_get_contents($this->cacheFile);
    $data = json_decode($content ?: '', true);
    $items = $data['items'] ?? $data;
    $found = null;
    foreach (($items ?? []) as $it) {
      if (($it['itemtype'] ?? '') === $itemtype && (int)($it['id'] ?? 0) === $id) { $found = $it; break; }
    }

    if ($action === 'delete') {
      // API deve não listar inativos em listas normais — nosso cache marca _inactive mas ainda retorna em all
      // Para sprint: considerar API correspondente se cache atualizado
      if ($found === null || ($found['_inactive'] ?? false)) return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
      return ['state' => 'outdated', 'verified' => false, 'checked_at' => date('c'), 'detail' => 'API ainda retorna ativo não excluído'];
    }

    if ($found === null) {
      if ($action === 'create') return ['state' => 'pending', 'verified' => false, 'checked_at' => date('c')];
      return ['state' => 'outdated', 'verified' => false, 'checked_at' => date('c')];
    }
    $observed['api'] = $found;
    // API corresponde ao cache — se cache confirmado, API desatualizada só se cache pendente
    return ['state' => 'confirmed', 'verified' => true, 'checked_at' => date('c')];
  }

  private function frontendState(string $operationId): array
  {
    $file = $this->verifDir . '/' . $operationId . '.frontend.json';
    if (file_exists($file)) {
      $c = @file_get_contents($file);
      $j = json_decode($c ?: '', true);
      if (is_array($j)) {
        $snapshot = $this->representation($operationId, $j['user_id'] ?? '');
        if (($snapshot['success'] ?? false) && hash_equals($snapshot['api_version'], $j['api_version'] ?? '')) {
          return ['state' => 'confirmed', 'verified' => true, 'checked_at' => $j['confirmed_at'], 'detail' => 'Tela aplicou a representação conferida'];
        }
      }
    }
    return ['state' => 'pending', 'verified' => null, 'checked_at' => date('c'), 'detail' => 'Aguardando confirmação do frontend (aba pode estar fechada)'];
  }

  private function overallResult(array $layers, array $divergences): string
  {
    $glpi = $layers['glpi']['state'] ?? 'unknown';
    $cache = $layers['cache']['state'] ?? 'unknown';
    $api = $layers['api']['state'] ?? 'unknown';

    // GLPI confirmado = operação concluída e verificada mesmo se cache/api pendentes
    if ($glpi === 'confirmed' && $cache === 'confirmed' && $api === 'confirmed') {
      return ($layers['frontend']['state'] ?? '') === 'confirmed' ? 'verified' : 'verified_glpi';
    }
    if ($glpi === 'confirmed' && ($cache === 'pending' || $cache === 'outdated' || $api === 'pending' || $api === 'outdated')) return 'partial_cache_pending';
    if ($glpi === 'confirmed') return 'verified_glpi';
    if ($glpi === 'divergent') return 'divergent';
    if ($glpi === 'unknown') return 'unknown';
    if ($glpi === 'not_applicable') {
      if ($cache === 'confirmed') return 'verified_local';
      return 'partial_local';
    }
    if ($layers['execution']['state'] === 'failed') return 'failed';
    return 'unknown';
  }

  private function cacheVersion(): ?string
  {
    if (!file_exists($this->cacheFile)) return null;
    $c = @file_get_contents($this->cacheFile);
    $j = json_decode($c ?: '', true);
    if (!is_array($j)) return null;
    return $j['generated'] ?? $j['last_write']['updated_at'] ?? date('c', @filemtime($this->cacheFile) ?: time());
  }

  /** Representação efetivamente entregue ao painel, com versão por conteúdo. */
  public function representation(string $operationId, string $userId): array
  {
    $op = $this->tracker->find($operationId);
    if (!$op || ($op['user_id'] ?? '') !== $userId) return ['success' => false, 'error' => 'Operação não encontrada ou sem acesso.'];
    $cache = json_decode(@file_get_contents($this->cacheFile) ?: '', true);
    if (!is_array($cache)) return ['success' => false, 'error' => 'Cache indisponível.'];
    foreach ($cache['items'] ?? $cache as $asset) {
      if (($asset['itemtype'] ?? '') === $op['itemtype'] && (int)($asset['id'] ?? 0) === (int)$op['id']) {
        $version = hash('sha256', json_encode([$operationId, $asset], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        return ['success' => true, 'asset' => $asset, 'api_version' => $version];
      }
    }
    return ['success' => false, 'error' => 'Ativo ainda ausente no cache.'];
  }

  private function readGlpiWithRetry(string $itemtype, int $id, array $glpiConfig, bool $allow404 = false): ?array
  {
    $retries = 0;
    while ($retries < self::MAX_RETRIES) {
      try {
        $glpi = new GlpiClient($glpiConfig);
        $session = $glpi->initSession();
        try {
          $raw = $glpi->getWithParams("/{$itemtype}/{$id}", $session, ['expand_dropdowns' => 'true']);
          $glpi->killSession($session);
          if (!is_array($raw) || !isset($raw['id'])) return null;
          return $raw;
        } catch (\Throwable $e) {
          $glpi->killSession($session);
          // 404 é not found, não erro de rede
          if (str_contains($e->getMessage(), '404') || str_contains($e->getMessage(), 'not found')) {
            return null;
          }
          throw $e;
        }
      } catch (\Throwable $e) {
        $retries++;
        if ($retries >= self::MAX_RETRIES) return null;
        usleep(200000 * $retries);
      }
    }
    return null;
  }

  private function extractField(array $asset, string $field): mixed
  {
    $v = $asset[$field] ?? null;
    if (is_array($v) && isset($v['name'])) return $v; // normalizer tratará
    return $v;
  }

  private function isLocalAction(string $action, array $fields): bool
  {
    // Operações exclusivas GCC: horas/manutenção locais (projectors.json)
    $localFields = ['lamp_hours','last_maintenance','next_maintenance','horas','manutencao'];
    foreach (array_keys($fields) as $f) {
      if (in_array($f, $localFields, true)) return true;
    }
    return false;
  }

  private function persistVerification(array $report, array $op): void
  {
    $opId = $report['operation_id'];
    // Persistir última verificação
    $path = $this->verifDir . '/' . $opId . '.json';
    @file_put_contents($path, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    // Também append histórico
    $histPath = $this->verifDir . '/' . $opId . '.history.' . time() . '_' . bin2hex(random_bytes(4)) . '.json';
    @file_put_contents($histPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    // Atualizar operação com verificação resumida
    $op['last_verification'] = [
      'verified_at' => $report['verified_at'],
      'overall' => $report['overall'],
      'layers' => $report['layers'],
    ];
    // Persistir via tracker (re-salvar arquivo)
    $this->tracker->updateVerificationMeta($op);
  }
}
