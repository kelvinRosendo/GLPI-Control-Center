<?php
declare(strict_types=1);

require_once __DIR__ . '/services/GlpiCollectionReader.php';

final class GlpiClient
{
  private string $baseUrl;
  private string $appToken;
  private string $userToken;
  private bool $sslInsecure;

  public function __construct(array $glpiConfig)
  {
    $this->baseUrl = rtrim((string) ($glpiConfig['url'] ?? ''), '/');
    $this->appToken = (string) ($glpiConfig['app_token'] ?? '');
    $this->userToken = (string) ($glpiConfig['user_token'] ?? '');
    $this->sslInsecure = (bool) ($glpiConfig['ssl_insecure'] ?? false);
  }

  public function validate(): void
  {
    if ($this->baseUrl === '') {
      throw new \RuntimeException('GLPI_URL não configurada.');
    }
    if ($this->appToken === '') {
      throw new \RuntimeException('GLPI_APP_TOKEN não configurado.');
    }
    if ($this->userToken === '') {
      throw new \RuntimeException('GLPI_USER_TOKEN não configurado.');
    }
  }

  public function initSession(): string
  {
    $this->validate();

    $url = $this->baseUrl . '/initSession';

    $res = $this->request('GET', $url, [
      'Authorization' => 'user_token ' . $this->userToken,
      'App-Token' => $this->appToken,
    ]);

    if (!isset($res['session_token'])) {
      throw new \RuntimeException('GLPI não retornou session_token no initSession: ' . json_encode($res));
    }

    return (string) $res['session_token'];
  }

