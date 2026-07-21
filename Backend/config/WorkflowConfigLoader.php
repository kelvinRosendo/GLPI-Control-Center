<?php
/**
 * config/WorkflowConfigLoader.php
 * -----------------------------------------------------------------------------
 * Configuration Loader centralizado para o Workflow.
 *
 * POR QUE EXISTE?
 * - O Workflow (e outros módulos) precisam de configurações
 * - Antes, cada arquivo lia configs diretamente (acoplamento)
 * - Agora, existe um ÚNICO ponto de acesso às configurações
 *
 * COMO FUNCIONA?
 * - Carrega todos os arquivos de configuração na inicialização
 * - Fornece métodos para acessar cada tipo de configuração
 * - Cacheia os resultados (não recarrega a cada chamada)
 *
 * PADRÃO UTILIZADO:
 * - Service Layer Pattern
 * - Single Source of Truth
 * - Lazy Loading (carrega sob demanda)
 *
 * FLUXO:
 * Workflow → WorkflowConfigLoader::getAssistencias()
 *          → ConfigLoader carrega assistencias.config.php
 *          → Retorna array com assistências
 *
 * NO FUTURO (ETAPA 4):
 * Workflow → WorkflowConfigLoader::getAssistencias()
 *          → ConfigLoader consulta banco de dados
 *          → Retorna array com assistências
 *          → Workflow NÃO SENTE A DIFERENÇA
 */

declare(strict_types=1);

final class WorkflowConfigLoader
{
    private static ?self $instance = null;
    private array $configs = [];
    private bool $loaded = false;

    private const CONFIG_PATH = __DIR__ . '/workflows/';

    private function __construct() {}

    /**
     * Padrão Singleton: garante uma única instância do loader.
     * Por que? Evita carregar configs múltiplas vezes.
     */
    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Carrega todos os arquivos de configuração.
     * Chamado uma única vez (lazy loading).
     */
    private function loadAll(): void
    {
        if ($this->loaded) return;

        $files = [
            'assistencias'  => 'assistencias.config.php',
            'checklists'    => 'checklists.config.php',
            'flows'         => 'flows.config.php',
            'status'        => 'status.config.php',
            'integracoes'   => 'integracoes.config.php',
        ];

        foreach ($files as $key => $file) {
            $path = self::CONFIG_PATH . $file;
            if (file_exists($path)) {
                $this->configs[$key] = require $path;
            } else {
                throw new RuntimeException("Config file not found: {$file}");
            }
        }

        $this->loaded = true;
    }

