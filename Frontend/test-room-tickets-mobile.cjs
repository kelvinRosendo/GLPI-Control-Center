/**
 * Verificação mobile dos chamados das salas, em Chromium real.
 *
 * Serve a MESMA pilha de CSS de produção que o index.html carrega, na mesma
 * ordem, e os MÓDULOS REAIS de JavaScript. O servidor de teste responde com
 * status HTTP verdadeiros; nenhum chamado real é alterado.
 *
 * LARGURAS REAIS. O Chrome desta plataforma recusa janelas com menos de 500 px
 * de largura (medido), então uma janela de 390 px mediria 500 e a validação
 * seria falsa. Por isso a página é carregada dentro de um `<iframe>` com a
 * largura pedida: dentro dele `innerWidth`, `clientWidth`, `matchMedia` e as
 * media queries CSS usam a viewport real de 360, 390, 430 ou 768 px.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
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

// Todos os CSS do index.html, na MESMA ordem. Fontes externas são omitidas.
const CSS_ORDER = [
  'design-system.css', 'icons.css', 'search.css', 'workflow.css', 'portal-viewer.css',
  'dashboard.css', 'reports.css', 'projectors.css', 'audit.css', 'notifications.css',
  'keyboard_shortcuts.css', 'settings.css', 'loading.css', 'error.css', 'responsive.css',
  'mano-isa.css', 'sidebar.css', 'session-warning.css', 'access-denied.css',
  'agent-panel.css', 'styles.css', 'inventory.css', 'room-tickets.css', 'room-tickets-tv.css',
];

// Módulos reais, na ordem de dependência do index.html.
const JS_ORDER = [
  'icons.js', 'state.js', 'sidebar.js', 'api-client.js',
  'room-tickets-monitor.js', 'room-tickets-kanban.js', 'room-tickets-list.js',
  'room-tickets-tv.js', 'room-tickets.js', 'gcc-phone.js', 'app.js',
];

// Estrutura do app igual à do index.html, para que sidebar, topbar e conteúdo
// sejam medidos com o mesmo CSS de produção.
const pageHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>mobile chamados</title>
${CSS_ORDER.map(css => `<link rel="stylesheet" href="/css/${css}">`).join('\n')}
</head><body>
<div id="login-screen" style="display:flex">
  <div class="login-card"><h2 class="login-title">GLPI Control Center</h2>
  <p class="login-subtitle">Central Operacional de Tecnologia</p></div>
</div>
<div id="app" class="app-layout app--sidebar-expanded" style="display:none">
  <aside id="sidebar" class="sidebar" role="complementary"></aside>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <div class="app-main">
    <div class="topbar">
      <button class="topbar-menu-btn" id="sidebar-mobile-toggle" aria-label="Abrir menu">
        <span class="gcc-icon gcc-icon--lg"><img src="/css/icons/dashboard.svg" alt="" /></span>
      </button>
      <div class="topbar-left"><span id="glpi-status" class="glpi-status">
        <span class="glpi-status-dot"></span><span class="glpi-status-text">Conectado ao GLPI</span>
      </span></div>
      <div class="topbar-search" id="topbar-search">
        <span class="topbar-search-icon"><img src="/css/icons/search.svg" alt="" /></span>
        <input type="text" id="topbar-search-input" class="topbar-search-input" placeholder="Pesquisar" autocomplete="off" />
        <div class="topbar-search-dropdown" id="topbar-search-dropdown"></div>
      </div>
      <div class="topbar-right">
        <div class="notif-bell-wrapper">
          <button class="notif-bell-btn" id="notification-bell-btn" data-notif-action="toggle" title="Notificações">
            <span class="gcc-icon gcc-icon--md"><img src="/css/icons/notifications.svg" alt="" /></span>
          </button>
        </div>
        <div class="user-info"><span id="user-name" class="user-name"></span><span id="user-role" class="user-role"></span></div>
        <div class="avatar" id="user-avatar">U</div>
        <button class="logout-btn" id="logout-btn">
          <span class="gcc-icon gcc-icon--sm"><img src="/css/icons/logout.svg" alt="" /></span>
        </button>
      </div>
    </div>
    <div id="breadcrumb-container"></div>
    <div class="content" id="main-content"></div>
  </div>
</div>
<script>window.addEventListener('error', e => {
  document.body.dataset.result = 'failed';
  document.body.dataset.error = 'JS: ' + e.message;
});</script>
${JS_ORDER.map(js => `<script src="/js/${js}"></script>`).join('\n')}
<script src="/boot.js"></script>
</body></html>`;

/**
 * Página externa: cria um (ou mais) `iframe` com a largura pedida e carrega a
 * aplicação dentro dele. É o que dá uma viewport de verdade menor que 500 px.
 */
