<?php
/**
 * config/workflows/assistencias.config.php
 * -----------------------------------------------------------------------------
 * Configuração centralizada das assistências técnicas.
 *
 * POR QUE EXISTE?
 * - Antes, as assistências estavam hardcoded em workflow.php (linha 18-23)
 * - Agora ficam num arquivo dedicado, fácil de alterar
 * - No futuro, podem vir de banco de dados sem alterar o Workflow
 *
 * COMO FUNCIONA?
 * - Retorna um array com todas as assistências disponíveis
 * - Cada assistência tem: id, nome, descricao
 *
 * PADRÃO UTILIZADO:
 * - Configuration Object Pattern
 * - Single Source of Truth (fonte única da verdade)
 *
 * IMPACTO FUTURO:
 * - Para adicionar uma nova assistência, basta adicionar um item neste array
 * - Não é necessário modificar nenhuma classe de lógica
 */

declare(strict_types=1);

return [
    'assistencias' => [
        [
            'id'         => 'torino',
            'nome'       => 'Torino',
            'descricao'  => 'Suporte técnico Torino',
        ],
        [
            'id'         => 'hbb',
            'nome'       => 'HBB',
            'descricao'  => 'Suporte técnico HBB',
        ],
        [
            'id'         => 'acer_geek',
            'nome'       => 'Acer Geek',
            'descricao'  => 'Suporte técnico Acer Geek',
        ],
        [
            'id'         => 'acer',
            'nome'       => 'Acer',
            'descricao'  => 'Suporte técnico Acer',
        ],
    ],
];
