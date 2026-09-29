// Real Chromium smoke test; only an isolated page and the new module/styles are served.
const http = require('node:http');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const monitorJs = fs.readFileSync(__dirname + '/javascript/room-tickets-monitor.js');
const js = fs.readFileSync(__dirname + '/javascript/room-tickets.js');
const css = fs.readFileSync(__dirname + '/css/room-tickets.css');
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/room.css"><style>*{box-sizing:border-box}body{margin:0;background:#0f1420;color:#e5e7eb;font-family:Arial,sans-serif}main{padding:16px}</style></head>
<body><main id="main-content"></main><script>
window.STATE = {tab:'chamados-salas'};
window.CONFIG = {glpiUrl:'https://glpi.example.test'};
window.calls = [];
window.posts = [];
const spNow = secondsAgo => new Date(Date.now() - secondsAgo * 1000 - 3 * 3600 * 1000).toISOString().slice(0,19).replace('T',' ');
const isoNow = () => new Date().toISOString();
const fresh = {id:9,room:'Sala 10',types:['projector'],openedAt:spNow(20),eligible:true,
  acknowledgement:null,title:'<img src=x onerror=alert(1)>',description:'Teste de descrição',
  status:'aberto',reference:'L-0009',roomSource:'local_glpi',typeSource:'categoria_glpi',assets:[]};
window.ApiClient = {
  get: async (url) => {
    calls.push(url);
    if (url.includes('/aceites')) return { data: { acknowledgements: {} } };
    const query = new URL(url, location.href).searchParams;
    const filters = {};
    for (const key of ['period','from','to','room','type','status','asset','q']) filters[key] = query.get(key) || '';
    if (filters.period === '30d' && !filters.from) { filters.from = '2026-08-26'; filters.to = '2026-09-24'; }
    filters.page = Number(query.get('page') || 1);
    filters.per_page = 25;
    return { data: {
      filters,
      pagination: { page: filters.page, pages: 2, total: 26 },
      summary: { total: 26, open: 4, withoutRoom: 1, withoutAsset: 3, review: 1,
        topRooms: [{ label: 'Sala 10', count: 12 }], topTypes: [{ label: 'Projetor', count: 14 }] },
      rankings: { rooms: [{ key: '0:sala 10', label: 'Sala 10', count: 12 }],
        types: [{ key: 'projector', label: 'Projetor', count: 14 }],
        assets: [{ key: 'Computer:7', label: 'Projetor-07', tag: '0007', count: 9 }] },
      options: { rooms: [{ key: '0:sala 10', label: 'Sala 10' }] },
      meta: { complete: true, collectedAt: isoNow(), warnings: [] },
      items: [fresh],
      monitor: { recent: [fresh], recentLimit: 30, collectedAt: isoNow() },
    } };
  },
  post: async (url) => { posts.push(url); return { data: { acknowledgement: { by: 'Browser', at: isoNow() } } }; },
};
</script><script src="/monitor.js"></script><script src="/room.js"></script><script>
(async () => {
  const pause = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  let checks = 0;
  function check(ok, message) { if (!ok) throw new Error(message); checks++; }
  try {
    RoomTickets.mount(); await pause();
    check(document.querySelector('.rt-live-ticket'), 'latest ticket operational card');
    check(document.querySelector('#rt-auto').checked, 'one-minute refresh enabled by default');
    check(document.querySelector('#rt-monitor').checked, 'alert monitoring enabled by default');
    check(document.querySelectorAll('.rt-card').length === 7, 'summary and operational cards');
    check(document.querySelectorAll('.rt-charts .rt-panel').length === 3, 'three rankings');
    check(document.querySelectorAll('.rt-table-wrap tbody tr').length === 1, 'ticket row');
    check(!document.querySelector('.rt-table-wrap img'), 'ticket HTML escaped');
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'no page horizontal overflow');
    const status = document.querySelector('.rt-toolbar-status');
    check(status && status.textContent.includes('Atualizado'), 'connection status shown in toolbar');
    const widget = document.querySelector('.rt-monitor-widget');
    check(widget && !widget.hidden, 'shared monitor widget visible');
    const banner = document.querySelector('.rt-monitor-alert');
    check(banner, 'fresh ticket raises the shared alert on any page');
    check(banner.textContent.includes('NOVO CHAMADO'), 'alert labels the new ticket');
    document.querySelector('[data-rt-dimension="type"]').click(); await pause();
    check(calls.at(-1).includes('type=projector'), 'ranking click applies filter');
    const form = document.querySelector('#rt-filters');
    form.elements.period.value = 'custom';
    form.elements.period.dispatchEvent(new Event('change'));
    check(!form.elements.from.disabled && form.elements.from.required, 'custom dates enabled');
    form.elements.from.value='2026-09-01'; form.elements.to.value='2026-09-20';
    form.requestSubmit(); await pause();
    check(calls.at(-1).includes('from=2026-09-01'), 'date form submission');
    document.querySelector('[data-rt-ticket]').click();
    check(document.querySelector('dialog').open, 'native dialog opens');
    check(document.querySelector('dialog a').href === 'https://glpi.example.test/front/ticket.form.php?id=9', 'GLPI link');
    document.querySelector('[data-rt-action="close-detail"]').click();
    check(!document.querySelector('dialog').open, 'dialog closes');
    document.querySelector('[data-rt-action="next"]').click(); await pause();
    check(calls.at(-1).includes('page=2'), 'next page');
    document.querySelector('[data-rt-action="clear"]').click(); await pause();
    check(!calls.at(-1).includes('type='), 'clear filters');
    check(calls.some(url => url.includes('/aceites?ids=')), 'acknowledgement sync polls the shared store');
    banner.querySelector('[data-monitor-action="accept"]').click(); await pause();
    check(posts.length === 1 && posts[0].includes('/aceite'), 'accept posts the shared acknowledgement');
    check(!document.querySelector('.rt-monitor-alert'), 'alert disappears after acceptance');
    check(document.body.textContent.includes('Alerta aceito'), 'report shows accepted state');
    document.body.dataset.result='passed';
    document.body.dataset.checks=String(checks);
    document.body.dataset.viewport=String(innerWidth);
  } catch(error) {
    document.body.dataset.result='failed';
    document.body.dataset.error=error.message;
  }
})();
</script></body></html>`;

const server = http.createServer((req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  if (path === '/monitor.js') {res.setHeader('Content-Type','text/javascript');res.end(monitorJs);}
  else if (path === '/room.js') {res.setHeader('Content-Type','text/javascript');res.end(js);}
  else if (path === '/room.css') {res.setHeader('Content-Type','text/css');res.end(css);}
  else if (path === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else {res.writeHead(404);res.end();}
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for (const size of ['1440,1000','500,900']) {
      const {stdout} = await execute(process.env.CHROME_BIN || 'google-chrome', [
        '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--disable-background-networking','--disable-extensions',
        '--window-size='+size,'--virtual-time-budget=5000','--dump-dom',
        'http://127.0.0.1:'+server.address().port+'/',
      ], {timeout:30000,maxBuffer:2000000});
      if (!stdout.includes('data-result="passed"')) {
        throw new Error('Browser '+size+': '+(stdout.match(/data-error="([^"]*)"/)?.[1] || 'test did not finish'));
      }
      console.log('OK Chromium '+size+': '+stdout.match(/data-checks="(\d+)"/)?.[1]+' checks; viewport '+stdout.match(/data-viewport="(\d+)"/)?.[1]);
    }
  } finally { server.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
