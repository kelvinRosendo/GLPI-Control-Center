const http = require('node:http');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execute = promisify(execFile);
const js = fs.readFileSync(__dirname + '/javascript/room-tickets-tv.js');
const css = fs.readFileSync(__dirname + '/css/room-tickets-tv.css');
const data = {
  filters: { from: '2026-08-27', to: '2026-09-25' },
  pagination: { page: 1, pages: 1, total: 1 },
  summary: { total: 1, open: 1, topRooms: [{ label: 'Sala 16', count: 1 }], topTypes: [{ label: 'Projetor', count: 1 }] },
  latest: { id: 78, reference: 'L-0009', room: 'Sala 16', title: 'Projetor da sala 16 não liga',
    description: 'Não consigo ligar o projetor aqui na sala 16.', types: ['projector'],
    openedAt: '2026-09-25 15:27:00', status: 'aberto', acknowledgement: null },
  items: [], meta: { collectedAt: '2026-09-25T15:27:00-03:00' },
};

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/tv.css"><style>body{margin:0;background:#090d17}</style></head><body><script>
window.DATA={computadores:Array(71),chromebooksGeekiees:Array(447),chromebooksExibicao:[],chromebooksApoio:{},projetores:Array(32),impressoras:Array(8)};
window.Dashboard={getIndicators:()=>({total_ativos:558,computadores:71,chromebooks_total:447,projetores:32,impressoras:8})};
window.seed=${JSON.stringify(data)}; window.posts=[];
window.ApiClient={get:async()=>({data:window.seed}),post:async(url)=>{posts.push(url);const acknowledgement={ticketId:78,acceptedAt:'2026-09-25T15:28:00-03:00',acceptedBy:{name:'Kelvin'}};return {data:{acknowledgement}}}};
</script><script src="/tv.js"></script><script>
(async()=>{let checks=0;const check=(ok,msg)=>{if(!ok)throw new Error(msg);checks++};const pause=()=>new Promise(r=>setTimeout(r,30));
try{RoomTicketsTV.open(seed);await pause();
check(document.querySelector('.rt-tv'),'opens overlay');check(document.body.classList.contains('rt-tv-open'),'locks page');
check(document.querySelector('.rt-tv-alert'),'shows unacknowledged alert');check(document.body.textContent.includes('558'),'shows live asset total');
document.querySelector('[data-tv-panel="calls"]').click();check(document.body.textContent.includes('Sala 16'),'renders latest room');
document.querySelector('[data-tv-action="accept"]').click();await pause();check(posts.length===1,'posts shared acknowledgement');check(document.body.textContent.includes('Alerta aceito'),'updates accepted state');
check(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal overflow');RoomTicketsTV.close();check(!document.querySelector('.rt-tv'),'closes overlay');
document.body.dataset.result='passed';document.body.dataset.checks=String(checks);document.body.dataset.viewport=String(innerWidth);
}catch(error){document.body.dataset.result='failed';document.body.dataset.error=error.message}})();
</script></body></html>`;

const server = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/tv.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); }
  else if (path === '/tv.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
  else if (path === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
  else { response.writeHead(404); response.end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const size of ['1920,1080', '500,900']) {
      const { stdout } = await execute(process.env.CHROME_BIN || 'google-chrome', [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
        '--disable-background-networking', '--disable-extensions', '--window-size=' + size,
        '--virtual-time-budget=3000', '--dump-dom', 'http://127.0.0.1:' + server.address().port + '/',
      ], { timeout: 30000, maxBuffer: 2000000 });
      if (!stdout.includes('data-result="passed"')) {
        throw new Error('Browser ' + size + ': ' + (stdout.match(/data-error="([^"]*)"/)?.[1] || 'test did not finish'));
      }
      console.log('OK TV ' + size + ': ' + stdout.match(/data-checks="(\d+)"/)?.[1] + ' checks');
    }
  } finally {
    server.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
