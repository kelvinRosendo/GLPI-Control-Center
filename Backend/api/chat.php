<?php
/**
 * api/chat.php
 * -----------------------------------------------------------------------------
 * Proxy para a Gemini API.
 * Recebe a pergunta do usuário e responde com base no contexto
 * dos horários dos carrinhos de Chromebooks.
 */

declare(strict_types=1);

final class ChatEndpoint
{
    public static function handle(): void
    {
        // Só aceita POST
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Responde::erro('Método não permitido.', 405);
        }

        // Lê o body
        $body = json_decode(file_get_contents('php://input'), true);
        $mensagem = trim($body['message'] ?? '');

        if ($mensagem === '') {
            Responde::erro('Campo "message" é obrigatório.', 400);
        }

        $apiKey = getenv('GEMINI_API_KEY');
        if (!$apiKey) {
            Responde::erro('GEMINI_API_KEY não configurada.', 500);
        }

        // ── Contexto fixo (documento de horários) ─────────────────────────────
        $contexto = <<<CONTEXTO
Você é o assistente do GLPI Control Center do Colégio Satélite.
Responda perguntas sobre os horários de uso dos carrinhos de Chromebooks.
Seja objetivo e direto. Responda em português.

=== HORÁRIOS DE AULA ===

MANHÃ:
1ª aula: 07:30 | 2ª aula: 08:20 | Intervalo: 09:10
3ª aula: 09:30 | 4ª aula: 10:20 | 5ª aula: 11:10 | 6ª aula: 12:00 | Saída: 12:50

TARDE:
1ª aula: 13:10 | 2ª aula: 14:00 | 3ª aula: 14:50 | Intervalo: 15:20
4ª aula: 16:00 | 5ª aula: 16:50 | 6ª aula: 17:40 | Saída: 18:20

=== ORGANIZAÇÃO DOS CARRINHOS ===

CARRINHO 1 — Andar, Sala 5
  MANHÃ: 4º ano A e B
  TARDE: 3º ano C

CARRINHO 2 — Andar, Sala 5
  MANHÃ: 3º ano A e B
  TARDE: não utilizado

CARRINHO 3 — Andar, Sala 11
  MANHÃ: 6º e 7º ano A
  TARDE: 5º e 7º ano B

CARRINHO 4 — Andar, Sala 11
  MANHÃ: 5º e 8º ano A
  TARDE: 4º ano C e 6º ano B

CARRINHO 5 — Andar, Sala 15
  MANHÃ: 9º ano A
  TARDE: 8º e 9º ano B

=== MONITORES ===
6º ano A: Gustavo S. e Manu
6º ano B: Davi Mota e Sofia Bravo
7º ano A: Nicolly e Maria E.
7º ano B: Marina e Kaique
8º ano A: (ver planilha)
8º ano B: (ver planilha)
9º ano A: (ver planilha)
9º ano B: (ver planilha)

=== REGRAS DE USO ===
- Língua Portuguesa e Matemática: 2x por semana
- Disciplinas com 2 aulas semanais: 1x por semana
- Disciplinas com 1 aula semanal: 1x a cada 15 dias
- Redação 6º ao 8º ano: 1x a cada 15 dias
- Redação 9º ano: 1x por mês
- Educação Física: 1x por mês (6º ao 9º ano)

=== HORÁRIOS SEMANAIS POR TURMA (visão geral) ===

CARRINHO 3 — 6º ano A:
  Segunda: Eletiva | Terça: Português | Quarta: Inglês | Quinta: Inglês | Sexta: -
  1ª aula: Eletiva/Inglês | 2ª: Português/Espanhol/Geografia | 3ª: Redação/Ciências/ECO/Geografia/Eletiva
  4ª: Matemática/História/Arte/Matemática/Ed.Física | 5ª: Ed.Física/Ciências/Matemática/Espanhol/Redação
  6ª: Matemática/Arte/ECO/História/Português

CARRINHO 3 — 7º ano A:
  1ª: - | 2ª: Geografia/Biologia/Inglês | 3ª: Física/ECO/Eletiva/Arte
  4ª: Química/Português/Espanhol/História | 5ª: Redação/Educ.Tec./Matemática
  6ª: Português/Matemática/Educ.Física

CARRINHO 4 — 5º ano A:
  1ª: Inglês/História/Ciências/Ciências/Ed.Física | 2ª: Arte/Geografia/Português/Matemática
  3ª: Inglês/Redação/Matemática | 4ª: História/Espanhol/Português
  5ª: Matemática/ECO/ECO/Arte | 6ª: Português/Matemática/Eletiva/Geografia

CARRINHO 4 — 8º ano A:
  2ª: Geografia/Biologia/Inglês | 3ª: Física/ECO/Eletiva/Arte
  4ª: Química/Português/Espanhol/História | 5ª: Redação/Educ.Tec./Matemática
  6ª: Português/Matemática/Educ.Física

CARRINHO 5 — 9º ano A:
  2ª: Geografia/Biologia/Inglês | 3ª: Física/Eletiva/Arte
  4ª: Química/Português/Espanhol/História | 5ª: Redação/Educ.Tec./Matemática
  6ª: Português/Matemática/Educ.Física
CONTEXTO;

        // ── Payload para a Gemini API ──────────────────────────────────────────
        $payload = [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [['text' => $contexto . "\n\nPergunta do usuário: " . $mensagem]],
                ],
            ],
            'generationConfig' => [
                'temperature' => 0.3,
                'maxOutputTokens' => 512,
            ],
        ];

        // ── Chamada cURL para a Gemini API ─────────────────────────────────────
       $url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=' . $apiKey;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
        ]);

        $raw = curl_exec($ch);
        $err = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) {
            Responde::erro('Erro de rede ao chamar Gemini API.', 502, ['curl_error' => $err]);
        }

        $json = json_decode($raw, true);

        if ($code >= 400) {
            Responde::erro('Gemini API retornou erro.', 502, ['http_code' => $code, 'response' => $json]);
        }

        // Extrai o texto da resposta
        $resposta = $json['candidates'][0]['content']['parts'][0]['text'] ?? 'Não foi possível obter uma resposta.';

        Responde::ok(['data' => ['resposta' => $resposta]]);
    }
}