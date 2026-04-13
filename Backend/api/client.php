<?php
declare(strict_types=1);

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
      Responde::erro('GLPI_URL não configurada.', 500);
    }
    if ($this->appToken === '') {
      Responde::erro('GLPI_APP_TOKEN não configurado.', 500);
    }
    if ($this->userToken === '') {
      Responde::erro('GLPI_USER_TOKEN não configurado.', 500);
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
      Responde::erro('GLPI não retornou session_token no initSession.', 502, ['glpi' => $res]);
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
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_SSL_VERIFYHOST => 0,
    ]);

    curl_exec($ch);
    $ch = null;
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
      Responde::erro('Erro de rede ao chamar GLPI.', 502, ['curl_error' => $err]);
    }

    $json = json_decode((string) $raw, true);

    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      Responde::erro('Resposta do GLPI não veio em JSON.', 502, [
        'http_code'   => $code,
        'raw_preview' => substr((string) $raw, 0, 350),
      ]);
    }

    if ($code >= 400) {
      Responde::erro('GLPI retornou erro HTTP.', 502, [
        'http_code' => $code,
        'response'  => $json,
      ]);
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
      Responde::erro("Erro de rede ao chamar GLPI ({$method}).", 502, ['curl_error' => $err]);
    }

    $json = json_decode((string) $raw, true);

    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      Responde::erro("Resposta do GLPI não veio em JSON ({$method}).", 502, [
        'http_code'   => $code,
        'raw_preview' => substr((string) $raw, 0, 350),
      ]);
    }

    if ($code >= 400) {
      Responde::erro("GLPI retornou erro HTTP ({$method}).", 502, [
        'http_code' => $code,
        'response'  => $json,
      ]);
    }

    return $json;
  }
}
