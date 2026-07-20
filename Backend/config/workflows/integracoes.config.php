<?php
/**
 * config/workflows/integracoes.config.php
 * -----------------------------------------------------------------------------
 * Configuração centralizada das integrações externas.
 *
 * POR QUE EXISTE?
 * - O chat.php tem configurações da OpenAI hardcoded (modelo, temperature, etc)
 * - As regras de identificação de ativos (regex) estão em endpoints.php
 * - Centralizar permite alterar sem tocar no código
 *
 * COMO FUNCIONA?
 * - Configurações de API externa (OpenAI)
 * - Padrões de regex para identificação de tipos de ativo
 *
 * PADRÃO UTILIZADO:
 * - External Service Configuration
 * - Cada integração tem sua própria seção
 *
 * NOTA:
 * - Senhas e tokens NÃO ficam aqui (continuam no .env)
 * - Aqui ficam apenas configurações de comportamento
 */

declare(strict_types=1);

return [
    // Configurações da integração com OpenAI
    'openai' => [
        'model'         => 'gpt-4o-mini',
        'temperature'   => 0.3,
        'max_tokens'    => 512,
        'timeout'       => 30,
        'api_url'       => 'https://api.openai.com/v1/chat/completions',
    ],

    // Padrões de regex para identificar tipos de ativo pelo nome
    // Usado em endpoints.php para filtrar ativos
    'asset_patterns' => [
        'computador'    => '/^(CS-|CO-)/i',
        'geekiee'       => '/^Chrome\s+G-/i',
        'apoio'         => '/^Chrome-/i',
        'projetor'      => '/^Projetor/i',
    ],

    // Configurações de paginação padrão
    'pagination' => [
        'computers'     => '0-999',
        'tickets'       => '0-200',
        'categories'    => '0-100',
        'printers'      => '0-200',
    ],

    // Versão do workflow (usada em auditoria)
    'workflow_version' => '2.0.0',
];
