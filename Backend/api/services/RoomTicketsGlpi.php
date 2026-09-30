<?php
declare(strict_types=1);

/**
 * Contrato do GLPI 10 para o fluxo de atendimento das salas.
 *
 * Este arquivo concentra TODO o conhecimento específico da versão do GLPI,
 * para que uma mudança de versão ou de configuração seja corrigida em um único
 * lugar. Nenhuma outra classe deve adivinhar nomes de campo.
 *
 * Fontes primárias (tag 10.0.19 do repositório oficial):
 *  - `src/Api/API.php::parseDropdowns()` e `src/DbUtils.php::isForeignKeyField()`:
 *    `expand_dropdowns=true` só substitui campos que casam `._id(_.+)?$`.
 *    Portanto `status`, `urgency`, `impact` e `priority` continuam INTEIROS,
 *    enquanto `locations_id`, `itilcategories_id`, `entities_id` e
 *    `users_id_recipient` passam a NOME. Ver `assertScalarContract()`.
 *  - `users_id_recipient` é o WRITER (autor do chamado), search option 22
 *    ("Writer"), preenchido automaticamente em `prepareInputForAdd`
 *    (`src/CommonITILObject.php`). NÃO é o técnico responsável e nunca deve ser
 *    escrito para simular atribuição.
 *  - O técnico responsável é um ator: `CommonITILActor` com `type = ASSIGN (2)`
 *    na tabela `glpi_tickets_users`. Leitura pela rota de sub-itens
 *    `GET /Ticket/{id}/Ticket_User`. Escrita pelo campo virtual `_actors` do
 *    `input` do PUT (`Ticket::prepareInputForUpdate` → `transformActorsInput`),
 *    com semântica de conjunto completo para o tipo enviado.
 *  - Solução formal é o itemtype `ITILSolution` (`glpi_itilsolutions`), criado
 *    por `POST /ITILSolution` com `itemtype`, `items_id`, `solutiontypes_id`
 *    (opcional) e `content`. `post_addItem` força o status do item para
 *    `SOLVED (5)` ou `CLOSED (6)` conforme `autoclose_delay` da entidade.
 *    Não existe `resolution`, `resolution_id`, `type_followup` nem
 *    `ITILFollowup.tickets_id` no GLPI 10.0.x.
 *  - `ITILFollowup` do GLPI 10 usa `itemtype` + `items_id` e serve apenas como
 *    acompanhamento comum, não como solução.
 *
 * Limites de atomicidade: a API do GLPI não oferece transação entre a leitura,
 * a escrita e a releitura. A proteção contra dois técnicos do GCC agindo ao
 * mesmo tempo é feita pelo lock por chamado no `RoomTicketWorkStore`, que
 * serializa apenas requisições originadas no GCC. Alterações feitas no GLPI
 * por fora do GCC durante a operação permanecem uma condição de corrida
 * possível e são detectadas pela releitura, nunca silenciosamente aceitas.
 */
/**
 * Resposta do GLPI em formato que esta integração não reconhece. Existe para
 * que um contrato divergente apareça como erro explicado, e nunca como um
 * valor adivinhado (por exemplo, um `status` textual virando 0 e recusando
 * toda movimentação sem dizer por quê).
 */
final class ContractException extends RuntimeException
{
}

final class RoomTicketsGlpi
{
    /** Tipos de ator de CommonITILActor (src/CommonITILActor.php). */
    public const ACTOR_REQUESTER = 1;
    public const ACTOR_ASSIGN = 2;
    public const ACTOR_OBSERVER = 3;

    /** Itemtype da relação de atores de Ticket (glpi_tickets_users). */
    public const ACTORS_ITEMTYPE = 'Ticket_User';

    /** Itemtype da solução formal (glpi_itilsolutions). */
    public const SOLUTION_ITEMTYPE = 'ITILSolution';

    public const STATUS_NEW = 1;
    public const STATUS_ASSIGNED = 2;
    public const STATUS_PLANNED = 3;
    public const STATUS_PENDING = 4;
    public const STATUS_SOLVED = 5;
    public const STATUS_CLOSED = 6;

