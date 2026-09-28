<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/services/RoomTicketsService.php';
require_once __DIR__ . '/../api/services/RoomTicketsReader.php';

$count = 0;
function check(bool $condition, string $message): void {
    global $count;
    if (!$condition) throw new RuntimeException($message);
    $count++;
}
function rejects(callable $fn, string $message): void {
    try { $fn(); } catch (Throwable $e) { check(true, $message); return; }
    check(false, $message);
}
$now = new DateTimeImmutable('2026-09-24 14:00:00', new DateTimeZone('America/Sao_Paulo'));
$filters = RoomTicketsService::filters([], $now);
check($filters['from'] === '2026-08-26' && $filters['to'] === '2026-09-24', '30 dias de calendário inclusivos');
$previous = RoomTicketsService::filters(['period'=>'previous_month'], $now);
check($previous['start'] === '2026-08-01 00:00:00' && $previous['end'] === '2026-09-01 00:00:00', 'Mês anterior');
$leap = RoomTicketsService::filters(['period'=>'previous_month'], new DateTimeImmutable('2024-03-20'));
check($leap['to'] === '2024-02-29', 'Ano bissexto');
rejects(fn()=>RoomTicketsService::filters(['period'=>'custom','from'=>'2026-02-30','to'=>'2026-03-01']), 'Data impossível');
rejects(fn()=>RoomTicketsService::filters(['period'=>['30d']]), 'Query em array');
rejects(fn()=>RoomTicketsService::filters(['period'=>'custom','from'=>'2026-10-01','to'=>'2026-09-01']), 'Intervalo invertido');
rejects(fn()=>RoomTicketsService::filters(['period'=>'custom','from'=>'2020-01-01','to'=>'2026-09-01']), 'Intervalo excessivo');
rejects(fn()=>RoomTicketsService::filters(['page'=>'-1']), 'Página negativa');
rejects(fn()=>RoomTicketsService::filters(['type'=>'script']), 'Tipo inválido');
$locations = [['id'=>1,'name'=>'Sala 010'],['id'=>2,'completename'=>'Bloco B > Sala 10']];
$categories = [['id'=>1,'name'=>'Projetor'], ['id'=>2,'name'=>'Mouse']];
$base = ['entities_id'=>0,'date'=>'2026-09-10 10:00:00','status'=>1,'locations_id'=>1,'itilcategories_id'=>1,'content'=>''];
$tickets = [
    $base + ['id'=>1,'name'=>'Imagem falhando'],
    array_replace($base,['id'=>2,'name'=>'Sem imagem','status'=>5]),
    array_replace($base,['id'=>3,'name'=>'[L-0003] Mouse não funciona','locations_id'=>0,'itilcategories_id'=>2,'content'=>'<p>Local: sala 10</p><p>Ref. espelho: L-0003</p>']),
    array_replace($base,['id'=>4,'name'=>'[L-0004] Revisar local','locations_id'=>0]),
    array_replace($base,['id'=>5,'name'=>'Outro prédio','locations_id'=>2]),
    array_replace($base,['id'=>6,'name'=>'Excluído','is_deleted'=>1]),
    array_replace($base,['id'=>7,'name'=>'Outro período','date'=>'2026-08-01 00:00:00']),
    array_replace($base,['id'=>8,'name'=>'Chamado administrativo','locations_id'=>0]),
    array_replace($base,['id'=>9,'name'=>'Data inválida','date'=>'2026-09-31 00:00:00']),
    array_replace($base,['id'=>10,'name'=>'Mesmo local, outra entidade','entities_id'=>2]),
];
$tickets[] = $tickets[0];
$links = [
    ['id'=>1,'tickets_id'=>1,'itemtype'=>'Computer','items_id'=>7],
    ['id'=>2,'tickets_id'=>1,'itemtype'=>'Computer','items_id'=>7],
    ['id'=>3,'tickets_id'=>1,'itemtype'=>'Printer','items_id'=>7],
    ['id'=>4,'tickets_id'=>2,'itemtype'=>'Computer','items_id'=>7],
];
$assets = [['id'=>7,'itemtype'=>'Computer','name'=>'Projetor-07','category'=>'projector','raw'=>['otherserial'=>'0007']]];
$normalized = RoomTicketsService::normalize($tickets,$locations,$categories,$links,$assets);
check($normalized['invalidDates'] === 1, 'Data inválida sinalizada');
check(count($normalized['items']) === 7, 'Exclusões e deduplicação');
$result = RoomTicketsService::aggregate($normalized['items'], $filters);
check($result['summary']['total'] === 6, 'Todos os status no período');
check($result['summary']['open'] === 5, 'Resolvido não conta como aberto');
check($result['latest']['id'] === 10, 'Último chamado independe da ordenação por urgência');
check($result['summary']['withoutRoom'] === 1, 'Referência sem local fica visível para revisão');
check($result['rankings']['rooms'][0]['count'] === 3, 'Sala 010 e campo Sala 10 unificados');
check(count($result['rankings']['rooms']) === 3, 'Hierarquia e entidade preservadas');
check($result['rankings']['assets'][0]['count'] === 2, 'Vínculo duplicado não infla ranking');
check(count($result['rankings']['assets']) === 2, 'Computer:7 e Printer:7 separados');
check($result['rankings']['assets'][0]['tag'] === '0007', 'Zeros no patrimônio');
$onePage = RoomTicketsService::aggregate($normalized['items'], array_replace($filters,['per_page'=>1]));
check(count($onePage['items']) === 1 && $onePage['summary']['total'] === 6, 'Ranking independente da página');
$mouse = RoomTicketsService::aggregate($normalized['items'], array_replace($filters,['type'=>'mouse']));
check($mouse['summary']['total'] === 1, 'Filtro por tipo');
$asset = RoomTicketsService::aggregate($normalized['items'], array_replace($filters,['asset'=>'Computer:7']));
check($asset['summary']['total'] === 2, 'Filtro por identidade composta');
$empty = RoomTicketsService::aggregate([], $filters);
check($empty['summary']['total'] === 0 && $empty['pagination']['pages'] === 1, 'Vazio sem divisão por zero');
$boundary = [
    array_replace($base,['id'=>20,'name'=>'Limite inicial','date'=>'2026-08-26 00:00:00']),
    array_replace($base,['id'=>21,'name'=>'Limite final','date'=>'2026-09-24 23:59:59']),
    array_replace($base,['id'=>22,'name'=>'Dia seguinte','date'=>'2026-09-25 00:00:00']),
];
$b = RoomTicketsService::normalize($boundary,$locations,$categories,[],[]);
check(RoomTicketsService::aggregate($b['items'],$filters)['summary']['total'] === 2, 'Limites inclusivos por dia');
$tieItems = RoomTicketsService::normalize([
    array_replace($base,['id'=>30,'name'=>'A']), array_replace($base,['id'=>31,'name'=>'B','locations_id'=>2])
],$locations,$categories,[],[]);
check(count(RoomTicketsService::aggregate($tieItems['items'],$filters)['summary']['topRooms']) === 2, 'Empates explícitos');
$multi = RoomTicketsService::normalize([array_replace($base,['id'=>32,'name'=>'Mouse e teclado','itilcategories_id'=>0])],$locations,[],[],[]);
$m = RoomTicketsService::aggregate($multi['items'],$filters);
check($m['summary']['total'] === 1 && count($m['rankings']['types']) === 2, 'Um chamado, múltiplos tipos');
check($multi['items'][0]['typeSource'] === 'titulo_inferido', 'Inferência sinalizada');
$noHistoricalRoom = RoomTicketsService::normalize([
    array_replace($base,['id'=>33,'name'=>'Sem sala','locations_id'=>0])
], [], [], [['tickets_id'=>33,'items_id'=>7,'itemtype'=>'Computer']], [
    ['id'=>7,'itemtype'=>'Computer','name'=>'PC','locations_id'=>1]
]);
check($noHistoricalRoom['items'] === [], 'Localização atual do ativo não inventa sala histórica');
$pages = RoomTicketsReader::collect(fn($offset,$size)=>['items'=>$offset === 0 ? [['id'=>1],['id'=>2]] : [['id'=>3]],'total'=>3]);
check(count($pages) === 3, 'Paginação segue quantidade retornada');
check(RoomTicketsReader::collect(fn()=>['items'=>[],'total'=>0]) === [], 'Coleção vazia comprovada');
rejects(fn()=>RoomTicketsReader::collect(fn()=>['items'=>[['id'=>1]],'total'=>2]), 'Página repetida falha');
rejects(fn()=>RoomTicketsReader::collect(fn()=>['items'=>[],'total'=>3]), 'Página vazia incompleta falha');
rejects(fn()=>RoomTicketsReader::collect(fn()=>['items'=>[],'total'=>10001]), 'Limite falha explicitamente');
rejects(fn()=>RoomTicketsReader::collect(fn($offset)=>['items'=>[['id'=>$offset+1]],'total'=>$offset===0?2:3]), 'Mudança de total falha');
rejects(fn()=>RoomTicketsReader::collect(fn()=>['items'=>[]]), 'Total ausente falha');

