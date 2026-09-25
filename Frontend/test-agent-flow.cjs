const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// DOM mínimo: executa as funções reais do painel, sem navegador/rede.
class Element {
  constructor() { this.children = []; this.dataset = {}; this.style = {}; this.listeners = {}; this.buttons = {}; this.classList = { add() {}, remove() {} }; this.html = ''; }
  set textContent(value) { this.html = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
  get innerHTML() { return this.html; }
  set innerHTML(value) { this.html = value; }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  querySelector(selector) { return this.buttons[selector] ||= new Element(); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
}
const elements = Object.fromEntries(['agent-input', 'agent-send', 'agent-messages'].map(id => [id, new Element()]));
const document = {
  getElementById: id => elements[id] || elements['agent-messages'].children.find(e => e.id === id),
  createElement: () => new Element(),
  querySelector: selector => {
    const match = selector.match(/data-(proposal|operation)-id="([^"]+)"/);
    return match ? elements['agent-messages'].children.find(e => e.dataset[`${match[1]}Id`] === match[2]) : null;
  },
};
const proposal = { proposal_id: 'prop_abc', action: 'update', itemtype: 'Computer', id: 14, asset_name: 'Chrome-014', current_values: { otherserial: '00001' }, proposed_values: { otherserial: '00123' }, content_hash: 'a'.repeat(64) };
const asset = { itemtype: 'Computer', id: 14, name: 'Chrome-014', otherserial: '00123' };
let renders = 0, writes = 0, confirmations = 0;
const window = {
  DATA: { classifiedAssets: [{ ...asset, otherserial: '00001' }] },
  STATE: { computerDetailsById: { 'Computer:14': { old: true } } },
  App: { render() { renders++; } },
  GlpiClient: { _mapClassifiedToLegacy(items) { return { computadores: items }; } },
  ApiClient: {
    async post(url, body, options) {
      if (url.endsWith('/chat')) return { ok: true, response: 'Confira a prévia.', proposals: [proposal], evidence: [{ tool: 'preparar_alteracao', success: true }] };
      if (url.endsWith('/execute')) {
        writes++;
        assert.equal(body.confirmed_hash, proposal.content_hash);
        assert.equal(options.retries, 0);
        return { ok: true, success: true, operation_id: 'op1', status: 'verified_glpi', verification: { overall: 'verified_glpi', layers: {} } };
      }
      if (url.endsWith('/frontend-confirm')) {
        assert.equal(window.DATA.classifiedAssets[0].otherserial, '00123');
        assert.equal(window.DATA.computadores[0].otherserial, '00123');
        assert.equal(renders, 1, 'render deve preceder confirmação');
        assert.equal(body.api_version, 'snapshot-v1');
        confirmations++;
        return { ok: true };
      }
      if (url.endsWith('/verify')) return { data: { overall: 'verified', layers: { frontend: { state: 'confirmed' } } } };
      throw Error('Rota inesperada ' + url);
    },
    async get(url, options) {
      assert.equal(options.cache, false);
      return { data: { success: true, asset, api_version: 'snapshot-v1' } };
    },
  },
};
const context = vm.createContext({ window, document, console, Date, Map, Set });
let source = fs.readFileSync(__dirname + '/javascript/agent_panel.js', 'utf8');
// Apenas acesso às funções privadas para testes; o comportamento não é substituído.
source = source.replace('getPendingProposals: () =>', '_test: { send: _sendMessage, apply: _applyOperation }, getPendingProposals: () =>');
vm.runInContext(source, context);

(async () => {
  elements['agent-input'].value = 'Altere o patrimônio do Chrome-014 para 00123';
  await window.AgentPanel._test.send();
  assert.equal(writes, 0, 'mensagem não executa escrita');
  assert.equal(window.AgentPanel.getPendingProposals().length, 1);
  const card = document.querySelector('[data-proposal-id="prop_abc"]');
  assert.ok(card.innerHTML.includes('00001') && card.innerHTML.includes('00123'), 'cartão mostra antes/depois');
  await card.querySelector('.agent-proposal-confirm-btn').listeners.click();
  assert.equal(writes, 1);
  assert.equal(confirmations, 1);
  assert.equal(window.AgentPanel.getPendingProposals().length, 0);
  assert.equal(window.STATE.computerDetailsById['Computer:14'], undefined);
  assert.ok(document.querySelector('[data-operation-id="op1"]').innerHTML.includes('operação concluída e verificada'));
  console.log('PASS: mensagem → cartão → clique com hash → execução → dados aplicados → render → confirmação → comprovante');

  // Falha no carregamento da representação não deve confirmar tela nem repetir escrita.
  window.ApiClient.get = async () => { throw Error('cache indisponível'); };
  await window.AgentPanel._test.apply('op1');
  assert.equal(confirmations, 1);
  assert.equal(writes, 1);
  console.log('PASS: falha de atualização mantém tela pendente e não repete escrita');

  let attempts = 0;
  const apiWindow = {};
  vm.runInNewContext(fs.readFileSync(__dirname + '/javascript/api-client.js', 'utf8'), {
    window: apiWindow, AbortSignal, setTimeout, console,
    fetch: async () => { attempts++; return { ok: false, status: 503 }; },
  });
  await assert.rejects(apiWindow.ApiClient.post('/api/agent/execute', {}));
  assert.equal(attempts, 1);
  console.log('PASS: cliente não repete POST após erro HTTP');
})().catch(error => { console.error(error); process.exitCode = 1; });
