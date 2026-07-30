/**
 * GLPI Control Center - workflow.config.js
 * -----------------------------------------------------------------------------
 * Configurações centralizadas do Workflow Wizard.
 * Todas as listas de opções ficam aqui para facilitar manutenção e evolução.
 *
 * Sprint 1.5: Estrutura base
 * Sprint 2: Expansão com contratos, fornecedores, categorias GLPI
 */

window.WORKFLOW_CONFIG = {
  assistencias: [
    { id: 'torino',    label: 'Torino' },
    { id: 'hbb',       label: 'HBB' },
    { id: 'acer_geek', label: 'Acer Geek' },
    { id: 'acer',      label: 'Acer' },
  ],

  prioridades: [
    { id: 1, label: 'Muito Baixa' },
    { id: 2, label: 'Baixa' },
    { id: 3, label: 'Média' },
    { id: 4, label: 'Alta' },
    { id: 5, label: 'Muito Alta' },
  ],

  tiposProblema: [
    { id: 'hardware',    label: 'Hardware' },
    { id: 'software',    label: 'Software' },
    { id: 'rede',        label: 'Rede' },
    { id: 'perifericos', label: 'Periféricos' },
    { id: 'estrutural',  label: 'Estrutural' },
    { id: 'outro',       label: 'Outro' },
  ],

  workflowVersion: '1.0',
};
