<?php
/**
 * config/config.php
 * -----------------------------------------------------------------------------
 * Config central do backend.
 * Lê variáveis do ambiente (.env) e disponibiliza em array.
 */

declare(strict_types=1);

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
    'origin' => getenv('CORS_ORIGIN') ?: '*',
  ],

  'app' => [
    'env' => getenv('APP_ENV') ?: 'dev',
  ],
];