<?php
/**
 * GLPI Control Center - AIProvider.php
 * -----------------------------------------------------------------------------
 * Adaptador de provedor de IA para OpenCode Go.
 *
 * Gerencia comunicação com a API do OpenCode Go via HTTP cURL.
 * Modelo, endpoint e chave são configuráveis via variáveis de ambiente.
 *
 * Sprint 06: Agente de IA
 */

class AIProvider {

  private string $apiKey;
  private string $baseUrl;
  private string $model;
  private int $timeout;
  private int $maxTokens;

  private static ?array $modelsCache = null;

  public function __construct() {
    $this->apiKey = getenv('OPENCODE_GO_API_KEY') ?: '';
    $this->baseUrl = rtrim(getenv('OPENCODE_GO_BASE_URL') ?: 'https://opencode.ai/zen/go/v1', '/');
    $this->model = getenv('OPENCODE_GO_MODEL') ?: 'deepseek-flash';
    $this->timeout = (int)(getenv('OPENCODE_GO_TIMEOUT') ?: 30);
    $this->maxTokens = (int)(getenv('OPENCODE_GO_MAX_TOKENS') ?: 4096);
  }

  public function isConfigured(): bool {
    return $this->apiKey !== '';
  }

  public function getModel(): string {
    return $this->model;
  }

  public function getBaseUrl(): string {
    return $this->baseUrl;
  }

  public function getTimeout(): int {
    return $this->timeout;
  }

  public function getMaxTokens(): int {
    return $this->maxTokens;
  }

  /**
   * Envia mensagem com tools para o modelo via Chat Completions API.
   */
  public function chatWithTools(array $messages, array $tools = [], array $options = []): array {
    if (!$this->isConfigured()) {
      return [
        'success' => false,
        'error' => 'Provedor de IA não configurado. Defina OPENCODE_GO_API_KEY.',
        'provider' => 'opencode-go',
      ];
    }

    $payload = [
      'model' => $options['model'] ?? $this->model,
      'messages' => $messages,
      'max_tokens' => $options['max_tokens'] ?? $this->maxTokens,
      'temperature' => $options['temperature'] ?? 0.3,
    ];

    if (!empty($tools)) {
      $payload['tools'] = $tools;
      $payload['tool_choice'] = $options['tool_choice'] ?? 'auto';
    }

    $startTime = microtime(true);
    $result = $this->request('/chat/completions', $payload);
    $duration = round((microtime(true) - $startTime) * 1000);

    $result['duration_ms'] = $duration;
    $result['model'] = $payload['model'];
    $result['provider'] = 'opencode-go';

    return $result;
  }

  /**
   * Envia mensagem simples sem tools.
   */
  public function chat(array $messages, array $options = []): array {
    return $this->chatWithTools($messages, [], $options);
  }

  /**
   * Lista modelos disponíveis no provedor.
   */
  public function listModels(): array {
    if (self::$modelsCache !== null) {
      return self::$modelsCache;
    }

    $result = $this->requestRaw('/models', [], 'GET');
    if ($result['success'] && isset($result['data']['data'])) {
      self::$modelsCache = $result['data']['data'];
      return self::$modelsCache;
    }

    return [];
  }

  /**
   * Valida se o modelo suporta tool calling.
   */
  public function supportsToolCalling(): ?bool {
    // A configuração não comprova capacidade. A chamada real ao provedor a valida.
    return null;
  }

  /**
   * Realiza requisição HTTP POST para o endpoint.
   */
  private function request(string $endpoint, array $payload): array {
    return $this->requestRaw($endpoint, $payload, 'POST');
  }

  private function requestRaw(string $endpoint, array $payload, string $method = 'POST'): array {
    $url = $this->baseUrl . $endpoint;

    $ch = curl_init();
    curl_setopt_array($ch, [
      CURLOPT_URL => $url,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => $this->timeout,
      CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $this->apiKey,
      ],
    ]);

    if ($method === 'POST') {
      curl_setopt($ch, CURLOPT_POST, true);
      curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    } elseif ($method === 'GET') {
      curl_setopt($ch, CURLOPT_HTTPGET, true);
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
      return [
        'success' => false,
        'error' => "Erro de conexão: {$error}",
        'http_code' => 0,
      ];
    }

    if ($httpCode === 0) {
      return [
        'success' => false,
        'error' => 'Sem resposta do servidor',
        'http_code' => 0,
      ];
    }

    $data = json_decode($response, true);

    if ($httpCode >= 400) {
      $errorMsg = $data['error']['message'] ?? $data['message'] ?? "Erro HTTP {$httpCode}";
      return [
        'success' => false,
        'error' => $errorMsg,
        'http_code' => $httpCode,
        'data' => $data,
      ];
    }

    return [
      'success' => true,
      'data' => $data,
      'http_code' => $httpCode,
    ];
  }
}
