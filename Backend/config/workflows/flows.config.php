<?php
/**
 * config/workflows/flows.config.php
 * -----------------------------------------------------------------------------
 * Configuração centralizada dos fluxos de cada assistência técnica.
 *
 * POR QUE EXISTE?
 * - Antes, os fluxos estavam hardcoded em assistance_flows.js
 * - Cada assistência tem um fluxo diferente (portal, email, clipboard)
 * - Essa é a configuração que mais muda quando uma nova assistência é adicionada
 *
 * COMO FUNCIONA?
 * - Define os dados visuais e ações de cada fluxo
 * - Templates de email ficam como strings (no futuro podem vir de banco)
 *
 * PADRÃO UTILIZADO:
 * - Strategy Pattern implícito: cada fluxo é uma "estratégia" diferente
 * - O Workflow não precisa saber O QUE cada fluxo faz
 * - Ele apenas exibe as configurações do fluxo selecionado
 *
 * IMPACTO FUTURO:
 * - Para adicionar uma nova assistência, basta adicionar um novo item aqui
 * - Os templates de email podem ser gerenciados por um editor visual
 */

declare(strict_types=1);

return [
    'flows' => [
        'hbb' => [
            'id'          => 'hbb',
            'nome'        => 'HBB',
            'icone'       => '&#128295;',
            'cor'         => '#f59e0b',
            'descricao'   => 'Suporte técnico HBB — Renan',
            'instrucao'   => 'O equipamento deverá ser entregue ao responsável (Renan).',
            'proximosPassos' => [
                'Preencha os dados do equipamento abaixo',
                'Um e-mail será gerado automaticamente',
                'Encaminhe o e-mail para o responsável',
                'Aguarda o retorno do suporte HBB',
            ],
            'acoes' => [
                [
                    'id'          => 'gerar_email',
                    'tipo'        => 'email',
                    'label'       => 'Gerar E-mail',
                    'icone'       => '&#9993;',
                    'descricao'   => 'Gera um e-mail padrão com os dados do equipamento',
                ],
                [
                    'id'          => 'copiar_email',
                    'tipo'        => 'clipboard',
                    'label'       => 'Copiar Texto do E-mail',
                    'icone'       => '&#128203;',
                    'descricao'   => 'Copia o texto do e-mail para a área de transferência',
                ],
            ],
            'emailTemplate' => 'Prezado(a) Renan,

Solicito atendimento técnico para o seguinte equipamento:

Patrimônio: {patrimonio}
Equipamento: {nome}
Serial: {serial}
Modelo: {modelo}

Problema: {tipoProblema}
Equipamento liga: {equipamentoLiga}
Dano físico: {danoFisico}
Mau uso: {mauUso}

Contrato: {contrato}

{observacoes}

Atenciosamente,
{usuario}',
            'portalUrl' => null,
        ],

        'torino' => [
            'id'          => 'torino',
            'nome'        => 'Torino',
            'icone'       => '&#127760;',
            'cor'         => '#3b82f6',
            'descricao'   => 'Suporte técnico Torino — Portal de atendimento',
            'instrucao'   => 'Utilize o portal da Torino para abrir o chamado de suporte.',
            'proximosPassos' => [
                'Clique no botão abaixo para abrir o portal',
                'Preencha o formulário no portal',
                'Anexe fotos do equipamento se necessário',
                'Aguarda retorno da Torino',
            ],
            'acoes' => [
                [
                    'id'          => 'abrir_portal',
                    'tipo'        => 'link',
                    'label'       => 'Abrir Portal Torino',
                    'icone'       => '&#128279;',
                    'descricao'   => 'Abre o portal de atendimento da Torino em nova aba',
                    'url'         => '#portal-torino',
                ],
                [
                    'id'          => 'copiar_dados',
                    'tipo'        => 'clipboard',
                    'label'       => 'Copiar Dados do Equipamento',
                    'icone'       => '&#128203;',
                    'descricao'   => 'Copia os dados do equipamento para preenchimento no portal',
                ],
            ],
            'emailTemplate' => null,
            'portalUrl'     => '#portal-torino',
        ],

        'acer_geek' => [
            'id'          => 'acer_geek',
            'nome'        => 'Acer Geek',
            'icone'       => '&#128187;',
            'cor'         => '#10b981',
            'descricao'   => 'Suporte técnico Acer Geek — Portal de atendimento',
            'instrucao'   => 'Utilize o portal Acer para abrir o chamado de garantia.',
            'proximosPassos' => [
                'Clique no botão abaixo para abrir o portal',
                'Selecione a opção de garantia',
                'Informe o número de série do equipamento',
                'Aguarda retorno da Acer',
            ],
            'acoes' => [
                [
                    'id'          => 'abrir_portal',
                    'tipo'        => 'link',
                    'label'       => 'Abrir Portal Acer',
                    'icone'       => '&#128279;',
                    'descricao'   => 'Abre o portal de atendimento Acer em nova aba',
                    'url'         => '#portal-acer',
                ],
                [
                    'id'          => 'copiar_dados',
                    'tipo'        => 'clipboard',
                    'label'       => 'Copiar Número de Série',
                    'icone'       => '&#128203;',
                    'descricao'   => 'Copia o número de série para preenchimento no portal',
                ],
            ],
            'emailTemplate' => null,
            'portalUrl'     => '#portal-acer',
        ],

        'acer' => [
            'id'          => 'acer',
            'nome'        => 'Acer',
            'icone'       => '&#128421;',
            'cor'         => '#8b5cf6',
            'descricao'   => 'Suporte técnico Acer — Atendimento direto',
            'instrucao'   => 'Entre em contato diretamente com o suporte Acer.',
            'proximosPassos' => [
                'Anote os dados do equipamento abaixo',
                'Ligue para o suporte Acer',
                'Informe os dados solicitados',
                'Registre o número do protocolo',
            ],
            'acoes' => [
                [
                    'id'          => 'copiar_dados',
                    'tipo'        => 'clipboard',
                    'label'       => 'Copiar Dados do Equipamento',
                    'icone'       => '&#128203;',
                    'descricao'   => 'Copia todos os dados do equipamento para consulta',
                ],
            ],
            'emailTemplate' => null,
            'portalUrl'     => null,
        ],
    ],
];