  public function killSession(string $sessionToken): void
  {
    $this->validate();

    $url = $this->baseUrl . '/killSession';

    $ch = curl_init($url);

    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST  => 'GET',
      CURLOPT_HTTPHEADER     => [
        'Session-Token: ' . $sessionToken,
        'App-Token: ' . $this->appToken,
      ],
      CURLOPT_TIMEOUT        => 25,
      CURLOPT_SSL_VERIFYPEER => !$this->sslInsecure,
      CURLOPT_SSL_VERIFYHOST => $this->sslInsecure ? 0 : 2,
    ]);

    curl_exec($ch);
    $ch = null;
  }


  /**
   * Strict page read for reports: never turn upstream failure into an empty list.
   * Existing legacy callers keep their previous behavior.
   */
  public function getReportPage(string $path, string $sessionToken, int $offset, int $size = 200, bool $expandDropdowns = false): array
  {
    $batch = $this->getWithParamsRaw($path, $sessionToken, [
      'expand_dropdowns' => $expandDropdowns ? 'true' : 'false', 'get_hateoas' => 'false',
      'is_deleted' => 'false', 'sort' => 'id', 'order' => 'ASC',
      'range' => $offset . '-' . ($offset + $size - 1),
    ]);
    $code = $batch['_http_code'] ?? 0;
    if ($code === 403) {
      throw new RuntimeException('Acesso à coleção GLPI não permitido.', 403);
    }
    $items = $batch['items'] ?? null;
    if (!in_array($code, [200, 206], true) || isset($batch['_error'])
        || !is_array($items) || $items !== array_values($items)) {
      throw new RuntimeException('Não foi possível consultar a coleção GLPI para o relatório.', 502);
    }
    $total = isset($batch['_content_range'])
      ? self::parseContentRangeTotal($batch['_content_range']) : null;
    if ($total === null) {
      throw new RuntimeException('GLPI não informou o total da coleção para o relatório.', 502);
    }
    foreach ($items as $item) {
      if (!is_array($item) || !isset($item['id']) || !is_numeric($item['id'])) {
        throw new RuntimeException('Registro GLPI inválido no relatório.', 502);
      }
    }
    return ['items' => $items, 'total' => $total];
  }

  /**
   * Strict collection read that also returns the real total, so callers can
   * fail closed instead of silently truncating. Used for sub-item collections
   * (actors, solutions) where the `Content-Range` header is the only source
   * of the total size.
   */
  public function getCollection(string $path, string $sessionToken, array $params = [], int $size = 100): array
  {
    // O `range` do chamador tem precedência: sem isso, a paginação
    // sobrescreveria o intervalo e releria sempre a primeira página.
    $batch = $this->getWithParamsRaw($path, $sessionToken, array_merge([
      'sort' => 'id', 'order' => 'ASC',
    ], $params, [
      'range' => array_key_exists('range', $params) ? $params['range'] : '0-' . max(0, $size - 1),
    ]));
    $code = $batch['_http_code'] ?? 0;
    if (!in_array($code, [200, 206], true) || isset($batch['_error'])) {
      throw new RuntimeException('Não foi possível consultar a coleção do GLPI.', $code === 403 ? 403 : 502);
    }
    $items = $batch['items'] ?? null;
    if (!is_array($items) || $items !== array_values($items)) {
      throw new RuntimeException('Coleção do GLPI em formato inesperado.', 502);
    }
    $total = isset($batch['_content_range']) ? self::parseContentRangeTotal($batch['_content_range']) : null;
    // GLPI returns HTTP 200 + [] without Content-Range for empty sub-items.
    // Only the initial, empty, successful page establishes an empty collection.
    $range = (string) ($params['range'] ?? '0-' . max(0, $size - 1));
    if ($total === null && !isset($batch['_content_range']) && $code === 200
        && $items === [] && str_starts_with($range, '0-')
        && preg_match('#^/Ticket/[1-9][0-9]*/(?:Ticket_User|ITILSolution)$#', $path) === 1) {
      $total = 0;
    }
    if ($total === null && $code === 200 && is_array($items)
        && preg_match('#^/Ticket/[1-9][0-9]*/(?:Ticket_User|ITILSolution)$#', $path) === 1) {
      // GLPI 10 may return a complete subcollection without Content-Range.
      // These endpoints are bounded to one ticket, so the payload itself is
      // the authoritative total.
      $total = count($items);
    }
    if ($total === null) throw new RuntimeException('GLPI não informou o total da coleção.', 502);
    foreach ($items as $item) {
      if (!is_array($item) || !isset($item['id']) || !is_numeric($item['id'])) {
        throw new RuntimeException('Registro do GLPI inválido.', 502);
      }
    }
    if (count($items) > $total) throw new RuntimeException('Total inconsistente na coleção do GLPI.', 502);
    return ['items' => $items, 'total' => $total];
  }

  public function post(string $path, string $sessionToken, array $payload): array
  {
    return $this->requestWithJsonBody('POST', $path, $sessionToken, $payload);
  }

  public function put(string $path, string $sessionToken, array $payload): array
  {
    return $this->requestWithJsonBody('PUT', $path, $sessionToken, $payload);
  }

  public function get(string $path, string $sessionToken): array
  {
    $this->validate();

    $url = $this->baseUrl . $path;

    return $this->request('GET', $url, [
      'Session-Token' => $sessionToken,
      'App-Token' => $this->appToken,
    ]);
  }

  public function getWithParams(string $path, string $sessionToken, array $params = []): array
  {
    $this->validate();

    if (!isset($params['expand_dropdowns'])) {
      $params['expand_dropdowns'] = 'true';
    }

    $queryString = http_build_query($params);
    $url = $this->baseUrl . $path;

    if ($queryString !== '') {
      $url .= '?' . $queryString;
    }

    return $this->request('GET', $url, [
      'Session-Token' => $sessionToken,
      'App-Token' => $this->appToken,
    ]);
  }

  /**
   * Busca todos os registros de uma coleção GLPI com paginação robusta.
   *
   * Usa o header Content-Range retornado pelo GLPI para determinar o total
   * real e parar corretamente. Trata HTTP 206 como resposta parcial válida.
   * Não possui limite silencioso de 10 mil registros.
   *
   * @return array{items: array, total: int|null, complete: bool, errors: string[]}
   */
  public function getAllWithParams(string $path, string $sessionToken, array $params = [], int $batchSize = 500): array
  {
    return GlpiCollectionReader::collect(
      function (int $offset, int $size) use ($path, $sessionToken, $params): array {
        $batch = $this->getWithParamsRaw($path, $sessionToken, array_merge($params, [
          'range' => $offset . '-' . ($offset + $size - 1),
          'sort' => 'id', 'order' => 'ASC',
        ]));
        // GLPI returns HTTP 200 with [] and no Content-Range for an empty
        // collection. Treat that response as a verified zero-item snapshot;
        // a non-empty collection still must provide its total for pagination.
        if (($batch['_http_code'] ?? 0) === 200
            && ($batch['items'] ?? null) === []
            && !isset($batch['_content_range'])) {
          $batch['_content_range'] = '0-0/0';
        }
        return $batch;
      },
      $batchSize
    );
  }

  /**
   * Busca uma página e retorna items + metadados sem chamar Responde::erro.
   */
  private function getWithParamsRaw(string $path, string $sessionToken, array $params = []): array
  {
    $this->validate();

    if (!isset($params['expand_dropdowns'])) {
      $params['expand_dropdowns'] = 'true';
    }

    $queryString = http_build_query($params);
    $url = $this->baseUrl . $path;
    if ($queryString !== '') {
      $url .= '?' . $queryString;
    }

    $ch = curl_init($url);
    $finalHeaders = [
      'Session-Token: ' . $sessionToken,
      'App-Token: ' . $this->appToken,
    ];

    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST  => 'GET',
      CURLOPT_HTTPHEADER     => $finalHeaders,
      CURLOPT_TIMEOUT        => 30,
      CURLOPT_HEADER         => true,
    ]);

    if ($this->sslInsecure) {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    } else {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    }

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headerStr = substr((string) $raw, 0, $headerSize);
    $body = substr((string) $raw, $headerSize);
    $ch = null;

    if ($raw === false) {
      return ['items' => [], '_http_code' => 0, '_content_range' => null, '_error' => $err];
    }

    $contentRange = null;
    foreach (explode("\r\n", $headerStr) as $line) {
      if (stripos($line, 'Content-Range:') === 0) {
        $contentRange = trim(substr($line, strlen('Content-Range:')));
        break;
      }
    }

    $json = json_decode($body, true);
    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      return ['items' => [], '_http_code' => $code, '_content_range' => $contentRange, '_error' => 'JSON decode failed'];
    }

    return [
      'items' => $json,
      '_http_code' => $code,
      '_content_range' => $contentRange,
    ];
  }

  /**
   * Extrai o total do header Content-Range: "items 0-499/1234"
   */
  private static function parseContentRangeTotal(string $header): ?int
  {
    if (preg_match('/\/(\d+)\s*$/', $header, $m) === 1) {
      return (int) $m[1];
    }
    return null;
  }

  /**
   * Wrapper legado para chamadas que ainda esperam só o array.
   * @deprecated Use getAllWithParams que retorna {items, total, complete, errors}
   */
  public function getAllWithParamsLegacy(string $path, string $sessionToken, array $params = [], int $batchSize = 500): array
  {
    $result = $this->getAllWithParams($path, $sessionToken, $params, $batchSize);
    return $result['items'];
  }

  private function request(string $method, string $url, array $headers): array
  {
    $ch = curl_init($url);

    $finalHeaders = [];
    foreach ($headers as $k => $v) {
      $finalHeaders[] = $k . ': ' . $v;
    }

    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST  => $method,
      CURLOPT_HTTPHEADER     => $finalHeaders,
      CURLOPT_TIMEOUT        => 25,
    ]);

    if ($this->sslInsecure) {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    } else {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    }

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $ch = null;

    if ($raw === false) {
      throw new \RuntimeException('Erro de rede ao chamar GLPI: ' . $err, 502);
    }

    $json = json_decode((string) $raw, true);

    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      throw new \RuntimeException('Resposta do GLPI não veio em JSON (HTTP ' . $code . '): ' . substr((string) $raw, 0, 350), 502);
    }

    if ($code >= 400) {
      $ex = new \RuntimeException('GLPI retornou erro HTTP ' . $code . ': ' . json_encode($json), 502);
      // Preservar código para diferenciação 401/403/404/timeout
      $ex->http_code = $code;
      $ex->glpi_response = $json;
      throw $ex;
    }

    return $json;
  }

  private function requestWithJsonBody(string $method, string $path, string $sessionToken, array $payload): array
  {
    $this->validate();

    $url = $this->baseUrl . $path;
    $body = json_encode($payload);

    $ch = curl_init($url);

    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST  => $method,
      CURLOPT_HTTPHEADER     => [
        'Session-Token: ' . $sessionToken,
        'App-Token: ' . $this->appToken,
        'Content-Type: application/json',
        'Content-Length: ' . strlen((string) $body),
      ],
      CURLOPT_POSTFIELDS => $body,
      CURLOPT_TIMEOUT    => 25,
    ]);

    if ($this->sslInsecure) {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    } else {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    }

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    $ch = null;

    if ($raw === false) {
      throw new \RuntimeException("Erro de rede ao chamar GLPI ({$method}): " . $err, 502);
    }

    $json = json_decode((string) $raw, true);

    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      throw new \RuntimeException("Resposta do GLPI não veio em JSON ({$method}) HTTP {$code}: " . substr((string) $raw, 0, 350), 502);
    }

    if ($code >= 400) {
      $ex = new \RuntimeException("GLPI retornou erro HTTP ({$method}) {$code}: " . json_encode($json), 502);
      $ex->http_code = $code;
      $ex->glpi_response = $json;
      throw $ex;
    }

    return $json;
  }
}
