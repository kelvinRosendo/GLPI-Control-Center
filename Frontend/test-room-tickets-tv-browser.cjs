const http = require('node:http');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execute = promisify(execFile);
const monitorJs = fs.readFileSync(__dirname + '/javascript/room-tickets-monitor.js');
const js = fs.readFileSync(__dirname + '/javascript/room-tickets-tv.js');
const css = fs.readFileSync(__dirname + '/css/room-tickets-tv.css');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/tv.css"><style>body{margin:0;background:#090d17}</style></head><body><script>
window.DATA={computadores:Array(71),chromebooksGeekiees:Array(447),chromebooksExibicao:[],chromebooksApoio:{},projetores:Array(32),impressoras:Array(8)};
window.Dashboard={getIndicators:()=>({total_ativos:558,computadores:71,chromebooks_total:447,projetores:32,impressoras:8})};
window.UserContext={isAuthenticated:()=>true};
window.posts=[];
const spNow = secondsAgo => new Date(Date.now() - secondsAgo * 1000 + 3 * 3600 * 1000).toISOString().slice(0,19).replace('T',' ');
const isoNow = () => new Date().toISOString();
const ticket = (id, secondsAgo) => ({id,reference:'L-00'+id,room:'Sala 16',title:'Projetor da sala 16 não liga',
  description:'Não consigo ligar o projetor aqui na sala 16.',types:['projector'],openedAt:spNow(secondsAgo),
  status:'aberto',acknowledgement:null,eligible:true,roomSource:'local_glpi',typeSource:'categoria_glpi',assets:[]});
const older = ticket(79, 40);
const latest = ticket(78, 15);
window.seed = {
  filters:{from:'2026-08-27',to:'2026-09-25'},pagination:{page:1,pages:1,total:2},
  summary:{total:2,open:2,topRooms:[{label:'Sala 16',count:2}],topTypes:[{label:'Projetor',count:2}]},
  latest,items:[latest,older],meta:{collectedAt:isoNow()},
  monitor:{recent:[older,latest],recentLimit:30,collectedAt:isoNow()},
};
window.ApiClient={
  get:async(url)=>{ if (url.includes('/aceites')) return {data:{acknowledgements:{}}}; return {data:window.seed}; },
  post:async(url)=>{posts.push(url);return {data:{acknowledgement:{ticketId:78,acceptedAt:isoNow(),acceptedBy:{name:'Kelvin'}}}};},
};
</script><script src="/monitor.js"></script><script src="/tv.js"></script><script>
(async()=>{let checks=0;const check=(ok,msg)=>{if(!ok)throw new Error(msg);checks++};const pause=()=>new Promise(r=>setTimeout(r,30));
try{RoomTicketsTV.open(seed);await pause();
check(document.querySelector('.rt-tv'),'opens overlay');check(document.body.classList.contains('rt-tv-open'),'locks page');
check(document.querySelector('.rt-tv-alert'),'shows unacknowledged alert');
check(document.querySelector('.rt-tv-alert').textContent.includes('#79'),'alert shows the oldest waiting ticket');
check(document.querySelector('.rt-tv-connection-state'),'connection state shown');
check(document.body.textContent.includes('558'),'shows live asset total');
check(document.body.textContent.includes('Status da infraestrutura'),'infrastructure status panel');
document.querySelector('[data-tv-panel="calls"]').click();check(document.body.textContent.includes('Sala 16'),'renders latest room');
check(document.querySelector('.rt-tv-queue-card'),'two waiting alerts render the queue');
document.querySelector('[data-tv-action="accept"][data-ticket-id="78"]').click();await pause();
check(posts.length===1 && posts[0].includes('/aceite'),'posts shared acknowledgement');
check(document.body.textContent.includes('Alerta aceito'),'updates accepted state');
check(!document.querySelector('.rt-tv-queue-card'),'queue shrinks after acceptance');
check(document.querySelector('.rt-tv-connection-state.is-ok'),'healthy connection after load');
check(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal overflow');
RoomTicketsTV.close();check(!document.querySelector('.rt-tv'),'closes overlay');
check(document.querySelector('.rt-monitor-widget'),'monitor keeps running after TV closes');
document.body.dataset.result='passed';document.body.dataset.checks=String(checks);document.body.dataset.viewport=String(innerWidth);
}catch(error){document.body.dataset.result='failed';document.body.dataset.error=error.message}})();
</script></body></html>`;

const server = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/monitor.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(monitorJs); }
  else if (path === '/tv.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); }
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
