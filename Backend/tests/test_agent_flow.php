<?php
declare(strict_types=1);

// Exercita os serviços reais numa cópia temporária, com GLPI/modelo simulados.
// Não carrega .env nem usa a rede ou os diretórios operacionais do projeto.
$root = sys_get_temp_dir() . '/gcc-agent-flow-' . bin2hex(random_bytes(6));
foreach (['api/services', 'config', 'data/cache', 'api/data', 'logs'] as $dir) mkdir($root . '/' . $dir, 0755, true);
foreach (glob(__DIR__ . '/../api/services/*.php') as $source) copy($source, $root . '/api/services/' . basename($source));
foreach (['classifier.php', 'classification_pipeline.php'] as $name) copy(__DIR__ . '/../api/' . $name, $root . '/api/' . $name);
foreach (['asset-catalog.php', 'agent_policies.php'] as $name) copy(__DIR__ . '/../config/' . $name, $root . '/config/' . $name);
register_shutdown_function(function () use ($root) {
  $base = realpath($root);
  if (!$base || !str_starts_with(basename($base), 'gcc-agent-flow-')) return;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
  foreach ($it as $file) { if ($file->isDir()) rmdir($file->getPathname()); else unlink($file->getPathname()); }
  rmdir($base);
});

class AuthService {
  public static string $profile = 'SUPORTE';
  public static function context(): array { return ['profile' => self::$profile, 'email' => 'owner']; }
}
require __DIR__ . '/../api/middleware/permissions.php';
class GlpiClient {
  public static array $assets = [];
  public static int $writes = 0;
  public static bool $ignoreWrite = false;
  public static bool $offline = false;
  public static bool $offlineAfterWrite = false;
  public function __construct(array $config) {}
  public function initSession(): string { return 'fake'; }
  public function killSession(string $session): void {}
  public function getWithParams(string $path, string $session, array $params = []): array {
    if (self::$offline) throw new RuntimeException('Rede indisponível', 502);
    if (!isset(self::$assets[$path])) throw new RuntimeException('HTTP 404', 404);
    return self::$assets[$path];
  }
  public function put(string $path, string $session, array $payload): array {
    self::$writes++;
    if (!self::$ignoreWrite) self::$assets[$path] = array_merge(self::$assets[$path], $payload['input'], ['date_mod' => '2026-09-23 12:00:00']);
    if (!self::$ignoreWrite && isset($payload['input']['states_id'])) {
      $id = $payload['input']['states_id'];
      self::$assets[$path]['states_id'] = ['id' => $id, 'name' => $id === 2 ? 'Inativo' : 'Em uso'];
    }
    if (self::$offlineAfterWrite) self::$offline = true;
    return ['success' => true];
  }
  public function post(string $path, string $session, array $payload): array {
    self::$writes++;
    self::$assets[$path . '/101'] = array_merge($payload['input'], ['id' => 101, 'date_mod' => '2026-09-23 12:00:00']);
    return ['id' => 101];
  }
  public function getAllWithParams(string $path, string $session, array $params, int $limit): array {
    return ['items' => [['id' => 1, 'name' => 'Em uso'], ['id' => 2, 'name' => 'Inativo']]];
  }
}
require $root . '/api/classification_pipeline.php';
require $root . '/api/classifier.php';
foreach (['AIProvider','AssetService','OptionsService','CapabilitiesService','OperationTracker','IdempotencyGuard','DropdownValidator','CacheUpdater','AssetWriteService','FieldNormalizer','AgentProposal','AgentExecution','AgentTools','AgentService','VerificationService','BatchStore'] as $class) require $root . '/api/services/' . $class . '.php';

$passed = 0;
function check(bool $condition, string $message): void {
  global $passed;
  if (!$condition) throw new RuntimeException('FAIL: ' . $message);
  echo 'PASS: ' . $message . PHP_EOL; $passed++;
}
function asset(int $id): array {
  return ['id' => $id, 'name' => 'Chrome-' . $id, 'otherserial' => '00001', 'serial' => 'SER-' . $id,
    'date_mod' => '2026-09-23 10:00:00', 'locations_id' => ['id' => 2, 'name' => 'Sala 2']];
}
function proposal(int $id, string $value = '00123'): array {
  GlpiClient::$assets['/Computer/' . $id] = asset($id);
  return AgentProposal::create('update', 'Computer', $id, ['otherserial' => $value], 'owner');
}
function seedCache(array $assets): void {
  global $root;
  file_put_contents($root . '/data/cache/classified_assets.json', json_encode(['generated' => date('c'), 'items' => array_map(fn($a) => Classifier::classifyAsset($a + ['itemtype' => 'Computer']), $assets)]));
}

$tools = new AgentTools(new AIProvider(), 'owner');
foreach ($tools->getDefinitions() as $definition) check(($definition['function']['parameters']['type'] ?? '') === 'object', 'schema ' . $definition['function']['name']);
check(!$tools->execute('executar_proposta', ['proposal_id' => 'prop_123'])['success'], 'modelo não pode chamar execução');

