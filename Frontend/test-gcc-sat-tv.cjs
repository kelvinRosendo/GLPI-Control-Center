const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(search = '?tv=sat') {
  let authenticated = true, shown = 0, options, returned;
  const timers = new Map();
  const button = { addEventListener(_, fn) { this.click = fn; } };
  const text = { textContent: '' };
  const notice = { remove() {}, querySelector: selector => selector === 'button' ? button : text };
  const window = {
    location: { search, replace: url => { returned = url; } },
    UserContext: { isAuthenticated: () => authenticated },
    RoomTicketsTV: { open(_, value) { options = value; }, showNotifications() { shown++; } },
  };
  let next = 0;
  vm.runInNewContext(fs.readFileSync(__dirname + '/javascript/gcc-sat-tv.js', 'utf8'), {
    window, URLSearchParams, URL,
    document: { createElement: () => notice, querySelector: () => ({ appendChild() {} }) },
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { app: window.GccSatTV, button, timers,
    authenticate: value => { authenticated = value; },
    options: () => options, shown: () => shown, returned: () => returned };
}

test('ordinary GCC entry does not change navigation or open TV', () => {
  const s = setup('');
  s.app.onLoginRequired(); s.app.onAuthenticated(); s.app.onReady();
  assert.equal(s.timers.size, 0); assert.equal(s.options(), undefined);
});
test('expired login returns to fixed SAT URL, ignoring redirect parameters', () => {
  const s = setup('?tv=sat&return_to=https://example.test');
  s.authenticate(false); s.app.onLoginRequired(); s.app.onReady();
  assert.equal(s.options(), undefined);
  const timer = [...s.timers.values()][0];
  assert.equal(timer.ms, 20000); timer.fn();
  assert.equal(s.returned(), 'https://aliceapp.ia.br/dashboard/view');
});
test('manual setup allows time to login, then opens existing notification setup', () => {
  const s = setup(); s.app.onLoginRequired(); s.button.click();
  assert.equal(s.timers.size, 0);
  s.app.onAuthenticated(); s.app.onReady();
  assert.equal(s.timers.size, 0); assert.equal(s.shown(), 1);
  assert.equal(s.options().fullscreen, false);
  s.app.onLoginRequired();
  assert.equal([...s.timers.values()][0].ms, 20000);
  s.options().onCycleComplete();
  assert.equal(s.returned(), 'https://aliceapp.ia.br/dashboard/view');
});
test('slow startup returns to SAT without breaking the cycle', () => {
  const s = setup(); s.app.onAuthenticated();
  const timer = [...s.timers.values()][0];
  assert.equal(timer.ms, 30000); timer.fn();
  assert.equal(s.returned(), 'https://aliceapp.ia.br/dashboard/view');
});

test('SAT entry opens TV automatically and returns to the supplied dashboard after its cycle', () => {
  for (const destination of ['http://localhost:3000/dashboard/view', 'https://aliceapp.ia.br/dashboard/view']) {
    const s = setup('?tv=sat&voltar=' + encodeURIComponent(destination));
    s.app.onAuthenticated(); s.app.onReady();
    assert.equal(s.timers.size, 0);
    assert.equal(s.options().fullscreen, false);
    s.options().onCycleComplete();
    assert.equal(s.returned(), destination);
  }
});

test('login and slow startup fallbacks preserve the supplied return address', () => {
  const destination = 'http://localhost:3000/dashboard/view?filter=a&other=b';
  for (const hook of ['onLoginRequired', 'onAuthenticated']) {
    const s = setup('?tv=sat&voltar=' + encodeURIComponent(destination));
    s.app[hook]();
    [...s.timers.values()][0].fn();
    assert.equal(s.returned(), destination);
  }
});

test('invalid or executable return addresses use the default SAT dashboard', () => {
  for (const destination of ['', '/dashboard/view', 'javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test/']) {
    const s = setup('?tv=sat&voltar=' + encodeURIComponent(destination));
    s.app.onAuthenticated();
    [...s.timers.values()][0].fn();
    assert.equal(s.returned(), 'https://aliceapp.ia.br/dashboard/view');
  }
});
