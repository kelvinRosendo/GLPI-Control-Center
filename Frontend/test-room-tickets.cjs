const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/javascript/room-tickets.js', 'utf8');
function fixture() {
  const node = () => ({ addEventListener(name, fn) { this[name] = fn; } });
  const elements = Object.fromEntries(['period','from','to','room','type','status','q'].map(k => [k, { ...node(), value: k === 'period' ? '30d' : '' }]));
  const form = { ...node(), elements }, page = node(), auto = node();
  const detailBody = { innerHTML: '' };
  const dialog = { querySelector: () => detailBody, showModal() { this.open = true; }, close() { this.open = false; } };
  const root = { innerHTML: '', querySelector(s) { return { '.rt-dashboard':page, '#rt-filters':form, '#rt-auto':auto }[s]; } };
  const pending = [], calls = [], timers = new Set();
  const window = {
    STATE: { tab:'chamados-salas' }, CONFIG: { glpiUrl:'https://glpi.example.test' },
    location: { href:'https://gcc.example.test/', search:'' },
    history: { replaceState(_, __, url) { window.location.href = String(url); window.location.search = new URL(url).search; } },
    ApiClient: { get(url, options) { calls.push({url,options}); return new Promise((resolve,reject)=>pending.push({resolve,reject})); } },
  };
  const context = vm.createContext({
    window, document: { hidden:false, getElementById(id) { return id === 'main-content' ? root : dialog; } },
    URL, URLSearchParams, Date, console,
    FormData: class { get(key) { return elements[key]?.value; } },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  return { window, root, form, page, auto, calls, pending, timers, dialog, detailBody,
    click(dataset) { page.click({target:{closest:()=>({dataset})}}); },
    async settle(value) { pending.shift().resolve(value); await new Promise(resolve=>setImmediate(resolve)); },
  };
}
function response() {
  return { data: {
    filters:{from:'2026-08-26',to:'2026-09-24'}, pagination:{page:1,pages:2,total:26},
    summary:{total:26,open:4,withoutRoom:1,withoutAsset:3,review:1,topRooms:[{label:'Sala 10',count:12}],topTypes:[{label:'Projetor',count:14}]},
    rankings:{rooms:[{key:'0:sala 10',label:'Sala 10',count:12}],types:[{key:'projector',label:'Projetor',count:14}],assets:[]},
    options:{rooms:[{key:'0:sala 10',label:'Sala 10'}]},
    meta:{complete:true,collectedAt:'2026-09-24T14:00:00-03:00',warnings:[]},
    items:[{id:9,title:'<img src=x onerror=alert(1)>',description:'<script>alert(1)</script>',room:'Sala 10',
      types:['projector'],openedAt:'2026-09-10 10:00:00',status:'aberto',assets:[],reference:'L-0009',
      roomSource:'local_glpi',typeSource:'categoria_glpi'}],
  }};
}
test('carregamento único, agregados do servidor, escape e detalhes', async () => {
  const f = fixture();
  f.window.RoomTickets.mount(); f.window.RoomTickets.mount();
  assert.equal(f.calls.length,1);
  assert.match(f.root.innerHTML,/Consultando chamados/);
  assert.equal(f.calls[0].options.cache,false);
  assert.equal(f.calls[0].options.retries,0);
  await f.settle(response());
  assert.match(f.root.innerHTML,/26/);
  assert.match(f.root.innerHTML,/&lt;img/);
  assert.doesNotMatch(f.root.innerHTML,/<img src=x/);
  f.click({rtTicket:'9'});
  assert.equal(f.dialog.open,true);
  assert.match(f.detailBody.innerHTML,/&lt;script&gt;/);
  assert.match(f.detailBody.innerHTML,/https:\/\/glpi.example.test\/front\/ticket.form.php\?id=9/);
});
test('clique no ranking e paginação enviam filtros ao backend', async () => {
  const f = fixture(); f.window.RoomTickets.mount(); await f.settle(response());
  f.click({rtDimension:'type',rtKey:'projector'});
  assert.match(f.calls[1].url,/type=projector/);
  assert.match(f.calls[1].url,/page=1/);
  await f.settle(response());
  f.click({rtAction:'next'});
  assert.match(f.calls[2].url,/page=2/);
  assert.match(f.calls[2].url,/type=projector/);
});
test('datas personalizadas e busca entram na consulta', async () => {
  const f = fixture(); f.window.RoomTickets.mount(); await f.settle(response());
  f.form.elements.period.value='custom';
  f.form.elements.from.value='2026-09-01'; f.form.elements.to.value='2026-09-20';
  f.form.elements.q.value='mouse & teclado';
  f.form.submit({preventDefault(){}});
  assert.match(f.calls[1].url,/period=custom/);
  assert.match(f.calls[1].url,/from=2026-09-01/);
  assert.match(f.calls[1].url,/q=mouse\+%26\+teclado/);
});
test('erro de sessão não vira ranking zerado', async () => {
  const f = fixture(); f.window.RoomTickets.mount();
  f.pending.shift().reject(Object.assign(new Error('HTTP 401'),{status:401}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.root.innerHTML,/sessão expirou/);
  assert.doesNotMatch(f.root.innerHTML,/rt-cards/);
});
test('resposta atrasada depois do logout é descartada; timer é removido', async () => {
  const f = fixture(); f.window.RoomTickets.mount();
  f.auto.change({target:{checked:true}});
  assert.equal(f.timers.size,1);
  f.window.RoomTickets.reset(); f.window.STATE.tab='home'; f.root.innerHTML='LOGIN';
  await f.settle(response());
  assert.equal(f.root.innerHTML,'LOGIN'); assert.equal(f.timers.size,0);
});
test('resposta ao sair da página não substitui outra tela', async () => {
  const f = fixture(); f.window.RoomTickets.mount();
  f.window.STATE.tab='home'; f.window.RoomTickets.unmount(); f.root.innerHTML='HOME';
  await f.settle(response());
  assert.equal(f.root.innerHTML,'HOME');
});
