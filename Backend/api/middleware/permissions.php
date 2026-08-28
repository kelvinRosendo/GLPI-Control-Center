<?php
/**
 * api/middleware/permissions.php
 * -----------------------------------------------------------------------------
 * Middleware de verificação de permissões no backend.
 *
 * Uso:
 *   require_once __DIR__ . '/middleware/permissions.php';
 *   PermissionMiddleware::requireModule('projetores', 'edit');
 *   PermissionMiddleware::requireAction('reports', 'export');
 *
 * Sprint 16: RBAC e Permissões
 */

declare(strict_types=1);

class PermissionMiddleware
{
    /**
     * Módulos e suas ações permitidas por perfil.
     */
    private static array $moduleActions = [
        'home' => [
            'view' => ['ADMIN', 'SUPORTE'],
        ],
        'computadores' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'search' => ['ADMIN', 'SUPORTE'],
            'edit' => ['ADMIN', 'SUPORTE'],
            'openTicket' => ['ADMIN', 'SUPORTE'],
        ],
        'projetores' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'edit' => ['ADMIN', 'SUPORTE'],
            'maintenance' => ['ADMIN', 'SUPORTE'],
        ],
        'impressoras' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'edit' => ['ADMIN', 'SUPORTE'],
        ],
        'chamados' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'create' => ['ADMIN', 'SUPORTE'],
            'edit' => ['ADMIN', 'SUPORTE'],
        ],
        'relatorios' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'export' => ['ADMIN', 'SUPORTE'],
            'configure' => ['ADMIN', 'SUPORTE'],
        ],
        'auditoria' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'export' => ['ADMIN', 'SUPORTE'],
            'clear' => ['ADMIN', 'SUPORTE'],
        ],
        'assistente' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'chat' => ['ADMIN', 'SUPORTE'],
        ],
        'settings' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'manage' => ['ADMIN', 'SUPORTE'],
        ],
        'notifications' => [
            'view' => ['ADMIN', 'SUPORTE'],
        ],
        'integrations' => [
            'view' => ['ADMIN', 'SUPORTE'],
            'manage' => ['ADMIN', 'SUPORTE'],
        ],
    ];

    /**
     * Verifica se o usuário tem permissão para acessar um módulo.
     *
     * @param string $module Chave do módulo
     * @param string $action Ação desejada (view, edit, delete, etc.)
     * @return bool
     */
    public static function can(string $module, string $action = 'view'): bool
    {
        $profile = self::getUserProfile();
        if (!$profile) {
            return false;
        }

        $modulePerms = self::$moduleActions[$module] ?? null;
        if (!$modulePerms) {
            return false;
        }

        $allowedProfiles = $modulePerms[$action] ?? [];
        return in_array($profile, $allowedProfiles, true);
    }

    /**
     * Verifica se o usuário pode acessar um módulo.
     *
     * @param string $module Chave do módulo
     * @return bool
     */
    public static function canAccess(string $module): bool
    {
        return self::can($module, 'view');
    }

    /**
     * Requer permissão para acessar um módulo. Retorna erro 403 se não tiver.
     *
     * @param string $module Chave do módulo
     * @return void
     */
    public static function requireModule(string $module): void
    {
        if (!self::canAccess($module)) {
            self::denyAccess($module, 'view');
        }
    }

    /**
     * Requer permissão para executar uma ação. Retorna erro 403 se não tiver.
     *
     * @param string $module Chave do módulo
     * @param string $action Ação desejada
     * @return void
     */
    public static function requireAction(string $module, string $action): void
    {
        if (!self::can($module, $action)) {
            self::denyAccess($module, $action);
        }
    }

    /**
     * Requer perfil mínimo. Retorna erro 403 se não tiver nível suficiente.
     *
     * @param string $minProfile Perfil mínimo exigido
     * @return void
     */
    public static function requireMinLevel(string $minProfile): void
    {
        $profile = self::getUserProfile();
        if (!$profile) {
            self::denyAccess('system', 'auth');
        }

        $levels = [
            'ADMIN' => 100,
            'SUPORTE' => 40,
        ];

        $currentLevel = $levels[$profile] ?? 0;
        $requiredLevel = $levels[$minProfile] ?? 0;

        if ($currentLevel < $requiredLevel) {
            self::denyAccess('system', 'level');
        }
    }

    /**
     * Retorna o perfil do usuário a partir do token/header.
     *
     * @return string|null
     */
    public static function getUserProfile(): ?string
    {
        $profile = AuthService::context()['profile'] ?? null;
        return is_string($profile) ? strtoupper($profile) : null;
    }

    /**
     * Retorna o email do usuário a partir do token/header.
     *
     * @return string|null
     */
    public static function getUserEmail(): ?string
    {
        $email = AuthService::context()['email'] ?? null;
        return is_string($email) ? $email : null;
    }

    /**
     * Retorna o nome do usuário a partir do token/header.
     *
     * @return string|null
     */
    public static function getUserName(): ?string
    {
        $name = AuthService::context()['name'] ?? null;
        return is_string($name) ? $name : null;
    }

    /**
     * Negar acesso e retornar erro 403.
     *
     * @param string $module Módulo tentado
     * @param string $action Ação tentada
     * @return void
     */
    private static function denyAccess(string $module, string $action): void
    {
        http_response_code(403);

        // Registrar tentativa de acesso negado
        self::logAccessDenied($module, $action);

        echo json_encode([
            'ok' => false,
            'error' => 'Acesso negado.',
            'code' => 'PERMISSION_DENIED',
            'module' => $module,
            'action' => $action,
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    /**
     * Registra tentativa de acesso negado em log.
     *
     * @param string $module
     * @param string $action
     * @return void
     */
    private static function logAccessDenied(string $module, string $action): void
    {
        $email = self::getUserEmail() ?? 'unknown';
        $profile = self::getUserProfile() ?? 'unknown';
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $timestamp = date('c');
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

        $logMessage = "[{$timestamp}] ACCESS_DENIED | User: " . self::logValue($email)
          . " | Profile: " . self::logValue($profile)
          . " | Module: " . self::logValue($module)
          . " | Action: " . self::logValue($action)
          . " | IP: " . self::logValue($ip)
          . " | UA: " . self::logValue($userAgent) . "\n";

        $logFile = __DIR__ . '/../logs/access_denied_' . date('Y-m-d') . '.log';
        @file_put_contents($logFile, $logMessage, FILE_APPEND | LOCK_EX);
    }

    /**
     * Registra ação administrativa em log.
     *
     * @param string $action Ação realizada
     * @param array $details Detalhes adicionais
     * @return void
     */
    public static function logAdminAction(string $action, array $details = []): void
    {
        $email = self::getUserEmail() ?? 'unknown';
        $profile = self::getUserProfile() ?? 'unknown';
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $timestamp = date('c');

        $detailsJson = json_encode($details, JSON_UNESCAPED_UNICODE);
        $logMessage = "[{$timestamp}] ADMIN_ACTION | User: " . self::logValue($email)
          . " | Profile: " . self::logValue($profile)
          . " | Action: " . self::logValue($action)
          . " | Details: " . self::logValue((string) $detailsJson)
          . " | IP: " . self::logValue($ip) . "\n";

        $logFile = __DIR__ . '/../logs/admin_actions_' . date('Y-m-d') . '.log';
        @file_put_contents($logFile, $logMessage, FILE_APPEND | LOCK_EX);
    }

    private static function logValue(string $value): string
    {
        return str_replace(["\r", "\n", "\0"], ' ', substr($value, 0, 2000));
    }
}