    /** Etapas de leitura dos atores; 100 cobre qualquer atribuição real. */
    private const ACTOR_PAGE_SIZE = 100;
    private const ACTOR_MAX_ROWS = 20000;
    private const USER_PAGE_SIZE = 200;
    private const USER_MAX_TECHNICIANS = 600;
    private const SOLUTION_PAGE_SIZE = 50;

    /**
     * Lê um chamado para decisão. `expand_dropdowns=true` traz os NOMES de
     * local e categoria (necessários para identificar a sala) e mantém
     * `status`/`urgency` inteiros — comportamento verificado do GLPI 10.
     */
    public static function readTicket(GlpiClient $client, string $session, int $ticketId): array
    {
        $row = $client->getWithParams('/Ticket/' . $ticketId, $session, [
            'expand_dropdowns' => 'true', 'get_hateoas' => 'false',
        ]);
        if (!is_array($row) || (int) ($row['id'] ?? 0) !== $ticketId) return [];
        self::assertScalarContract($row);
        return $row;
    }

    /**
     * Falha explícita quando o GLPI devolver algo que a decisão não consegue
     * interpretar. Um `status` textual nunca vira 0 silencioso: isso faria
     * toda transição ser recusada sem explicar por quê.
     */
    public static function assertScalarContract(array $row): void
    {
        foreach (['status' => 'status do chamado', 'urgency' => 'urgência do chamado'] as $field => $label) {
            if (!array_key_exists($field, $row)) {
                throw new ContractException('O GLPI não devolveu o ' . $label . '.');
            }
            if (!is_int($row[$field]) && !(is_string($row[$field]) && ctype_digit($row[$field]))) {
                throw new ContractException('O GLPI devolveu o ' . $label
                    . ' em um formato que esta integração não reconhece.');
            }
        }
    }

    /** Atores do chamado. Falha fechada quando a coleção vem truncada. */
    public static function readActors(GlpiClient $client, string $session, int $ticketId): array
    {
        $batch = $client->getCollection('/Ticket/' . $ticketId . '/' . self::ACTORS_ITEMTYPE, $session, [
            'expand_dropdowns' => 'false', 'get_hateoas' => 'false',
        ], self::ACTOR_PAGE_SIZE);
        if ($batch['total'] > self::ACTOR_PAGE_SIZE) {
            throw new RuntimeException('O chamado tem mais atores do que o GCC consegue conferir.');
        }
        return $batch['items'];
    }

    /**
     * Técnico responsável (ator ASSIGN) do chamado.
     * `$names` é o índice id => nome vindo de `userIndex()`; usado apenas para
     * apresentação. A decisão sempre usa o ID.
     * Vários técnicos atribuídos é uma informação real: devolvida com
     * `ambiguous: true` e `userId: 0` para nunca atribuir por semelhança.
     */
    public static function assignee(array $actorRows, array $names): array
    {
        $ids = [];
        foreach ($actorRows as $row) {
            if (!is_array($row) || (int) ($row['type'] ?? 0) !== self::ACTOR_ASSIGN) continue;
            $userId = (int) ($row['users_id'] ?? 0);
            if ($userId > 0 && !in_array($userId, $ids, true)) $ids[] = $userId;
        }
        if (!$ids) return ['userId' => 0, 'name' => '', 'source' => '', 'ambiguous' => false];
        if (count($ids) > 1) {
            $labels = array_map(static fn(int $id): string => (string) ($names[$id] ?? ('#' . $id)), $ids);
            return ['userId' => 0, 'name' => implode(', ', $labels), 'source' => 'glpi_actors', 'ambiguous' => true];
        }
        return [
            'userId' => $ids[0],
            'name' => (string) ($names[$ids[0]] ?? ('#' . $ids[0])),
            'source' => 'glpi_actors',
            'ambiguous' => false,
        ];
    }

