<?php
/**
 * config/asset-catalog.php
 * -----------------------------------------------------------------------------
 * Catálogo configurável de regras de classificação de ativos.
 *
 * Cada regra define:
 *   - category: código interno
 *   - label: nome exibido ao usuário
 *   - priority: prioridade (maior = mais específica)
 *   - itemtype: filtro por tipo GLPI (null = qualquer)
 *   - namePatterns: array de regex para匹配 nome
 *   - typePatterns: array de regex para匹配 computertypes_id
 *   - groupPatterns: array de regex para匹配 groups_id
 *   - validator: função opcional de validação (recebe asset normalizado)
 *   - version: versão da regra (para reprocessamento)
 *
 * Regras são avaliadas por prioridade descendente.
 * A primeira regra que casar (todas as condições) vence.
 * Se nenhuma casar, category = "unclassified".
 */

declare(strict_types=1);

return [
  // ── Versão do catálogo ──────────────────────────────────────────────────────
  'version' => '1.0.0',

  // ── Configuração de sincronização ───────────────────────────────────────────
  'sync' => [
    // Physical inventory collections; extend explicitly for local/custom GLPI types.
    'collections' => ['Computer', 'Printer', 'Monitor', 'Peripheral', 'NetworkEquipment', 'Phone'],
    'batch_size'       => 500,
    'cache_ttl'        => 300,
    'api_timeout'      => 30,
    'max_retries'      => 3,
    'retry_interval'   => 2,
    'incremental'      => false,
    'log_level'        => 'info',
    'auto_refresh_sec' => 300,
  ],

  // ── Mapeamento de estados ───────────────────────────────────────────────────
  'state_mapping' => [
    'em uso'                => 'em_uso',
    'em uso (ativo)'        => 'em_uso',
    'comodato geekie'       => 'comodato',
    'comodato geekie (aluno ativo)' => 'comodato',
    'finalizado'            => 'finalizado',
    'finalizado (aluno formado)' => 'finalizado',
    'permanente'            => 'permanente',
    'permanente (colégio)'  => 'permanente',
    'emprestado'            => 'emprestado',
    'emprestado (colégio)'  => 'emprestado',
    'devolvido'             => 'devolvido',
    'devolvido ao estoque'  => 'devolvido',
    'substituído'           => 'substituido',
    'substituído'           => 'substituido',
    'baixa'                 => 'baixa',
    'baixa – perdido'       => 'baixa',
    'baixa - perdido'       => 'baixa',
  ],

  // ── Regras de classificação ─────────────────────────────────────────────────
  'rules' => [
    // ── Printer nativo ────────────────────────────────────────────────────────
    [
      'category'     => 'printer',
      'label'        => 'Impressora',
      'purpose'      => 'Impressora',
      'priority'     => 100,
      'itemtype'     => ['Printer'],
      'namePatterns' => [],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Projetor por tipo ─────────────────────────────────────────────────────
    [
      'category'     => 'projector',
      'label'        => 'Projetor',
      'purpose'      => 'Exibição',
      'priority'     => 95,
      'itemtype'     => ['Computer'],
      'namePatterns' => [],
      'typePatterns' => ['/^projetor(es)?$/i'],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Projetor por nome ─────────────────────────────────────────────────────
    [
      'category'     => 'projector',
      'label'        => 'Projetor',
      'purpose'      => 'Exibição',
      'priority'     => 90,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^projetor/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Impressora por tipo ───────────────────────────────────────────────────
    [
      'category'     => 'printer_computer',
      'label'        => 'Impressora',
      'purpose'      => 'Impressora',
      'priority'     => 85,
      'itemtype'     => ['Computer'],
      'namePatterns' => [],
      'typePatterns' => ['/^impressora(es)?$/i'],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Impressora por nome ───────────────────────────────────────────────────
    [
      'category'     => 'printer_computer',
      'label'        => 'Impressora',
      'purpose'      => 'Impressora',
      'priority'     => 80,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^(EPSON|Pantum|RICOH|SAMSUNG|Impressora)/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Chromebook Aluno ──────────────────────────────────────────────────────
    [
      'category'     => 'chromebook_student',
      'label'        => 'Alunos',
      'purpose'      => 'Aluno',
      'priority'     => 70,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^Chrome\s+G-/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Chromebook Exibição ───────────────────────────────────────────────────
    [
      'category'     => 'chromebook_display',
      'label'        => 'Exibição',
      'purpose'      => 'Exibição',
      'priority'     => 65,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^Chrome[\s-]+.*EDU/i', '/EDU[123]/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Chromebook Apoio ──────────────────────────────────────────────────────
    [
      'category'     => 'chromebook_support',
      'label'        => 'Apoio',
      'purpose'      => 'Apoio',
      'priority'     => 60,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^Chrome-/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Computador CS/CO ──────────────────────────────────────────────────────
    [
      'category'     => 'computer_cs',
      'label'        => 'Computadores',
      'purpose'      => 'Computador CS',
      'priority'     => 50,
      'itemtype'     => ['Computer'],
      'namePatterns' => ['/^(CS-|CO-)/i'],
      'typePatterns' => [],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],

    // ── Computador genérico (pelo tipo) ───────────────────────────────────────
    [
      'category'     => 'computer_cs',
      'label'        => 'Computadores',
      'purpose'      => 'Computador',
      'priority'     => 40,
      'itemtype'     => ['Computer'],
      'namePatterns' => [],
      'typePatterns' => ['/^computador(es)?$/i', '/^desktop$/i'],
      'groupPatterns'=> [],
      'version'      => '1.0.0',
    ],
  ],
];
