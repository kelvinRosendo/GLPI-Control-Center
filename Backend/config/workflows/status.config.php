<?php
/**
 * config/workflows/status.config.php
 * -----------------------------------------------------------------------------
 * Configuração centralizada dos mapeamentos de status e prioridade.
 *
 * POR QUE EXISTE?
 * - Antes, os mapeamentos estavam hardcoded em tickets.php (match statements)
 * - O GLPI usa IDs numéricos, nosso sistema usa strings legíveis
 * - Essa tradução é uma regra de negócio que pode mudar
 *
 * COMO FUNCIONA?
 * - Mapeia IDs do GLPI para nomes legíveis
 * - Permite adicionar novos status sem alterar código
 *
 * PADRÃO UTILIZADO:
 * - Lookup Table Pattern (tabela de consulta)
 * - Em vez de switch/match espalhados, temos um array centralizado
 *
 * EXEMPLO DE USO:
 * - statusMap[1] retorna 'aberto'
 * - prioridadeMap[3] retorna 'media'
 *
 * IMPACTO FUTURO:
 * - Se o GLPI adicionar um novo status, basta adicionar aqui
 * - Se precisarmos de status customizados, é só adicionar
 */

declare(strict_types=1);

return [
    // Mapeamento de status do GLPI para nomes legíveis
    // IDs do GLPI: 1=Novo, 2=Em andamento (atribuído), 3=Em andamento (planejado),
    //             4=Pendente, 5=Resolvido, 6=Fechado
    'status_map' => [
        1       => 'aberto',
        2       => 'em_andamento',
        3       => 'em_andamento',
        4       => 'pendente',
        5       => 'resolvido',
        6       => 'fechado',
    ],
    'status_default' => 'aberto',

    // Mapeamento de prioridade do GLPI para nomes legíveis
    // IDs do GLPI: 1=Muito baixa, 2=Baixa, 3=Média, 4=Alta, 5=Muito alta
    'prioridade_map' => [
        1       => 'muito_baixa',
        2       => 'baixa',
        3       => 'media',
        4       => 'alta',
        5       => 'muito_alta',
    ],
    'prioridade_default' => 'media',

    // Mapeamento de status do ativo (states_id do GLPI)
    // IDs do GLPI: 1=Em uso (default), 2=Em manutenção, 3=Emprestado
    'asset_status_map' => [
        2       => 'manutencao',
        3       => 'emprestado',
    ],
    'asset_status_default' => 'ativo',
];