$peripheral = RoomTicketsService::normalize([
    array_replace($base, ['id'=>40,'name'=>'Não funciona','itilcategories_id'=>2])
], $locations, $categories, [['tickets_id'=>40,'items_id'=>8,'itemtype'=>'Computer']],
    [['id'=>8,'itemtype'=>'Computer','name'=>'CS-008','category'=>'computer_cs']]);
check($peripheral['items'][0]['types'] === ['mouse'], 'Categoria Mouse não é substituída pelo PC vinculado');
check($peripheral['items'][0]['assets'][0]['key'] === 'Computer:8', 'Vínculo original preservado');
$reported = RoomTicketsService::normalize([
    array_replace($base, ['id'=>41,'name'=>'Não funciona','itilcategories_id'=>2,'content'=>'Equipamento: Teclado'])
], $locations, $categories, [], []);
check($reported['items'][0]['types'] === ['keyboard'], 'Campo explícito prevalece sobre categoria genérica');

$locMap = [1 => 'Sala 010', 2 => 'Bloco B > Sala 10'];
$detected = RoomTicketsService::detectRoom(['name'=>'Sem título','locations_id'=>1], $locMap);
check($detected === ['Sala 10', 'local_glpi'], 'detectRoom usa o cadastro de locais');
$detected = RoomTicketsService::detectRoom(['name'=>'Sem título','locations_id'=>0,'content'=>"<p>Local: sala 10</p>"], $locMap);
check($detected === ['Sala 10', 'campo_local'], 'detectRoom usa o campo Local do chamado');
$detected = RoomTicketsService::detectRoom(['name'=>'Projetor queimado na sala 05','locations_id'=>0], $locMap);
check($detected === ['Sala 5', 'titulo_inferido'], 'detectRoom infere sala pelo título');
$detected = RoomTicketsService::detectRoom(['name'=>'[L-0004] Revisar local','locations_id'=>0], $locMap);
check($detected === [null, 'nao_identificado'], 'detectRoom não inventa sala sem indício');
$detected = RoomTicketsService::detectRoom(['name'=>'[L-0005] Bloco B','locations_id'=>2], $locMap);
check($detected[0] === 'bloco b > Sala 10' && $detected[1] === 'local_glpi', 'detectRoom preserva a hierarquia');

