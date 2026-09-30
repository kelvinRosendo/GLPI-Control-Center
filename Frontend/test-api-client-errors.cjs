const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');

// Testa o ApiClient REAL contra respostas HTTP de verdade.
// Um mock que já entrega a mensagem pronta não provaria nada: o defeito
// antigo era justamente não ler o corpo da resposta de erro.

const clientSource = fs.readFileSync(__dirname + '/javascript/api-client.js', 'utf8');

/** Carrega o módulo real; temporizadores reais porque o retry os usa. */
function loadClient(fetchImpl, baseUrl) {
  const window = { CONFIG: { backendUrl: '' } };
  const sandbox = {
    window, console, URL, AbortSignal,
    setTimeout, clearTimeout,
    fetch: fetchImpl,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(clientSource, sandbox);
  window.ApiClient.init({ baseUrl: baseUrl || '', retryDelay: 1 });
  return window.ApiClient;
}

/** Sobe um servidor local que responde conforme o caminho pedido. */
function startServer(routes) {
  return new Promise(resolve => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      const route = routes[req.url.split('?')[0]] || { status: 404, body: { ok: false, error: 'Rota não encontrada.' } };
      if (route.delayMs) return setTimeout(() => send(res, route), route.delayMs);
      send(res, route);
    });
    function send(res, route) {
      if (route.raw !== undefined) {
        res.writeHead(route.status, { 'Content-Type': route.contentType || 'text/html' });
        res.end(route.raw);
        return;
      }
      res.writeHead(route.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(route.body));
    }
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, requests, close: () => server.close() });
    });
  });
}

async function withServer(routes, run) {
  const instance = await startServer(routes);
  const base = `http://127.0.0.1:${instance.port}`;
  const api = loadClient((url, config) => fetch(url, config), base);
  try {
    await run(api, base, instance);
  } finally {
    instance.close();
  }
}

test('409 traz a explicação do servidor e o responsável atual, não "HTTP 409"', async () => {
  await withServer({
    '/api/tickets/salas/78/assumir': {
      status: 409,
      body: { ok: false, error: 'Este chamado já está com Ana Ribeiro.',
        meta: { currentHandler: 'Ana Ribeiro', currentSource: 'glpi', currentStatus: 2,
          currentStatusLabel: 'Em atendimento',
          allowedActions: [{ action: 'concluir', label: 'Concluir', kind: 'solucao', target: 5 }] } },
    },
  }, async (api, base) => {
    const error = await api.post('/api/tickets/salas/78/assumir', { handler: 'Bia' },
      { retries: 0 }).then(() => null, e => e);
    assert.ok(error, 'a chamada de escrita falha');
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Este chamado já está com Ana Ribeiro.');
    assert.doesNotMatch(error.message, /HTTP 409/);
    assert.equal(error.meta.currentHandler, 'Ana Ribeiro');
    assert.equal(error.meta.currentStatusLabel, 'Em atendimento');
    assert.equal(JSON.stringify(error.meta.allowedActions),
      JSON.stringify([{ action: 'concluir', label: 'Concluir' }]));
  });
});

test('502 parcial distingue "não confirmado" de "parte aplicada"', async () => {
  await withServer({
    '/api/tickets/salas/78/mover': {
      status: 502,
      body: { ok: false, error: 'O status mudou no GLPI, mas a solução não ficou registrada.',
        meta: { status: 502, data: { partial: true, applied: { status: true, solution: false },
          steps: [{ step: 'status', ok: true, label: 'Status no GLPI' },
            { step: 'solucao', ok: false, label: 'Solução registrada no GLPI' }] } } },
    },
  }, async (api, base) => {
    const error = await api.post('/api/tickets/salas/78/mover', { action: 'concluir' },
      { retries: 0 }).then(() => null, e => e);
    assert.equal(error.status, 502);
    assert.match(error.message, /solução não ficou registrada/);
    assert.equal(error.meta.partial, true);
    assert.equal(JSON.stringify(error.meta.applied), JSON.stringify({ status: true, solution: false }));
    assert.equal(error.meta.steps.length, 2);
    assert.equal(error.meta.steps[1].ok, false);
  });
});

test('502 sem parcial é comunicado sem metadados de falha', async () => {
  await withServer({
    '/api/tickets/salas/79/mover': { status: 502, body: { ok: false, error: 'Nada foi alterado no GLPI.', meta: {} } },
  }, async (api) => {
    const error = await api.post('/api/tickets/salas/79/mover', {}, { retries: 0 }).then(() => null, e => e);
    assert.equal(error.status, 502);
    assert.equal(error.message, 'Nada foi alterado no GLPI.');
    assert.equal(error.meta.partial, undefined);
  });
});

