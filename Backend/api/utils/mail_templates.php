<?php
/**
 * api/utils/mail_templates.php
 * Templates de e-mail para alertas de projetores.
 */

declare(strict_types=1);

final class MailTemplates
{
  public static function renderAlertHtml(array $alerts, array $results): string
  {
    $critical = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'lampada_critica'));
    $warning = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'lampada_aviso'));
    $maintenance = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'manutencao_atrasada'));
    $cleaning = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'limpeza_necessaria'));

    $html = '<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{font-family:"Segoe UI",Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
  .container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;padding:24px}
  .header h1{margin:0;font-size:20px;font-weight:600}
  .header p{margin:8px 0 0;font-size:13px;opacity:.9}
  .content{padding:24px}
  .section{margin-bottom:20px}
  .section h2{font-size:16px;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid}
  .section h2.critical{color:#DC2626;border-color:#DC2626}
  .section h2.warning{color:#D97706;border-color:#D97706}
  .section h2.info{color:#2563EB;border-color:#2563EB}
  .item{background:#f9fafb;border-radius:6px;padding:12px;margin-bottom:8px;border-left:4px solid}
  .item.critical{border-color:#DC2626}
  .item.warning{border-color:#D97706}
  .item.info{border-color:#2563EB}
  .item-gray{border-color:#6B7280}
  .name{font-weight:600;color:#111827}
  .detail{font-size:13px;color:#6B7280;margin-top:4px}
  .summary{background:#f0f9ff;border-radius:6px;padding:16px;margin-top:20px}
  .summary h3{margin:0 0 8px;font-size:14px;color:#1e40af}
  .summary p{margin:4px 0;font-size:13px;color:#374151}
  .footer{background:#f9fafb;padding:16px 24px;text-align:center;font-size:12px;color:#9CA3AF;border-top:1px solid #E5E7EB}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Alertas de Projetores</h1>
    <p>GLPI Control Center - ' . htmlspecialchars(date('d/m/Y H:i')) . '</p>
  </div>
  <div class="content">';

    if (!empty($critical)) {
      $html .= '<div class="section"><h2 class="critical">CRITICO (' . count($critical) . ')</h2>';
      foreach ($critical as $a) {
        $html .= '<div class="item critical">
          <div class="name">' . htmlspecialchars($a['nome']) . '</div>
          <div class="detail">Patrimonio: ' . htmlspecialchars($a['patrimonio'] ?? '') . '<br>
          Lampada: ' . (int) $a['horas_lampada'] . 'h (' . ($a['percentual_uso'] ?? '?') . '%)<br>
          <strong>Substituir lampada URGENTE</strong></div>
        </div>';
      }
      $html .= '</div>';
    }

    if (!empty($warning)) {
      $html .= '<div class="section"><h2 class="warning">ATENCAO (' . count($warning) . ')</h2>';
      foreach ($warning as $a) {
        $html .= '<div class="item warning">
          <div class="name">' . htmlspecialchars($a['nome']) . '</div>
          <div class="detail">Patrimonio: ' . htmlspecialchars($a['patrimonio'] ?? '') . '<br>
          Lampada: ' . (int) $a['horas_lampada'] . 'h (' . ($a['percentual_uso'] ?? '?') . '%)<br>
          Agendar substituicao em breve</div>
        </div>';
      }
      $html .= '</div>';
    }

    if (!empty($maintenance)) {
      $html .= '<div class="section"><h2 class="info">MANUTENCAO ATRASADA (' . count($maintenance) . ')</h2>';
      foreach ($maintenance as $a) {
        $dias = $a['dias_desde_manutencao'] ?? '?';
        $html .= '<div class="item info">
          <div class="name">' . htmlspecialchars($a['nome']) . '</div>
          <div class="detail">Patrimonio: ' . htmlspecialchars($a['patrimonio'] ?? '') . '<br>
          Dias sem manutencao: ' . $dias . '<br>
          Realizar limpeza/manutencao</div>
        </div>';
      }
      $html .= '</div>';
    }

    if (!empty($cleaning)) {
      $html .= '<div class="section"><h2 class="info">LIMPEZA NECESSARIA (' . count($cleaning) . ')</h2>';
      foreach ($cleaning as $a) {
        $html .= '<div class="item item-gray">
          <div class="name">' . htmlspecialchars($a['nome']) . '</div>
          <div class="detail">Patrimonio: ' . htmlspecialchars($a['patrimonio'] ?? '') . '<br>
          Realizar limpeza preventiva</div>
        </div>';
      }
      $html .= '</div>';
    }

    $html .= '<div class="summary">
      <h3>Resumo da Verificacao</h3>
      <p>Projetores verificados: ' . ($results['checked'] ?? 0) . '</p>
      <p>Total de alertas: ' . ($results['alerts'] ?? 0) . '</p>
      <p>Criticos: ' . ($results['critical'] ?? 0) . ' | Atencao: ' . ($results['warning'] ?? 0) . '</p>
    </div>';

    $html .= '</div>
  <div class="footer">GLPI Control Center - Colégio Satélite</div>
</div>
</body>
</html>';

    return $html;
  }

  public static function renderAlertText(array $alerts, array $results): string
  {
    $text = "ALERTAS DE PROJETORES - " . date('d/m/Y H:i') . "\n";
    $text .= str_repeat('=', 50) . "\n\n";

    $critical = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'lampada_critica'));
    $warning = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'lampada_aviso'));
    $maintenance = array_values(array_filter($alerts, fn($a) => $a['tipo'] === 'manutencao_atrasada'));

    if (!empty($critical)) {
      $text .= "CRITICO (" . count($critical) . ")\n";
      $text .= str_repeat('-', 30) . "\n";
      foreach ($critical as $a) {
        $text .= "- {$a['nome']} ({$a['patrimonio'] ?? ''})\n";
        $text .= "  Lampada: {$a['horas_lampada']}h (" . ($a['percentual_uso'] ?? '?') . "%)\n";
        $text .= "  SUBSTITUIR URGENTE\n\n";
      }
    }

    if (!empty($warning)) {
      $text .= "ATENCAO (" . count($warning) . ")\n";
      $text .= str_repeat('-', 30) . "\n";
      foreach ($warning as $a) {
        $text .= "- {$a['nome']} ({$a['patrimonio'] ?? ''})\n";
        $text .= "  Lampada: {$a['horas_lampada']}h (" . ($a['percentual_uso'] ?? '?') . "%)\n";
        $text .= "  Agendar substituicao\n\n";
      }
    }

    if (!empty($maintenance)) {
      $text .= "MANUTENCAO ATRASADA (" . count($maintenance) . ")\n";
      $text .= str_repeat('-', 30) . "\n";
      foreach ($maintenance as $a) {
        $dias = $a['dias_desde_manutencao'] ?? '?';
        $text .= "- {$a['nome']} ({$a['patrimonio'] ?? ''})\n";
        $text .= "  Dias sem manutencao: {$dias}\n\n";
      }
    }

    $text .= str_repeat('=', 50) . "\n";
    $text .= "Verificados: " . ($results['checked'] ?? 0) . " | Alertas: " . ($results['alerts'] ?? 0) . "\n";
    $text .= "GLPI Control Center\n";

    return $text;
  }
}
