<?php
/**
 * GLPI Control Center — Sincronização por CLI.
 *
 * Usa a configuração do backend e o controle de concorrência de AssetSync.
 * Não instala agendamento nem atualiza o código da aplicação.
 * Saída: 0 = sucesso, 1 = falha/parcial, 2 = sincronização já em andamento.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

$backendDir = dirname(__DIR__);
$logFile = $backendDir . '/logs/cron.log';

function gcc_log(string $level, string $message): void
{
    global $logFile;
    $line = sprintf("[%s] [%s] %s\n", date('c'), $level, $message);
    if (@file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX) === false) {
        fwrite(STDERR, "Não foi possível gravar cron.log.\n");
    }
    fwrite(STDOUT, $line);
}

try {
    if (!is_dir($backendDir . '/logs')) {
        throw new RuntimeException('Diretório de logs indisponível.');
    }
    if (!is_readable($backendDir . '/.env')) {
        throw new RuntimeException('Arquivo de configuração indisponível.');
    }

    require_once $backendDir . '/api/utils/env.php';
    Env::load($backendDir . '/.env');
    Env::load($backendDir . '/.env.local', true);
    $config = require $backendDir . '/config/config.php';

    foreach (['url', 'app_token', 'user_token'] as $key) {
        if (empty($config['glpi'][$key])) {
            throw new RuntimeException('Configuração GLPI incompleta.');
        }
    }
    if ($config['glpi']['url'] === 'https://seu-glpi.interno/apirest.php') {
        throw new RuntimeException('URL do GLPI não configurada.');
    }

    require_once $backendDir . '/api/utils/responde.php';
    require_once $backendDir . '/api/client.php';
    require_once $backendDir . '/api/classifier.php';
    require_once $backendDir . '/api/classification_pipeline.php';
    require_once $backendDir . '/api/sync.php';

    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'], $catalog);
    gcc_log('INFO', 'Iniciando sincronização completa.');
    $startedAt = microtime(true);
    $result = $sync->fullSync();
    $duration = round(microtime(true) - $startedAt, 3);
    $stats = $result['stats'] ?? [];
    $syncInfo = $result['syncInfo'] ?? [];
    $status = $syncInfo['status'] ?? 'unknown';

    gcc_log('INFO', 'Status: ' . $status);
    gcc_log('INFO', 'Duração: ' . $duration . ' segundos.');
    if ($status === 'locked') {
        gcc_log('SKIP', 'Outra sincronização está em andamento.');
        exit(2);
    }

    gcc_log('INFO', 'Total: ' . ($stats['total'] ?? 0));
    gcc_log('INFO', 'Classificados: ' . ($stats['classified'] ?? 0));
    gcc_log('INFO', 'Não classificados: ' . ($stats['unclassified'] ?? 0));
    $categories = $stats['byCategory'] ?? [];
    if (!empty($categories)) {
        gcc_log('INFO', 'Categorias: ' . json_encode(
            $categories,
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        ));
    }
    if ($status === 'partial') {
        gcc_log('WARN', 'Sincronização parcial. Consulte o relatório de sincronização.');
        exit(1);
    }
    if (!in_array($status, ['success', 'completed'], true)) {
        gcc_log('ERROR', 'Sincronização não concluída. Consulte o relatório de sincronização.');
        exit(1);
    }
    gcc_log('INFO', 'Sincronização concluída com sucesso.');
    exit(0);
} catch (Throwable $error) {
    // Não registrar mensagens externas que possam conter credenciais.
    gcc_log('ERROR', sprintf(
        'Falha %s em %s:%d.',
        get_class($error),
        basename($error->getFile()),
        $error->getLine()
    ));
    exit(1);
}
