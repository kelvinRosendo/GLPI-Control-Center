<?php
/**
 * GLPI Control Center — Sync Cron Runner
 *
 * Executa sincronização periódica do cache de ativos classificados.
 * Projetado para ser chamado via crontab.
 *
 * Uso no VPS (crontab -e):
 *   */5 * * * * php /var/www/gcc/Backend/scripts/sync-cron.php >> /var/www/gcc/Backend/logs/cron.log 2>&1
 *
 * Características:
 * - Adquire lock antes de executar (evita execuções concorrentes)
 * - Executa full sync sempre (GLPI REST não suporta modified_since)
 * - Verifica se há sincronizações em andamento via HTTP (proteção extra)
 * - Exit 0 = sucesso, Exit 1 = falha, Exit 2 = skip (lock ou já rodando)
 */

declare(strict_types=1);

// ── Configuração ──────────────────────────────────────────────────────────────
$backendDir = dirname(__DIR__);
$envFile    = $backendDir . '/.env';
$logDir     = $backendDir . '/logs';

// Garantir diretório de logs
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

// ── Logging ───────────────────────────────────────────────────────────────────
$logFile = $logDir . '/cron.log';

function gcc_log(string $level, string $message): void
{
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $line = "[$timestamp] [$level] $message" . PHP_EOL;
    file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
}

// ── Verificar se já está rodando via HTTP ─────────────────────────────────────
$backendUrl = getenv('GCC_BACKEND_URL') ?: 'http://localhost:8080';
$statusUrl  = rtrim($backendUrl, '/') . '/api/sync/status';

$ch = curl_init($statusUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response !== false && $httpCode === 200) {
    $status = json_decode($response, true);
    $currentStatus = $status['data']['sync_status'] ?? 'unknown';

    if ($currentStatus === 'running') {
        gcc_log('SKIP', 'Sincronização já em andamento via HTTP. Saindo.');
        exit(2);
    }
} else {
    gcc_log('WARN', 'Não foi possível verificar status via HTTP (HTTP ' . $httpCode . '). Continuando...');
}

// ── Carregar ambiente ─────────────────────────────────────────────────────────
if (!file_exists($envFile)) {
    gcc_log('ERROR', '.env não encontrado: ' . $envFile);
    exit(1);
}

// Carregar .env simplesmente defini variáveis de ambiente
$envContent = file_get_contents($envFile);
foreach (explode("\n", $envContent) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    $parts = explode('=', $line, 2);
    if (count($parts) !== 2) continue;
    $key = trim($parts[0]);
    $value = trim($parts[1]);
    if (!isset($_ENV[$key])) {
        $_ENV[$key] = $value;
    }
}

// Carregar .env.local se existir
$envLocalFile = $backendDir . '/.env.local';
if (file_exists($envLocalFile)) {
    $envLocalContent = file_get_contents($envLocalFile);
    foreach (explode("\n", $envLocalContent) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) continue;
        $key = trim($parts[0]);
        $value = trim($parts[1]);
        if (!isset($_ENV[$key])) {
            $_ENV[$key] = $value;
        }
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
require_once $backendDir . '/config/config.php';
require_once $backendDir . '/api/client.php';
require_once $backendDir . '/api/classifier.php';
require_once $backendDir . '/api/classification_pipeline.php';
require_once $backendDir . '/api/sync.php';

// ── Executar sync ─────────────────────────────────────────────────────────────
gcc_log('INFO', '=== Iniciando sync cron ===');
gcc_log('INFO', 'GLPI URL: ' . ($config['glpi']['url'] ?? 'N/A'));

$catalog = Classifier::getCatalog();
gcc_log('INFO', 'Catálogo v' . ($catalog['version'] ?? '?'));

$sync = new AssetSync($config['glpi'], $catalog);

$t0 = microtime(true);
$result = $sync->fullSync();
$elapsed = round((microtime(true) - $t0) * 3) / 3;

$stats = $result['stats'] ?? [];
$syncInfo = $result['syncInfo'] ?? [];
$status = $syncInfo['status'] ?? 'unknown';

gcc_log('INFO', "Status: $status");
gcc_log('INFO', "Total: " . ($stats['total'] ?? 0));
gcc_log('INFO', "Classificados: " . ($stats['classified'] ?? 0));
gcc_log('INFO', "Não classificados: " . ($stats['unclassified'] ?? 0));
gcc_log('INFO', "Duração: {$elapsed}s");

if ($status === 'failed') {
    $errors = $syncInfo['errors'] ?? [];
    foreach ($errors as $err) {
        gcc_log('ERROR', 'Sync falhou: ' . ($err['message'] ?? 'erro desconhecido'));
    }
    exit(1);
}

// Log de categorias
$byCategory = $stats['byCategory'] ?? [];
if (!empty($byCategory)) {
    $catStr = json_encode($byCategory, JSON_UNESCAPED_UNICODE);
    gcc_log('INFO', "Categorias: $catStr");
}

gcc_log('INFO', '=== Sync cron concluído ===');
exit(0);
