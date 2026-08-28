<?php
/**
 * api/utils/mailer.php
 * Servico de envio de e-mails via SMTP usando cURL.
 */

declare(strict_types=1);

final class Mailer
{
  private static ?array $config = null;

  private static function getConfig(): array
  {
    if (self::$config !== null) {
      return self::$config;
    }

    self::$config = [
      'host' => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
      'port' => (int) (getenv('SMTP_PORT') ?: 587),
      'username' => getenv('SMTP_USERNAME') ?: '',
      'password' => getenv('SMTP_PASSWORD') ?: '',
      'encryption' => getenv('SMTP_ENCRYPTION') ?: 'tls',
      'from_email' => getenv('EMAIL_FROM') ?: '',
      'from_name' => getenv('EMAIL_FROM_NAME') ?: 'GLPI Control Center',
    ];

    return self::$config;
  }

  public static function isConfigured(): bool
  {
    $config = self::getConfig();
    return $config['host'] !== '' && $config['username'] !== '' && $config['from_email'] !== '';
  }

  public static function send(string|array $to, string $subject, string $htmlBody, ?string $textBody = null): array
  {
    $config = self::getConfig();

    if (!self::isConfigured()) {
      return [
        'ok' => false,
        'error' => 'E-mail nao configurado. Verifique SMTP_* no .env',
      ];
    }

    $recipients = is_array($to) ? $to : [$to];
    $recipients = array_values(array_filter($recipients, static fn($email): bool => is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL) !== false));
    if ($recipients === []) return ['ok' => false, 'error' => 'Nenhum destinatário válido.'];
    $subject = str_replace(["\r", "\n", "\0"], ' ', $subject);
    $results = [];

    foreach ($recipients as $recipient) {
      $result = self::sendSingle($config, $recipient, $subject, $htmlBody, $textBody);
      $results[] = $result;
    }

    $allOk = !in_array(false, array_column($results, 'ok'), true);

    return [
      'ok' => $allOk,
      'sent' => count($results),
      'results' => $results,
    ];
  }

  public static function sendWithAlerts(array $to, array $alerts, array $results): array
  {
    $subject = '[GLPI] Alertas preventivos de projetores';
    $html = MailTemplates::renderAlertHtml($alerts, $results);
    $text = MailTemplates::renderAlertText($alerts, $results);
    return self::send($to, $subject, $html, $text);
  }

  private static function sendSingle(
    array $config,
    string $to,
    string $subject,
    string $htmlBody,
    ?string $textBody
  ): array {
    if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
      return ['ok' => false, 'to' => '', 'error' => 'Destinatário inválido.'];
    }
    $boundary = md5(uniqid((string) time()));

    $headerLines = [];
    $headerLines[] = 'From: ' . self::formatAddress($config['from_email'], $config['from_name']);
    $headerLines[] = 'To: ' . $to;
    $headerLines[] = 'Subject: ' . $subject;
    $headerLines[] = 'MIME-Version: 1.0';
    $headerLines[] = 'Date: ' . date('r');

    if ($textBody !== null) {
      $headerLines[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
    } else {
      $headerLines[] = 'Content-Type: text/html; charset=UTF-8';
    }

    $body = '';
    if ($textBody !== null) {
      $body .= '--' . $boundary . "\r\n";
      $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
      $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
      $body .= $textBody . "\r\n\r\n";
      $body .= '--' . $boundary . "\r\n";
      $body .= "Content-Type: text/html; charset=UTF-8\r\n";
      $body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
      $body .= $htmlBody . "\r\n\r\n";
      $body .= '--' . $boundary . '--';
    } else {
      $body = $htmlBody;
    }

    return self::smtpSend($config, $to, $headerLines, $body);
  }

  private static function smtpSend(
    array $config,
    string $to,
    array $headers,
    string $body
  ): array {
    $url = sprintf('smtp://%s:%d', $config['host'], $config['port']);

    $ch = curl_init($url);

    curl_setopt_array($ch, [
      CURLOPT_MAIL_FROM => $config['from_email'],
      CURLOPT_MAIL_RCPT => [$to],
      CURLOPT_HEADER => false,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 30,
      CURLOPT_VERBOSE => false,
    ]);

    if ($config['username'] !== '') {
      curl_setopt($ch, CURLOPT_USERNAME, $config['username']);
      curl_setopt($ch, CURLOPT_PASSWORD, $config['password']);
    }

    if ($config['encryption'] === 'ssl') {
      curl_setopt($ch, CURLOPT_USE_SSL, CURLUSESSL_ALL);
    } elseif ($config['encryption'] === 'tls') {
      curl_setopt($ch, CURLOPT_USE_SSL, CURLUSESSL_TRY);
    }

    $payload = implode("\r\n", $headers) . "\r\n\r\n" . $body;

    $fp = tmpfile();
    fwrite($fp, $payload);
    fseek($fp, 0);
    curl_setopt($ch, CURLOPT_INFILE, $fp);
    curl_setopt($ch, CURLOPT_INFILESIZE, strlen($payload));
    curl_setopt($ch, CURLOPT_UPLOAD, true);

    $success = curl_exec($ch);
    $error = curl_error($ch);

    fclose($fp);
    curl_close($ch);

    if ($success) {
      return ['ok' => true, 'to' => $to];
    }

    return [
      'ok' => false,
      'to' => $to,
      'error' => $error ?: 'Erro desconhecido no envio',
    ];
  }

  private static function formatAddress(string $email, string $name): string
  {
    $email = str_replace(["\r", "\n", "\0"], '', $email);
    $name = str_replace(["\r", "\n", "\0", '"', '\\'], ['', '', '', "'", ''], $name);
    if ($name !== '') {
      return '"' . $name . '" <' . $email . '>';
    }
    return $email;
  }
}