foreach (['aberto'=>true, 'em_andamento'=>true, 'pendente'=>true, 'resolvido'=>false, 'fechado'=>false] as $status => $expected) {
    check(RoomTicketsService::isAlertEligible(['status'=>$status]) === $expected, 'Elegibilidade de alerta: ' . $status);
}
check(RoomTicketsService::isAlertEligible([]) === false, 'Status ausente não gera alerta');

$monitor = RoomTicketsService::monitorEntries($normalized['items']);
check(count($monitor) === 7, 'Monitoramento independe de filtros e paginação');
check($monitor[0]['id'] === 10, 'Monitor ordena do mais recente para o antigo');
check(array_column($monitor, 'id') === [10,5,4,3,2,1,7], 'Ordenação por data e desempate por ID');
check($monitor[4]['id'] === 2 && $monitor[4]['eligible'] === false, 'Chamado resolvido sinalizado como inelegível');
check($monitor[0]['eligible'] === true, 'Chamado aberto sinalizado como elegível');
check(count(RoomTicketsService::monitorEntries($normalized['items'], 3)) === 3, 'Limite do monitor respeitado');
check(RoomTicketsService::monitorEntries([]) === [], 'Monitor vazio sem erro');
$filtered = RoomTicketsService::aggregate($normalized['items'], array_replace($filters, ['status'=>'fechado']));
check($filtered['summary']['total'] === 0 && count(RoomTicketsService::monitorEntries($normalized['items'])) === 7,
    'Monitor não acompanha filtro de relatório');

$single = RoomTicketsService::fromGlpi([
    'id'=>78, 'name'=>'[L-0009] Projetor não liga', 'content'=>'',
    'date'=>'2026-09-10 10:00:00', 'status'=>1, 'entities_id'=>'Escola',
    'locations_id'=>'Sala 16', 'itilcategories_id'=>'Projetor',
]);
check($single !== null && $single['room'] === 'Sala 16' && $single['reference'] === 'L-0009',
    'Chamado expandido do GLPI entra na fila');
check($single['status'] === 'aberto' && $single['roomSource'] === 'local_glpi', 'Status e origem da sala preservados');
check(RoomTicketsService::fromGlpi([
    'id'=>79, 'name'=>'Chamado administrativo', 'content'=>'', 'date'=>'2026-09-10 10:00:00', 'status'=>1,
]) === null, 'Chamado sem sala e sem referência fora da fila');
check(RoomTicketsService::fromGlpi([
    'id'=>80, 'name'=>'[L-0010] Sem data', 'content'=>'', 'date'=>'2026-09-31 00:00:00', 'status'=>1,
]) === null, 'Data inválida fora da fila');
check(RoomTicketsService::fromGlpi([
    'id'=>81, 'name'=>'[L-0011] Excluído', 'content'=>'', 'date'=>'2026-09-10 10:00:00', 'status'=>1, 'is_deleted'=>1,
]) === null, 'Chamado excluído fora da fila');

echo "OK: {$count} verificações de chamados por sala.\n";