    /** IDs de técnicos do GLPI, para o seletor do formulário. */
    public static function readTechnicians(GlpiClient $client, string $session): array
    {
        $rows = [];
        $offset = 0;
        while ($offset < self::USER_MAX_TECHNICIANS) {
            $batch = $client->getCollection('/User', $session, [
                'is_technician' => '1', 'expand_dropdowns' => 'false', 'get_hateoas' => 'false',
                'range' => $offset . '-' . ($offset + self::USER_PAGE_SIZE - 1),
            ], self::USER_PAGE_SIZE);
            foreach ($batch['items'] as $row) {
                if (!is_array($row) || !isset($row['id'])) continue;
                if (array_key_exists('is_technician', $row) && (int) $row['is_technician'] !== 1) continue;
                $rows[] = ['id' => (int) $row['id'], 'name' => RoomTicketsService::text($row['name'] ?? '')];
            }
            $offset += count($batch['items']);
            if (!$batch['items'] || $offset >= $batch['total']) break;
        }
        $rows = array_values(array_filter($rows, static fn(array $row): bool => $row['name'] !== ''));
        usort($rows, static fn($a, $b) => strnatcasecmp($a['name'], $b['name']) ?: ($a['id'] <=> $b['id']));
        return $rows;
    }

    /** A restricted directory cannot identify a user by a typed name. */
    public static function optionalTechnicians(GlpiClient $client, string $session): array
    {
        try { return self::readTechnicians($client, $session); }
        catch (RuntimeException $error) {
            if ((int) ($error->http_code ?? $error->getCode()) !== 403) throw $error;
            return [];
        }
    }

    /** Índice id => nome dos usuários já lidos (para apresentação). */
    public static function nameIndex(array $rows): array
    {
        $index = [];
        foreach ($rows as $row) {
            if (is_array($row) && isset($row['id'])) {
                $index[(int) $row['id']] = RoomTicketsService::text($row['name'] ?? '');
            }
        }
        return $index;
    }

    /**
     * Input que ATRIBUI o técnico pelo mecanismo de atores.
     *
     * `_actors` tem semântica de conjunto completo: o que for enviado é o que
     * fica. "Assumir chamado" significa que ESTE técnico passa a ser o
     * responsável, então o conjunto de atribuições é substituído — manter um
     * técnico anterior deixaria dois responsáveis sem que nenhum deles saiba.
     * A troca é feita sob o lock por chamado, depois da verificação de
     * conflito, e é confirmada por releitura.
     *
     * Não toca em `users_id_recipient` (autor) nem em `requester`/`observer`.
     */
    public static function assignInput(array $actorRows, int $technicianId): array
    {
        return ['_actors' => ['assign' => [
            ['itemtype' => 'User', 'items_id' => $technicianId, 'use_notification' => 1],
        ]]];
    }

    /**
     * `solutiontypes_id` da solução. Ordem: override explícito do ambiente
     * (`GCC_ROOM_TICKET_SOLUTION_TYPE_ID`), depois o único tipo cadastrado.
     * Com mais de um tipo e sem override, a conclusão é recusada com uma
     * mensagem que explica a configuração necessária — nunca chutar um ID.
     */
    public static function solutionTypeId(GlpiClient $client, string $session): array
    {
        $override = trim((string) getenv('GCC_ROOM_TICKET_SOLUTION_TYPE_ID'));
        if ($override !== '' && ctype_digit($override) && (int) $override > 0) {
            return ['id' => (int) $override, 'name' => '', 'ambiguous' => false];
        }
        try {
        $batch = $client->getCollection('/SolutionType', $session, [
            'expand_dropdowns' => 'false', 'get_hateoas' => 'false',
        ], 100);
        } catch (RuntimeException $error) {
            if ((int) ($error->http_code ?? $error->getCode()) !== 403) throw $error;
            // solutiontypes_id is optional; let GLPI validate its own defaults.
            return ['id' => 0, 'name' => '', 'ambiguous' => false];
        }
        $rows = [];
        foreach ($batch['items'] as $row) {
            if (!is_array($row) || !isset($row['id'])) continue;
            $rows[] = ['id' => (int) $row['id'], 'name' => RoomTicketsService::text($row['name'] ?? '')];
        }
        if (count($rows) === 1) {
            return ['id' => $rows[0]['id'], 'name' => $rows[0]['name'], 'ambiguous' => false];
        }
        if (!$rows) return ['id' => 0, 'name' => '', 'ambiguous' => false];
        return ['id' => 0, 'name' => implode(', ', array_column($rows, 'name')), 'ambiguous' => true];
    }

