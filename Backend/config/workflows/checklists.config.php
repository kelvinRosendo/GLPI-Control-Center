<?php
/**
 * config/workflows/checklists.config.php
 * -----------------------------------------------------------------------------
 * Configuração centralizada do checklist do workflow.
 *
 * POR QUE EXISTE?
 * - Antes, o checklist estava hardcoded em workflow.js (linhas 31-140)
 * - É a parte que mais muda conforme novos tipos de problema são identificados
 * - Separar permite atualizar sem tocar no código do workflow
 *
 * COMO FUNCIONA?
 * - Define os grupos de perguntas e suas opções
 * - Cada pergunta tem: id, label, tipo, opções, obrigatório, condição
 *
 * PADRÃO UTILIZADO:
 * - Declarative Configuration (configuração declarativa)
 * - O sistema "lê" o que deve fazer, não "calcula"
 *
 * NOTA SOBRE CONDIÇÕES:
 * - As condições (condicional) são functions que no PHP ficam como strings
 * - Serão avaliadas pelo Configuration Loader
 */

declare(strict_types=1);

return [
    'checklist_groups' => [
        [
            'id'    => 'problema',
            'label' => 'Problema',
            'questions' => [
                [
                    'id'          => 'tipo_problema',
                    'label'       => 'Qual o tipo do problema?',
                    'tipo'        => 'select',
                    'opcoes'      => [
                        ['value' => '',                'label' => 'Selecione...'],
                        ['value' => 'nao_liga',        'label' => 'Não liga'],
                        ['value' => 'tela_problema',   'label' => 'Problema na tela'],
                        ['value' => 'teclado_problema','label' => 'Problema no teclado'],
                        ['value' => 'bateria',         'label' => 'Problema na bateria'],
                        ['value' => 'wifi',            'label' => 'Não conecta WiFi'],
                        ['value' => 'carregador',      'label' => 'Sem carregador / carregador danificado'],
                        ['value' => 'software',        'label' => 'Problema de software'],
                        ['value' => 'outro',           'label' => 'Outro'],
                    ],
                    'obrigatorio' => true,
                ],
                [
                    'id'          => 'equipamento_liga',
                    'label'       => 'O equipamento liga?',
                    'tipo'        => 'radio',
                    'opcoes'      => [
                        ['value' => 'sim',          'label' => 'Sim'],
                        ['value' => 'nao',          'label' => 'Não'],
                        ['value' => 'intermitente', 'label' => 'Intermitente'],
                    ],
                    'obrigatorio' => true,
                ],
            ],
        ],
        [
            'id'    => 'condicao',
            'label' => 'Condição Física',
            'questions' => [
                [
                    'id'          => 'dano_fisico',
                    'label'       => 'Existe dano físico visível?',
                    'tipo'        => 'radio',
                    'opcoes'      => [
                        ['value' => 'sim', 'label' => 'Sim'],
                        ['value' => 'nao', 'label' => 'Não'],
                    ],
                    'obrigatorio' => true,
                ],
                [
                    'id'          => 'tipo_dano',
                    'label'       => 'Qual o tipo de dano?',
                    'tipo'        => 'select',
                    'opcoes'      => [
                        ['value' => '',                'label' => 'Selecione...'],
                        ['value' => 'tela_rachada',    'label' => 'Tela rachada/quebrada'],
                        ['value' => 'carcaca_avariada','label' => 'Carcaça danificada'],
                        ['value' => 'teclas_soltas',   'label' => 'Teclas soltas'],
                        ['value' => 'porta_danificada','label' => 'Porta danificada'],
                        ['value' => 'marca_queda',     'label' => 'Marcas de queda'],
                        ['value' => 'outro',           'label' => 'Outro'],
                    ],
                    'obrigatorio' => true,
                    'condicional' => 'dano_fisico === "sim"',
                ],
                [
                    'id'          => 'dano_detalhe',
                    'label'       => 'Descreva o dano identificado',
                    'tipo'        => 'textarea',
                    'obrigatorio' => false,
                    'condicional' => 'dano_fisico === "sim"',
                ],
            ],
        ],
        [
            'id'    => 'uso',
            'label' => 'Uso e Acesso',
            'questions' => [
                [
                    'id'          => 'mau_uso',
                    'label'       => 'Existe mau uso?',
                    'tipo'        => 'radio',
                    'opcoes'      => [
                        ['value' => 'sim', 'label' => 'Sim'],
                        ['value' => 'nao', 'label' => 'Não'],
                    ],
                    'obrigatorio' => true,
                ],
                [
                    'id'          => 'mau_uso_detalhe',
                    'label'       => 'Descreva o mau uso identificado',
                    'tipo'        => 'textarea',
                    'obrigatorio' => false,
                    'condicional' => 'mau_uso === "sim"',
                ],
            ],
        ],
        [
            'id'    => 'observacoes_grupo',
            'label' => 'Observações',
            'questions' => [
                [
                    'id'          => 'observacoes',
                    'label'       => 'Observações adicionais',
                    'tipo'        => 'textarea',
                    'obrigatorio' => false,
                ],
            ],
        ],
    ],
];