    /**
     * Obtém uma configuração específica.
     * Método genérico para acesso.
     */
    private function get(string $key): array
    {
        $this->loadAll();
        return $this->configs[$key] ?? [];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MÉTODOS PÚBLICOS - Interface para o resto do sistema
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Retorna todas as assistências técnicas.
     *
     * USO:
     *   $assistencias = WorkflowConfigLoader::getInstance()->getAssistencias();
     */
    public function getAssistencias(): array
    {
        return $this->get('assistencias')['assistencias'] ?? [];
    }

    /**
     * Retorna uma assistência pelo ID.
     *
     * USO:
     *   $torino = WorkflowConfigLoader::getInstance()->getAssistenciaById('torino');
     */
    public function getAssistenciaById(string $id): ?array
    {
        foreach ($this->getAssistencias() as $a) {
            if ($a['id'] === $id) {
                return $a;
            }
        }
        return null;
    }

    /**
     * Valida se uma assistência existe.
     *
     * USO:
     *   if (WorkflowConfigLoader::getInstance()->isValidAssistencia('torino')) { ... }
     */
    public function isValidAssistencia(string $id): bool
    {
        return $this->getAssistenciaById($id) !== null;
    }

    /**
     * Retorna os grupos do checklist.
     *
     * USO:
     *   $grupos = WorkflowConfigLoader::getInstance()->getChecklistGroups();
     */
    public function getChecklistGroups(): array
    {
        return $this->get('checklists')['checklist_groups'] ?? [];
    }

    /**
     * Retorna todas as perguntas do checklist (flat array).
     *
     * USO:
     *   $questions = WorkflowConfigLoader::getInstance()->getChecklistQuestions();
     */
    public function getChecklistQuestions(): array
    {
        $questions = [];
        foreach ($this->getChecklistGroups() as $group) {
            foreach ($group['questions'] ?? [] as $q) {
                $questions[] = $q;
            }
        }
        return $questions;
    }

    /**
     * Retorna uma pergunta do checklist pelo ID.
     *
     * USO:
     *   $q = WorkflowConfigLoader::getInstance()->getChecklistQuestionById('tipo_problema');
     */
    public function getChecklistQuestionById(string $id): ?array
    {
        foreach ($this->getChecklistQuestions() as $q) {
            if ($q['id'] === $id) {
                return $q;
            }
        }
        return null;
    }

    /**
     * Retorna os fluxos de assistência.
     *
     * USO:
     *   $flows = WorkflowConfigLoader::getInstance()->getFlows();
     */
    public function getFlows(): array
    {
        return $this->get('flows')['flows'] ?? [];
    }

    /**
     * Retorna o fluxo de uma assistência específica.
     *
     * USO:
     *   $flow = WorkflowConfigLoader::getInstance()->getFlowByAssistencia('hbb');
     */
    public function getFlowByAssistencia(string $assistenciaId): ?array
    {
        return $this->getFlows()[$assistenciaId] ?? null;
    }

    /**
     * Retorna o mapeamento de status.
     *
     * USO:
     *   $statusMap = WorkflowConfigLoader::getInstance()->getStatusMap();
     *   $status = $statusMap[1]; // 'aberto'
     */
    public function getStatusMap(): array
    {
        return $this->get('status')['status_map'] ?? [];
    }

    /**
     * Retorna o status padrão.
     */
    public function getStatusDefault(): string
    {
        return $this->get('status')['status_default'] ?? 'aberto';
    }

    /**
     * Converte um ID de status do GLPI para nome legível.
     *
     * USO:
     *   $status = WorkflowConfigLoader::getInstance()->mapStatus(1); // 'aberto'
     */
    public function mapStatus(int $glpiStatusId): string
    {
        $map = $this->getStatusMap();
        return $map[$glpiStatusId] ?? $this->getStatusDefault();
    }

    /**
     * Retorna o mapeamento de prioridade.
     */
    public function getPrioridadeMap(): array
    {
        return $this->get('status')['prioridade_map'] ?? [];
    }

    /**
     * Retorna a prioridade padrão.
     */
    public function getPrioridadeDefault(): string
    {
        return $this->get('status')['prioridade_default'] ?? 'media';
    }

    /**
     * Converte um ID de prioridade do GLPI para nome legível.
     *
     * USO:
     *   $prioridade = WorkflowConfigLoader::getInstance()->mapPrioridade(3); // 'media'
     */
    public function mapPrioridade(int $glpiPrioridadeId): string
    {
        $map = $this->getPrioridadeMap();
        return $map[$glpiPrioridadeId] ?? $this->getPrioridadeDefault();
    }

    /**
     * Retorna o mapeamento de status do ativo.
     */
    public function getAssetStatusMap(): array
    {
        return $this->get('status')['asset_status_map'] ?? [];
    }

    /**
     * Converte um states_id do GLPI para nome legível.
     *
     * Aceita tanto int quanto string (expand_dropdowns do GLPI retorna string).
     *
     * USO:
     *   $status = WorkflowConfigLoader::getInstance()->mapAssetStatus(2); // 'manutencao'
     *   $status = WorkflowConfigLoader::getInstance()->mapAssetStatus('Em uso'); // 'ativo'
     */
    public function mapAssetStatus(mixed $statesId): string
    {
        if ($statesId === null || $statesId === '' || $statesId === 0) {
            return $this->get('status')['asset_status_default'] ?? 'ativo';
        }

        $numericId = is_numeric($statesId) ? (int) $statesId : null;

        if ($numericId !== null && $numericId > 0) {
            $map = $this->getAssetStatusMap();
            return $map[$numericId] ?? $this->get('status')['asset_status_default'] ?? 'ativo';
        }

        return $this->get('status')['asset_status_default'] ?? 'ativo';
    }

    /**
     * Retorna configurações de integração.
     */
    public function getIntegracoes(): array
    {
        return $this->get('integracoes') ?? [];
    }

    /**
     * Retorna configuração da OpenAI.
     */
    public function getOpenAIConfig(): array
    {
        return $this->getIntegracoes()['openai'] ?? [];
    }

    /**
     * Retorna os padrões de regex para identificação de ativos.
     */
    public function getAssetPatterns(): array
    {
        return $this->getIntegracoes()['asset_patterns'] ?? [];
    }

    /**
     * Retorna a versão do workflow.
     */
    public function getWorkflowVersion(): string
    {
        return $this->getIntegracoes()['workflow_version'] ?? '2.0.0';
    }

    /**
     * Retorna configurações de paginação.
     */
    public function getPagination(): array
    {
        return $this->getIntegracoes()['pagination'] ?? [];
    }

    /**
     * Força o recarregamento das configurações.
     * Útil para testes ou quando as configurações mudam em runtime.
     */
    public function reload(): void
    {
        $this->configs = [];
        $this->loaded = false;
        $this->loadAll();
    }
}
