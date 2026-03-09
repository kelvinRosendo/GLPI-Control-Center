<?php
/**
 * api/client.php
 * -----------------------------------------------------------------------------
 * Cliente do GLPI via cURL.
 * Responsável por:
 * - initSession()
 * - get()
 * - killSession()
 */

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

  /**
 * Encerra a sessão autenticada no GLPI.
 *
 * Por que existe:
 * - A API do GLPI exige que toda sessão aberta com initSession()
 *   seja encerrada manualmente com killSession.
 * - Não encerrar acumula sessões abertas no servidor GLPI.
 *
 * Por que não usa o método request() padrão:
 * - O GLPI retorna `true` (booleano) no killSession, não um array JSON.
 * - O método request() espera array e quebraria com TypeError.
 * - Aqui fazemos uma chamada cURL direta e ignoramos o retorno.
 */
public function killSession(string $sessionToken): void
{
    // Valida se URL, App-Token e User-Token estão configurados
    $this->validate();

    // Monta a URL do endpoint de logout do GLPI
    $url = $this->baseUrl . '/killSession';

    // Inicializa uma requisição cURL para essa URL
    $ch = curl_init($url);

    curl_setopt_array($ch, [
        // Retorna a resposta como string (em vez de imprimir direto)
        CURLOPT_RETURNTRANSFER => true,

        // Método HTTP GET (padrão do killSession no GLPI)
        CURLOPT_CUSTOMREQUEST  => 'GET',

        // Headers obrigatórios para autenticar a requisição no GLPI
        CURLOPT_HTTPHEADER     => [
            'Session-Token: ' . $sessionToken, // token da sessão a ser encerrada
            'App-Token: ' . $this->appToken,   // token do app registrado no GLPI
        ],

        // Tempo máximo de espera pela resposta (25 segundos)
        CURLOPT_TIMEOUT        => 25,

        // Desativa validação de certificado SSL
        // Necessário em redes internas com certificado autoassinado
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);

    // Executa a requisição (ignoramos o retorno — GLPI retorna `true`)
    curl_exec($ch);

    // Encerra e libera o recurso cURL da memória
    curl_close($ch);
}
  /**
   * Faz GET em qualquer endpoint do GLPI.
   * Ex: $path = "/Computer?range=0-200&expand_dropdowns=true"
   */
  public function get(string $path, string $sessionToken): array
  {
    $this->validate();

    $url = $this->baseUrl . $path;

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
      CURLOPT_CUSTOMREQUEST => $method,
      CURLOPT_HTTPHEADER => $finalHeaders,
      CURLOPT_TIMEOUT => 25,
    ]);

    // HTTPS: modo seguro por padrão (recomendado)
    if ($this->sslInsecure) {
      // Somente para ambiente de teste quando o certificado é interno/autoassinado
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    } else {
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
      curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    }

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false) {
      Responde::erro('Erro de rede ao chamar GLPI.', 502, ['curl_error' => $err]);
    }

    $json = json_decode((string) $raw, true);

    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
      Responde::erro('Resposta do GLPI não veio em JSON.', 502, [
        'http_code' => $code,
        'raw_preview' => substr((string) $raw, 0, 350),
      ]);
    }

    if ($code >= 400) {
      Responde::erro('GLPI retornou erro HTTP.', 502, [
        'http_code' => $code,
        'response' => $json,
      ]);
    }

    return $json;
  }
}