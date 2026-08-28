<?php
/**
 * config/config.php
 * -----------------------------------------------------------------------------
 * Config central do backend.
 * Lê variáveis do ambiente (.env) e disponibiliza em array.
 */

declare(strict_types=1);

$appEnv = getenv('APP_ENV') ?: 'dev';
$configuredSessionSecret = getenv('AUTH_SESSION_SECRET') ?: '';
$sessionSecret = $configuredSessionSecret !== ''
  ? $configuredSessionSecret
  : ($appEnv === 'production' ? '' : hash('sha256', (string) getenv('GLPI_APP_TOKEN') . '|gcc-local-session'));

return [
  'glpi' => [
    // tem que terminar em /apirest.php
    'url' => getenv('GLPI_URL') ?: 'https://seu-glpi.interno/apirest.php',
    'app_token' => getenv('GLPI_APP_TOKEN') ?: '',
    'user_token' => getenv('GLPI_USER_TOKEN') ?: '',

    /**
     * Em intranet, é comum o GLPI usar certificado autoassinado.
     * Para TESTE, você pode colocar GLPI_SSL_INSECURE=1 no .env e isso
     * desativa a validação do SSL no cURL.
     * Em produção, o ideal é manter 0 e usar certificado válido.
     */
    'ssl_insecure' => (getenv('GLPI_SSL_INSECURE') ?: '0') === '1',
  ],

  'cors' => [
    'origins' => array_values(array_filter(array_map('trim', explode(',', getenv('CORS_ORIGIN') ?: 'http://localhost:3000,http://localhost:8080')))),
  ],

  'auth' => [
    'google_client_id' => getenv('GOOGLE_CLIENT_ID') ?: '985292439142-lveqa6pff29h4c3pb5951a1gn69lpomv.apps.googleusercontent.com',
    'session_secret' => $sessionSecret,
    'session_ttl' => (int) (getenv('AUTH_SESSION_TTL') ?: 43200),
    'allowed_domains' => array_values(array_filter(array_map('strtolower', array_map('trim', explode(',', getenv('AUTH_ALLOWED_DOMAINS') ?: 'colegiosatelite.com.br'))))),
    'admin_emails' => array_values(array_filter(array_map('strtolower', array_map('trim', explode(',', getenv('AUTH_ADMIN_EMAILS') ?: 'kelvinrosendo@colegiosatelite.com.br'))))),
  ],

  'app' => [
    'env' => $appEnv,
  ],
];
