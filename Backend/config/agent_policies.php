<?php
/**
 * config/agent_policies.php
 * -----------------------------------------------------------------------------
 * Políticas de autonomia do agente de IA.
 *
 * Define o que o agente pode fazer por padrão e por perfil/usuário.
 * A política nunca concede permissões que o usuário não tem no GLPI.
 *
 * Modos:
 *   - read_only:        Somente consulta
 *   - prepare_confirm:  Preparar e aguardar confirmação (padrão)
 *   - auto_execute:     Execução automática de ações explicitamente permitidas
 *
 * Sprint 07: Execução de operações
 */

declare(strict_types=1);

return [
  // ── Modo padrão para todos ─────────────────────────────────────────────────
  'default_mode' => 'prepare_confirm',

  // ── Operações permitidas por modo ─────────────────────────────────────────
  'modes' => [
    'read_only' => [
      'description' => 'Somente consulta — nenhuma escrita',
      'allowed_operations' => [],
    ],
    'prepare_confirm' => [
      'description' => 'Preparar proposta e aguardar confirmação do usuário',
      'allowed_operations' => ['create', 'update', 'delete', 'restore'],
      'require_confirmation' => true,
    ],
    'auto_execute' => [
      'description' => 'Execução automática para ações explicitamente permitidas',
      'allowed_operations' => ['update'],
      'require_confirmation' => false,
    ],
  ],

  // ── Restrições por itemtype ────────────────────────────────────────────────
  'itemtype_restrictions' => [
    'Computer' => [
      'allowed_modes' => ['read_only', 'prepare_confirm', 'auto_execute'],
      'allowed_auto_operations' => ['update'],
      'blocked_auto_operations' => ['delete', 'create'],
    ],
    'Printer' => [
      'allowed_modes' => ['read_only', 'prepare_confirm', 'auto_execute'],
      'allowed_auto_operations' => ['update'],
      'blocked_auto_operations' => ['delete', 'create'],
    ],
  ],

  // ── Restrições por campo ──────────────────────────────────────────────────
  'field_restrictions' => [
    'auto_execute' => [
      'Computer' => [
        'allowed_fields' => ['comment', 'otherserial'],
        'blocked_fields' => ['name', 'serial', 'states_id', 'locations_id', 'groups_id', 'users_id'],
      ],
      'Printer' => [
        'allowed_fields' => ['comment', 'otherserial'],
        'blocked_fields' => ['name', 'serial', 'states_id', 'locations_id', 'users_id'],
      ],
    ],
  ],

  // ── Limites de lote ──────────────────────────────────────────────────────
  'batch_limits' => [
    'max_items_per_batch' => 10,
    'max_auto_items_per_batch' => 1,
    'require_item_list_before_confirm' => true,
  ],

  // ── Usuários com autonomia estendida ──────────────────────────────────────
  'user_overrides' => [
    // Exemplo:
    // 'user@email.com' => [
    //   'mode' => 'auto_execute',
    //   'allowed_auto_operations' => ['create', 'update', 'delete', 'restore'],
    // ],
  ],

  // ── Propriedades que nunca podem ser definidas pelo agente ────────────────
  'protected_fields' => [
    'entities_id',
    'is_recursive',
    'is_deleted',
  ],

  // ── Auditoria ─────────────────────────────────────────────────────────────
  'audit' => [
    'log_policy_decisions' => true,
    'log_confirmation_events' => true,
    'log_auto_executions' => true,
  ],
];