GlpiClient::$assets['/Computer/14'] = asset(14);
seedCache([asset(14)]);
$found = $tools->execute('buscar_ativos', ['query' => 'Chrome-14']);
check($found['source'] === 'cache' && $found['data'][0]['id'] === 14, 'busca local identifica ID e fonte');
$detail = $tools->execute('consultar_ativo', ['itemtype' => 'Computer', 'id' => 14]);
check($detail['source'] === 'glpi' && $detail['data']['otherserial'] === '00001', 'consulta GLPI mantém zeros');
GlpiClient::$assets['/Printer/14'] = asset(14);
check((new AssetService([]))->get('Printer', 14)['itemtype'] === 'Printer', 'consulta preserva tipo Printer');
GlpiClient::$offline = true;
check(!$tools->execute('consultar_ativo', ['itemtype' => 'Computer', 'id' => 14])['success'], 'erro de rede não é ativo inexistente');
GlpiClient::$offline = false;
check((new AssetService([]))->get('Computer', 999) === null, '404 é ausente');

$p = proposal(14);
check($p['current_values']['locations_id']['id'] === 2 && $p['glpi_version'] !== null, 'prévia conserva localização e versão');
check(GlpiClient::$writes === 0, 'preparar não grava');
$printer = AgentProposal::create('update', 'Printer', 14, ['printermodels_id' => 5, 'manufacturers_id' => 6], 'owner');
check(count($printer['proposed_values']) === 2, 'proposta Printer mantém seus campos');
$executor = new AgentExecution(['fake' => true], 'owner');
check(!$executor->executeProposal($p['proposal_id'])['success'], 'sem confirmação é recusado');
check(!$executor->executeProposal($p['proposal_id'], str_repeat('0', 64))['success'], 'hash diferente é recusado');
check(!(new AgentExecution([], 'other'))->executeProposal($p['proposal_id'], $p['content_hash'])['success'], 'outro usuário é recusado');
AuthService::$profile = 'VISITANTE';
check(!$executor->executeProposal($p['proposal_id'], $p['content_hash'])['success'], 'permissão é revalidada');
AuthService::$profile = 'SUPORTE';
check(GlpiClient::$writes === 0, 'recusas não escrevem');
$lock = AgentProposal::lock($p['proposal_id']);
check($executor->executeProposal($p['proposal_id'], $p['content_hash'])['status'] === 'in_progress', 'proposta travada não executa concorrente');
flock($lock, LOCK_UN); fclose($lock);
$result = $executor->executeProposal($p['proposal_id'], $p['content_hash']);
check($result['success'] === true && GlpiClient::$writes === 1, 'confirmação executa uma escrita');
check(GlpiClient::$assets['/Computer/14']['otherserial'] === '00123', 'GLPI recebe zeros à esquerda');
check($result['verification']['layers']['frontend']['state'] === 'pending', 'tela não confirmada antecipadamente');
check(AgentProposal::get($p['proposal_id'])['confirmed_by'] === 'owner', 'aprovação fica registrada');
$replay = $executor->executeProposal($p['proposal_id'], $p['content_hash']);
check($replay['replayed'] && GlpiClient::$writes === 1, 'repetição da confirmação não grava novamente');
$vs = new VerificationService();
$snapshot = $vs->representation($result['operation_id'], 'owner');
check($snapshot['asset']['otherserial'] === '00123', 'representação GCC contém o valor relido');
check($tools->execute('buscar_ativos', ['query' => '00123'])['total'] === 1, 'busca continua funcionando após escrita do cache');
check(!$vs->frontendConfirm($result['operation_id'], 'owner', 'inventada')['success'], 'versão inventada recusada');
check($vs->frontendConfirm($result['operation_id'], 'owner', $snapshot['api_version'])['success'], 'versão correta aceita');
check($vs->verify($result['operation_id'], ['fake' => true])['overall'] === 'verified', 'resultado completo após confirmação da representação');

$stale = proposal(15);
GlpiClient::$assets['/Computer/15']['date_mod'] = '2026-09-23 11:00:00';
check($executor->executeProposal($stale['proposal_id'], $stale['content_hash'])['status'] === 'stale', 'ativo alterado após prévia é recusado');
$cancelled = proposal(16);
check(AgentProposal::cancel($cancelled['proposal_id'], 'other') === null, 'outro usuário não cancela');
check(AgentProposal::cancel($cancelled['proposal_id'], 'owner')['status'] === 'cancelled', 'dono pode cancelar');
check(!$executor->executeProposal($cancelled['proposal_id'], $cancelled['content_hash'])['success'], 'cancelamento impede execução');

$wrong = proposal(17);
seedCache([GlpiClient::$assets['/Computer/14'], asset(17)]);
GlpiClient::$ignoreWrite = true;
$divergent = $executor->executeProposal($wrong['proposal_id'], $wrong['content_hash']);
check(!$divergent['success'] && $divergent['status'] === 'divergent', 'GLPI ignora valor: divergência, nunca sucesso');
check($divergent['verification']['layers']['execution']['state'] === 'partial', 'primeira releitura também detecta valor errado');
GlpiClient::$ignoreWrite = false;
GlpiClient::$offline = true;
check($vs->verify($result['operation_id'], ['fake' => true])['layers']['glpi']['state'] === 'unknown', 'releitura indisponível não reutiliza prova antiga como atual');
GlpiClient::$offline = false;