    /** Input de `POST /ITILSolution`: a solução formal do chamado. */
    public static function solutionInput(int $ticketId, string $content, int $solutionTypeId): array
    {
        $input = ['itemtype' => 'Ticket', 'items_id' => $ticketId, 'content' => $content];
        if ($solutionTypeId > 0) $input['solutiontypes_id'] = $solutionTypeId;
        return $input;
    }

    /** Soluções já registradas no chamado, para confirmar sem duplicar. */
    public static function readSolutions(GlpiClient $client, string $session, int $ticketId): array
    {
        $batch = $client->getCollection('/Ticket/' . $ticketId . '/' . self::SOLUTION_ITEMTYPE, $session, [
            'expand_dropdowns' => 'false', 'get_hateoas' => 'false',
        ], self::SOLUTION_PAGE_SIZE);
        if ($batch['total'] > self::SOLUTION_PAGE_SIZE) {
            throw new RuntimeException('O chamado tem mais soluções do que o GCC consegue conferir.');
        }
        return $batch['items'];
    }

    /**
     * Índice tickets_id => responsável, para a LISTA, sem uma requisição por
     * chamado. Lê a relação de atores uma única vez.
     *
     * A coleção de relações pode estar bloqueada pelo perfil do GLPI. Isso é
     * tolerado de forma explícita: devolve `available: false` e a lista passa a
     * mostrar apenas o responsável registrado pelo GCC, com aviso. Nunca inventa
     * um responsável quando a leitura não foi possível.
     */
    public static function readActorIndex(GlpiClient $client, string $session): array
    {
        $rows = [];
        $offset = 0;
        try {
            do {
                $batch = $client->getCollection('/' . self::ACTORS_ITEMTYPE, $session, [
                    'expand_dropdowns' => 'false', 'get_hateoas' => 'false',
                    'range' => $offset . '-' . ($offset + self::ACTOR_PAGE_SIZE - 1),
                ], self::ACTOR_PAGE_SIZE);
                foreach ($batch['items'] as $row) {
                    if (!is_array($row) || (int) ($row['type'] ?? 0) !== self::ACTOR_ASSIGN) continue;
                    $ticketId = (int) ($row['tickets_id'] ?? 0);
                    $userId = (int) ($row['users_id'] ?? 0);
                    if ($ticketId > 0 && $userId > 0) $rows[$ticketId][$userId] = true;
                }
                $offset += count($batch['items']);
                if (!$batch['items'] || $offset >= $batch['total']) break;
                if ($offset > self::ACTOR_MAX_ROWS) {
                    return ['available' => false, 'index' => [], 'reason' => 'A relação de atores do GLPI é grande demais para uma leitura única.'];
                }
            } while (true);
        } catch (RuntimeException $error) {
            return ['available' => false, 'index' => [], 'reason' => 'Seu acesso ao GLPI não permitiu ler os responsáveis dos chamados.'];
        }
        if (!$rows) return ['available' => true, 'index' => [], 'reason' => ''];
        // User names are optional presentation data, unlike the verified actor IDs.
        $names = [];
        $reason = '';
        try {
            $names = self::nameIndex(self::readTechnicians($client, $session));
        } catch (RuntimeException $error) {
            $reason = 'Nomes dos técnicos indisponíveis no GLPI. Responsáveis identificados pelo número do usuário.';
        }
        $index = [];
        foreach ($rows as $ticketId => $users) {
            $ids = array_keys($users);
            sort($ids);
            $index[$ticketId] = self::assignee(
                array_map(static fn(int $id): array => ['type' => self::ACTOR_ASSIGN, 'users_id' => $id], $ids),
                $names
            );
        }
        return ['available' => true, 'index' => $index, 'reason' => $reason];
    }
}
