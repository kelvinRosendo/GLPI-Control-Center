<?php
/**
 * api/utils/logger.php
 * -----------------------------------------------------------------------------
 * Logger simples baseado em arquivo para debug e auditoria.
 *
 * COMO FUNCIONA?
 * - Cada request gera entradas no log com timestamp, nivel e contexto
 * - Logs ficam em Backend/logs/YYYY-MM-DD.log
 * - Facil de buscar e analisar
 *
 * NIVEIS:
 * - INFO: fluxo normal (request recebida, resposta enviada)
 * - WARN: situacao incomum mas nao critica
 * - ERROR: erro que impediu o funcionamento
 */

declare(strict_types=1);

final class Logger
{
    private static ?self $instance = null;
    private string $logDir;
    private string $logFile;
    private string $requestId;

    private const LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

    private function __construct()
    {
        $this->logDir = __DIR__ . '/../../logs';
        $this->logFile = $this->logDir . '/' . date('Y-m-d') . '.log';
        $this->requestId = substr(md5(uniqid((string) mt_rand(), true)), 0, 8);

        if (!is_dir($this->logDir)) {
            mkdir($this->logDir, 0755, true);
        }
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getRequestId(): string
    {
        return $this->requestId;
    }

    public function info(string $message, array $context = []): void
    {
        $this->log('INFO', $message, $context);
    }

    public function warn(string $message, array $context = []): void
    {
        $this->log('WARN', $message, $context);
    }

    public function error(string $message, array $context = []): void
    {
        $this->log('ERROR', $message, $context);
    }

    public function debug(string $message, array $context = []): void
    {
        $this->log('DEBUG', $message, $context);
    }

    private function log(string $level, string $message, array $context = []): void
    {
        $timestamp = date('Y-m-d H:i:s.u');
        $requestId = $this->requestId;

        $line = "[{$timestamp}] [{$level}] [req:{$requestId}] {$message}";

        if (!empty($context)) {
            $ctxStr = json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $line .= " | context: {$ctxStr}";
        }

        $line .= PHP_EOL;

        file_put_contents($this->logFile, $line, FILE_APPEND | LOCK_EX);
    }

    public function logRequest(string $method, string $uri, array $params = []): void
    {
        $this->info("Request recebida", [
            'method'  => $method,
            'uri'     => $uri,
            'params'  => $params,
            'ip'      => $_SERVER['REMOTE_ADDR'] ?? 'cli',
        ]);
    }

    public function logGlpiCall(string $method, string $url, int $httpCode, float $durationMs): void
    {
        $level = $httpCode >= 400 ? 'WARN' : 'INFO';
        $this->log($level, "GLPI API chamada", [
            'method'     => $method,
            'url'        => $url,
            'http_code'  => $httpCode,
            'duration_ms' => round($durationMs, 1),
        ]);
    }

    public function logResponse(int $httpCode, float $durationMs): void
    {
        $this->info("Response enviada", [
            'http_code'   => $httpCode,
            'duration_ms' => round($durationMs, 1),
        ]);
    }

    public function logError(Throwable $e, string $phase = 'unknown'): void
    {
        $this->error("Excecao nao tratada: {$e->getMessage()}", [
            'phase'      => $phase,
            'exception'  => get_class($e),
            'code'       => $e->getCode(),
            'file'       => $e->getFile(),
            'line'       => $e->getLine(),
            'trace'      => $e->getTraceAsString(),
        ]);
    }

    public function logEnvStatus(): void
    {
        $url = getenv('GLPI_URL') ?: '(not set)';
        $hasAppToken = getenv('GLPI_APP_TOKEN') !== false && getenv('GLPI_APP_TOKEN') !== '';
        $hasUserToken = getenv('GLPI_USER_TOKEN') !== false && getenv('GLPI_USER_TOKEN') !== '';
        $sslInsecure = getenv('GLPI_SSL_INSECURE') ?: '0';

        $this->info("Status do ambiente", [
            'glpi_url'        => $url,
            'has_app_token'   => $hasAppToken,
            'has_user_token'  => $hasUserToken,
            'ssl_insecure'    => $sslInsecure,
        ]);
    }
}