class ScriptedProvider extends AIProvider {
  private int $step = 0;
  public function isConfigured(): bool { return true; }
  public function getModel(): string { return 'simulado'; }
  public function chatWithTools(array $messages, array $tools = [], array $options = []): array {
    $this->step++;
    $message = $this->step === 1 ? ['role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-1', 'type' => 'function', 'function' => ['name' => 'preparar_alteracao', 'arguments' => json_encode(['action' => 'update', 'itemtype' => 'Computer', 'id' => 14, 'fields' => ['otherserial' => '00999']])]]]] : ['role' => 'assistant', 'content' => 'Confira a proposta.'];
    return ['success' => true, 'data' => ['choices' => [['message' => $message]]]];
  }
}
$chat = (new AgentService('owner', new ScriptedProvider()))->processMessage('Altere o patrimônio para 00999');
check($chat['success'] && count($chat['proposals']) === 1 && $chat['proposals'][0]['proposed_values']['otherserial'] === '00999', 'chat entrega proposta estruturada ao painel');
check($chat['evidence'][0]['tool'] === 'preparar_alteracao', 'chat entrega evidência da ferramenta');
$batchStore = new BatchStore();
$batch = $batchStore->create(['a', 'b'], 'owner');
$batchStore->updateItem($batch['batch_id'], ['proposal_id' => 'a', 'status' => 'verified', 'success' => true]);
check($batchStore->find($batch['batch_id'])['status'] !== 'completed', 'lote não conclui antes do total planejado');

$created = AgentProposal::create('create', 'Computer', null, ['name' => 'Chrome-Novo', 'otherserial' => '00077'], 'owner');
$createResult = $executor->executeProposal($created['proposal_id'], $created['content_hash']);
check($createResult['success'] && $createResult['id'] === 101, 'criação confirmada retorna ID e verifica valor');
$delete = AgentProposal::create('delete', 'Computer', 101, [], 'owner');
$deleteResult = $executor->executeProposal($delete['proposal_id'], $delete['content_hash']);
check($deleteResult['success'] && GlpiClient::$assets['/Computer/101']['states_id']['id'] === 2, 'exclusão lógica altera e confere estado');
$restore = AgentProposal::create('restore', 'Computer', 101, [], 'owner');
$restoreResult = $executor->executeProposal($restore['proposal_id'], $restore['content_hash']);
check($restoreResult['success'] && GlpiClient::$assets['/Computer/101']['states_id']['id'] === 1, 'restauração altera e confere estado');

$tracker = new OperationTracker();
$guard = new IdempotencyGuard($tracker);
$guard->registerPending('Computer', 88, 'update', ['otherserial' => '00001'], 'owner', 'key-88');
check(!$guard->check('Computer', 88, 'update', ['otherserial' => '00002'], 'key-88', 'owner')['allowed'], 'mesma chave com outro valor é conflito');
check($guard->check('Computer', 88, 'update', ['otherserial' => '00002'], 'key-88', 'other')['allowed'], 'chave é isolada por usuário');
$localProjector = asset(90); $localProjector['name'] = 'Projetor Sala Azul';
seedCache([$localProjector]);
file_put_contents($root . '/api/data/projectors.json', json_encode(['projectors' => ['90' => ['horas_lampada' => 321, 'ultima_manutencao' => '2026-09-01']]]));
$hours = $tools->execute('consultar_horas_projetor', ['name' => 'Sala Azul']);
check($hours['data'][0]['lamp_hours'] === 321, 'horas locais usam o arquivo real e identidade do cache');

$timeout = proposal(91);
seedCache([asset(91)]);
GlpiClient::$offlineAfterWrite = true;
$unknown = $executor->executeProposal($timeout['proposal_id'], $timeout['content_hash']);
check(!$unknown['success'] && $unknown['status'] === 'unknown', 'gravação seguida de falha de leitura fica desconhecida');
check(AssetService::fromCache()['items'][0]['otherserial'] === '00001', 'falha de releitura preserva cache anterior');
GlpiClient::$offlineAfterWrite = false; GlpiClient::$offline = false;
$expired = proposal(92);
$expired['expires_at'] = date('c', time() - 60);
$expired['content_hash'] = AgentProposal::contentHash($expired);
file_put_contents($root . '/data/proposals/' . $expired['proposal_id'] . '.json', json_encode($expired));
check($executor->executeProposal($expired['proposal_id'], $expired['content_hash'])['status'] === 'expired', 'prévia vencida não executa');
$tampered = proposal(93);
$originalHash = $tampered['content_hash'];
$tampered['proposed_values']['otherserial'] = '99999';
file_put_contents($root . '/data/proposals/' . $tampered['proposal_id'] . '.json', json_encode($tampered));
check($executor->executeProposal($tampered['proposal_id'], $originalHash)['status'] === 'confirmation_mismatch', 'conteúdo alterado após aprovação é recusado');
echo "Total: {$passed} verificações passaram; GLPI e modelo simulados, sem rede." . PHP_EOL;