test('403 e 422 têm explicações próprias e não vazam o payload', async () => {
  await withServer({
    '/api/tickets/salas/80/assumir': { status: 403, body: { ok: false, error: 'Acesso negado.', meta: { secret: 'nao-expor' } } },
    '/api/tickets/salas/81/mover': { status: 422, body: { ok: false, error: 'Descreva como o problema foi resolvido.', meta: { reason: 'solution_required' } } },
  }, async (api) => {
    const forbidden = await api.post('/api/tickets/salas/80/assumir', {}, { retries: 0 }).then(() => null, e => e);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.message, 'Acesso negado.');
    assert.equal(forbidden.meta.reason, undefined, 'campo desconhecido não é repassado');
    assert.equal(forbidden.meta.secret, undefined, 'campo desconhecido não vaza para a interface');

    const invalid = await api.post('/api/tickets/salas/81/mover', {}, { retries: 0 }).then(() => null, e => e);
    assert.equal(invalid.status, 422);
    assert.match(invalid.message, /Descreva como o problema foi resolvido/);
    assert.equal(invalid.meta.reason, 'solution_required');
  });
});

test('HTML, corpo vazio e JSON inválido viram mensagem compreensível', async () => {
  await withServer({
    '/html': { status: 500, raw: '<!doctype html><html><body>Stack trace em /var/www</body></html>' },
    '/vazio': { status: 502, raw: '' },
    '/invalido': { status: 503, raw: '{nao é json' },
  }, async (api) => {
    const html = await api.get('/html', { retries: 0 }).then(() => null, e => e);
    assert.equal(html.status, 500);
    assert.doesNotMatch(html.message, /Stack trace|doctype|<html>/, 'HTML bruto não é exibido');

    const empty = await api.get('/vazio', { retries: 0 }).then(() => null, e => e);
    assert.equal(empty.status, 502);
    assert.equal(empty.message, 'O servidor não conseguiu falar com o GLPI agora.');

    const invalid = await api.get('/invalido', { retries: 0 }).then(() => null, e => e);
    assert.equal(invalid.status, 503);
    assert.equal(invalid.message, 'Serviço temporariamente indisponível.');
  });
});

test('o corpo JSON aninhado nunca vira mensagem', async () => {
  await withServer({
    '/aninhado': { status: 500, body: { ok: false, error: { trace: 'segredo' } } },
  }, async (api) => {
    const error = await api.get('/aninhado', { retries: 0 }).then(() => null, e => e);
    assert.equal(error.message, 'Erro interno no servidor.');
  });
});

test('sucesso continua sendo lido e devolvido sem alteração', async () => {
  await withServer({
    '/api/ok': { status: 200, body: { ok: true, data: { valor: 7 } } },
  }, async (api) => {
    const response = await api.get('/api/ok', { cache: false, retries: 0 });
    assert.equal(response.ok, true);
    assert.equal(response.data.valor, 7);
  });
});

test('5xx é repetido e 4xx não é repetido (repetir escrita duplica efeito)', async () => {
  let attempts = 0;
  const instance = await startServer({
    '/instavel': { status: 503, body: { ok: false, error: 'Serviço instável.' } },
    '/conflito': { status: 409, body: { ok: false, error: 'Conflito.' } },
  });
  const api = loadClient((url, config) => { attempts += 1; return fetch(url, config); },
    `http://127.0.0.1:${instance.port}`);
  try {
    const before = attempts;
    await api.get('/instavel', { retries: 2 }).then(() => null, () => null);
    assert.ok(attempts - before > 1, '5xx é tentado mais de uma vez');
    const beforeConflict = attempts;
    await api.get('/conflito', { retries: 2 }).then(() => null, () => null);
    assert.equal(attempts - beforeConflict, 1, '4xx não é repetido');
  } finally {
    instance.close();
  }
});

test('queda de rede vira mensagem de conexão, não de status HTTP', async () => {
  const api = loadClient(async () => { throw new TypeError('Failed to fetch'); });
  const error = await api.get('/qualquer', { retries: 0 }).then(() => null, e => e);
  assert.equal(error.status, 0);
  assert.equal(error.isNetworkError, true);
  assert.match(error.message, /Sem conexão/);
  assert.doesNotMatch(error.message, /Failed to fetch/);
});

test('timeout vira erro identificável e não é repetido', async () => {
  let attempts = 0;
  const api = loadClient(async () => {
    attempts += 1;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  const error = await api.get('/lento', { retries: 2 }).then(() => null, e => e);
  assert.equal(error.name, 'TimeoutError');
  assert.match(error.message, /demorou demais/);
  assert.equal(attempts, 1, 'timeout não é repetido');
});
