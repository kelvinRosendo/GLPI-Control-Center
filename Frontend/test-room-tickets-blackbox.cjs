/**
 * Caixa preta dos chamados das salas, com os módulos REAIS e TODOS os CSS que
 * o index.html carrega, na ordem de produção.
 *
 * Diferença em relação aos testes antigos: eles carregavam apenas
 * `room-tickets.css`, e por isso o formulário de atendimento aparecia
 * centralizado — o defeito só existe com a pilha completa de estilos, porque
 * `design-system.css` e `styles.css` zeram a margem de todos os elementos.
 *
 * Servidor local com respostas HTTP controladas (409 e 502 reais). Nenhuma
 * chamada ao GLPI, nenhum chamado real.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
// CHROME_BIN tem precedência. Depois, tenta o PATH (CI Linux: `google-chrome`
// e `chromium`, que NÃO existem no Windows) e por fim os caminhos fixos.
const CHROME = process.env.CHROME_BIN
  || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .map(name => {
      const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
      for (const dir of dirs) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return candidate;
      }
      return '';
    })
    .find(Boolean)
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    .find(p => fs.existsSync(p));
if (!CHROME) {
  console.error('Chrome/Chromium não encontrado. Defina CHROME_BIN.');
  process.exit(1);
}

// Todos os CSS do index.html, na MESMA ordem. Fonts externas são omitidas.
const CSS_ORDER = [
  'design-system.css', 'icons.css', 'search.css', 'workflow.css', 'portal-viewer.css',
  'dashboard.css', 'reports.css', 'projectors.css', 'audit.css', 'notifications.css',
  'keyboard_shortcuts.css', 'settings.css', 'loading.css', 'error.css', 'responsive.css',
  'mano-isa.css', 'sidebar.css', 'session-warning.css', 'access-denied.css',
  'agent-panel.css', 'styles.css', 'inventory.css', 'room-tickets.css', 'room-tickets-tv.css',
];

const pageHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>caixa preta</title>
${CSS_ORDER.map(css => `<link rel="stylesheet" href="/css/${css}">`).join('\n')}
</head><body>
<main id="main-content"></main>
<script>window.addEventListener('error', e => {
  document.body.dataset.result = JSON.stringify({ ok: false, error: 'JS: ' + e.message
    + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0) });
});</script>
<script src="/boot.js"></script>
</body></html>`;

/** Roteiro de respostas HTTP controladas do servidor de teste. */
const boot = fs.readFileSync(ROOT + '/test-room-tickets-blackbox-boot.js', 'utf8');

function startServer() {
  return new Promise(resolve => {
    const received = [];
    let onResult = null;
    const server = http.createServer((req, res) => {
      const pathname = req.url.split('?')[0];
      received.push({ method: req.method, url: req.url });
      // A página reporta o resultado por POST: mais confiável que o console
      // do Chrome headless, e permite rodar com relógios reais.
      if (pathname === '/resultado' && req.method === 'POST') {
        const parts = [];
        req.on('data', chunk => parts.push(chunk));
        req.on('end', () => {
          res.writeHead(204);
          res.end();
          if (onResult) onResult(Buffer.concat(parts).toString('utf8'));
        });
        return;
      }
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml);
        return;
      }
      if (pathname === '/boot.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(boot);
        return;
      }
      if (pathname.startsWith('/js/') || pathname.startsWith('/css/')) {
        // /js/x.js -> Frontend/javascript/x.js ; /css/x.css -> Frontend/css/x.css
        const relative = pathname.startsWith('/js/')
          ? path.join('javascript', pathname.slice('/js/'.length))
          : path.join('css', pathname.slice('/css/'.length));
        const file = path.join(ROOT, relative);
        if (fs.existsSync(file)) {
          const type = pathname.endsWith('.css') ? 'text/css' : 'text/javascript';
          res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
          res.end(fs.readFileSync(file));
          return;
        }
        // Um arquivo faltando é um erro do teste, não uma resposta de API.
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('/* arquivo de teste não encontrado: ' + relative + ' */');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":false,"error":"Rota não roteada no teste."}');
    });
    server.listen(0, '127.0.0.1', () => resolve({
      server, port: server.address().port, received,
      waitResult: () => new Promise(done => { onResult = done; }),
    }));
  });
}

function runChrome(instance, scenario, width, height) {
  // Sem --virtual-time-budget: os relógios são reais, como no navegador do dia
  // a dia. A página_avisa o servidor quando terminou.
  return new Promise(resolve => {
    const userDir = path.join(process.env.TEMP || '.', `gcc-blackbox-${process.pid}-${scenario}`);
    const child = spawn(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--disable-background-networking', '--disable-extensions',
      '--disable-sync', '--no-default-browser-check',
      `--user-data-dir=${userDir}`,
      `--window-size=${width},${height}`,
      `http://127.0.0.1:${instance.port}/?cenario=${encodeURIComponent(scenario)}`,
    ], { stdio: 'ignore' });
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* já encerrado */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout do cenário ' + scenario }), 60000);
    instance.waitResult().then(raw => {
      try { finish(JSON.parse(raw)); }
      catch { finish({ ok: false, error: 'resultado ilegível: ' + String(raw).slice(0, 200) }); }
    });
    child.on('error', e => finish({ ok: false, error: 'falha ao abrir o Chrome: ' + e.message }));
  });
}

(async () => {
  const instance = await startServer();
  const scenarios = [
    ['dialogo-centralizado', 1600, 1000],
    ['dialogo-centralizado-estreito', 500, 900],
    ['tv-sem-acoes', 1920, 1080],
    ['arraste-e-acoes', 1600, 1000],
    ['erros-409-502', 1600, 1000],
    ['interface-preservada', 1600, 1000],
    ['duas-conclusoes', 1600, 1000],
  ];
  let failures = 0;
  for (const [name, w, h] of scenarios) {
    const result = await runChrome(instance, name, w, h);
    if (result.ok) console.log(`OK ${name} ${w}x${h}: ${result.checks} checks`);
    else { failures += 1; console.log(`FALHA ${name} ${w}x${h}: ${result.error}`); }
  }
  instance.server.close();
  process.exit(failures ? 1 : 0);
})();