function frameHtml(widths, height, params) {
  const frames = widths.map(width =>
    '<figure class="frame" style="width:' + width + 'px">'
    + '<figcaption>' + width + ' &times; ' + height + '</figcaption>'
    + '<iframe src="/app?' + params + '" width="' + width + '" height="' + height + '"'
    + ' title="viewport ' + width + 'x' + height + '"></iframe></figure>').join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>mobile chamados</title><style>
html,body{margin:0;background:#05070c;font-family:Consolas,monospace}
body{padding:10px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
figure{margin:0}
figcaption{color:#8ab1ff;font-size:12px;padding:4px 0}
iframe{border:1px solid #2b3345;display:block;background:#0b0e16}
</style></head><body>${frames}</body></html>`;
}

const boot = fs.readFileSync(ROOT + '/test-room-tickets-mobile-boot.js', 'utf8');

function startServer() {
  return new Promise(resolve => {
    let onResult = null;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
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
      if (pathname === '/frame') {
        const widths = (url.searchParams.get('w') || '390').split(',').map(Number);
        const height = Number(url.searchParams.get('h') || 844);
        const rest = url.searchParams.get('p') || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(frameHtml(widths, height, rest));
        return;
      }
      if (pathname === '/app' || pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml);
        return;
      }
      if (pathname === '/boot.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(boot);
        return;
      }
      if (pathname === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(fs.readFileSync(path.join(ROOT, 'sw.js')));
        return;
      }
      if (pathname.startsWith('/assets/') && !pathname.includes('..')) {
        const file = path.join(ROOT, pathname);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { 'Content-Type': pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
          res.end(fs.readFileSync(file)); return;
        }
      }
      if (pathname.startsWith('/js/') || pathname.startsWith('/css/')) {
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
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('/* arquivo de teste não encontrado: ' + relative + ' */');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":false,"error":"Rota não roteada no teste."}');
    });
    server.listen(0, '127.0.0.1', () => resolve({
      server, port: server.address().port,
      waitResult: () => new Promise(done => { onResult = done; }),
    }));
  });
}

let runSeq = 0;
function runChrome(instance, scenario, width, height, extra = '') {
  return new Promise(resolve => {
    // Perfil novo a cada execução: `localStorage` não pode vazar a preferência
    // de som ou de monitoramento de um cenário para o seguinte.
    const userDir = path.join(process.env.TEMP || '.', `gcc-mobile-${process.pid}-${++runSeq}`);
    const inner = `cenario=${encodeURIComponent(scenario)}${extra}`;
    const host = `w=${width}&h=${height}&p=${encodeURIComponent(inner)}`;
    // A janela externa precisa caber no mínimo de 500 px do Chrome mais a moldura.
    const outerW = Math.max(560, width + 60);
    const child = spawn(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--disable-background-networking', '--disable-extensions',
      '--disable-sync', '--no-default-browser-check', '--hide-scrollbars',
      `--user-data-dir=${userDir}`,
      `--window-size=${outerW},${height + 70}`,
      `http://127.0.0.1:${instance.port}/frame?${host}`,
    ], { stdio: 'ignore' });
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* já encerrado */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout do cenário ' + scenario }), 90000);
    instance.waitResult().then(raw => {
      try { finish(JSON.parse(raw)); }
      catch { finish({ ok: false, error: 'resultado ilegível: ' + String(raw).slice(0, 200) }); }
    });
    child.on('error', e => finish({ ok: false, error: 'falha ao abrir o Chrome: ' + e.message }));
  });
}

// [cenário, largura, altura, consulta extra]
const SCENARIOS = [
  ['entrada-mobile', 360, 780],
  ['entrada-mobile', 390, 844],
  ['entrada-mobile', 430, 932],
  ['entrada-mobile', 768, 1024],
  ['entrada-mobile', 1280, 900],
  ['entrada-mobile', 390, 844, '&sem-permissao=1'],
  ['entrada-mobile', 390, 844, '&sem-sessao=1'],
  ['entrada-mobile', 390, 844, '&tab=relatorios'],
  ['entrada-mobile', 390, 844, '&rt_view=lista'],
  ['entrada-mobile', 390, 844, '&rt_group=andamento'],
  ['phone-flow', 360, 780],
  ['phone-flow', 390, 844],
  ['phone-flow', 430, 932],
  ['phone-flow', 768, 1024],
  ['phone-errors', 390, 844, '&error=403'],
  ['phone-errors', 390, 844, '&error=409'],
  ['phone-errors', 390, 844, '&error=502'],
  ['desktop-e-tv', 1280, 900],
];

if (require.main === module) (async () => {
  const instance = await startServer();
  let failures = 0;
  let total = 0;
  for (const [name, w, h, extra] of SCENARIOS) {
    if (process.env.GCC_TEST_SCENARIO && name !== process.env.GCC_TEST_SCENARIO) continue;
    const result = await runChrome(instance, name, w, h, extra);
    const label = name + (extra ? extra.replace(/&/, ' ') : '') + ' ' + w + 'x' + h;
    if (result.ok) {
      total += result.checks;
      const seen = Number(result.viewport) || 0;
      // A viewport medida precisa ser a pedida: é o que prova a largura real.
      const exact = Math.abs(seen - w) <= 1;
      if (!exact) failures += 1;
      console.log((exact ? 'OK    ' : 'AVISO ') + label + ': ' + result.checks + ' checks'
        + '; viewport medida ' + seen + (exact ? '' : ' (esperada ' + w + ')'));
    } else {
      failures += 1;
      console.log(`FALHA ${label}: ${result.error}`);
      if (result.debug) console.log('   dom: ' + String(result.debug).replace(/\s+/g, ' ').slice(0, 500));
    }
  }
  instance.server.close();
  console.log(failures ? `\n${failures} cenário(s) com falha.` : `\nTodos os cenários passaram. ${total} checks no total.`);
  process.exit(failures ? 1 : 0);
})();
module.exports = { startServer };
