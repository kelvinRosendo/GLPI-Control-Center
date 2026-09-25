// Real Chromium smoke test; only an isolated page and the new module/styles are served.
const http = require('node:http');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const js = fs.readFileSync(__dirname + '/javascript/room-tickets.js');
const css = fs.readFileSync(__dirname + '/css/room-tickets.css');
const html = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<link rel=\"stylesheet\" href=\"/room.css\"><style>*{box-sizing:border-box}body{margin:0;background:#0f1420;color:#e5e7eb;font-family:Arial,sans-serif}main{padding:16px}</style></head>\n<body><main id=\"main-content\"></main><script>\nwindow.STATE = {tab:'chamados-salas'};\nwindow.CONFIG = {glpiUrl:'https://glpi.example.test'};\nwindow.calls = [];\nwindow.ApiClient = {get: async (url) => {\n  calls.push(url);\n  const query = new URL(url, location.href).searchParams;\n  return {data:{\n    filters:{from:query.get('from')||'2026-08-26',to:query.get('to')||'2026-09-24'},\n    pagination:{page:Number(query.get('page')||1),pages:2,total:26},\n    summary:{total:26,open:4,withoutRoom:1,withoutAsset:3,review:1,\n      topRooms:[{label:'Sala 10',count:12}],topTypes:[{label:'Projetor',count:14}]},\n    rankings:{rooms:[{key:'0:sala 10',label:'Sala 10',count:12}],\n      types:[{key:'projector',label:'Projetor',count:14}],\n      assets:[{key:'Computer:7',label:'Projetor-07',tag:'0007',count:9}]},\n    options:{rooms:[{key:'0:sala 10',label:'Sala 10'}]},\n    meta:{complete:true,collectedAt:'2026-09-24T14:00:00-03:00',warnings:[]},\n    items:[{id:9,title:'<img src=x onerror=alert(1)>',description:'Teste de descrição',\n      room:'Sala 10',types:['projector'],openedAt:'2026-09-10 10:00:00',\n      status:'aberto',assets:[],reference:'L-0009',roomSource:'local_glpi',typeSource:'categoria_glpi'}]\n  }};\n}};\n</script><script src=\"/room.js\"></script><script>\n(async () => {\n  const pause = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };\n  let checks = 0;\n  function check(ok, message) { if (!ok) throw new Error(message); checks++; }\n  try {\n    RoomTickets.mount(); await pause();\n    check(document.querySelectorAll('.rt-card').length === 4, 'four summary cards');\n    check(document.querySelectorAll('.rt-charts .rt-panel').length === 3, 'three rankings');\n    check(document.querySelectorAll('.rt-table-wrap tbody tr').length === 1, 'ticket row');\n    check(!document.querySelector('.rt-table-wrap img'), 'ticket HTML escaped');\n    check(document.documentElement.scrollWidth <= innerWidth + 1, 'no page horizontal overflow');\n    document.querySelector('[data-rt-dimension=\"type\"]').click(); await pause();\n    check(calls.at(-1).includes('type=projector'), 'ranking click applies filter');\n    const form = document.querySelector('#rt-filters');\n    form.elements.period.value = 'custom';\n    form.elements.period.dispatchEvent(new Event('change'));\n    check(!form.elements.from.disabled && form.elements.from.required, 'custom dates enabled');\n    form.elements.from.value='2026-09-01'; form.elements.to.value='2026-09-20';\n    form.requestSubmit(); await pause();\n    check(calls.at(-1).includes('from=2026-09-01'), 'date form submission');\n    document.querySelector('[data-rt-ticket]').click();\n    check(document.querySelector('dialog').open, 'native dialog opens');\n    check(document.querySelector('dialog a').href === 'https://glpi.example.test/front/ticket.form.php?id=9', 'GLPI link');\n    document.querySelector('[data-rt-action=\"close-detail\"]').click();\n    check(!document.querySelector('dialog').open, 'dialog closes');\n    document.querySelector('[data-rt-action=\"next\"]').click(); await pause();\n    check(calls.at(-1).includes('page=2'), 'next page');\n    document.querySelector('[data-rt-action=\"clear\"]').click(); await pause();\n    check(!calls.at(-1).includes('type='), 'clear filters');\n    document.body.dataset.result='passed';\n    document.body.dataset.checks=String(checks);\n    document.body.dataset.viewport=String(innerWidth);\n  } catch(error) {\n    document.body.dataset.result='failed';\n    document.body.dataset.error=error.message;\n  }\n})();\n</script></body></html>";
const server = http.createServer((req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  if (path === '/room.js') {res.setHeader('Content-Type','text/javascript');res.end(js);}
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
