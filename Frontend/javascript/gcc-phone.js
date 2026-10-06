/* Installation and real Web Push. No permission prompt without a user's click. */
window.GccPhone = (() => {
  let host, registration, settings, installPrompt, busy = false, subscribed = false;
  let message = '', started = false, epoch = 0, failed = false;
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const email = () => window.UserContext?.getCurrentUser?.()?.email || '';
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const api = (method, body) => window.ApiClient.request('/api/notifications/push', { method, body, cache: false, retries: 0 });
  const remember = value => { try { if (value) localStorage.setItem('gcc-push-owner', value); else localStorage.removeItem('gcc-push-owner'); } catch {} };
  const remembered = () => { try { return localStorage.getItem('gcc-push-owner') || ''; } catch { return ''; } };
  function paint() {
    if (!host?.isConnected) return;
    const canPush = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const needsInstall = ios() && !installed();
    const status = message || (subscribed ? (settings?.workerHealthy ? 'Notificações ativadas neste dispositivo.' : 'Inscrito. O envio pelo servidor está atrasado.')
      : !canPush ? 'Instale o GCC em um navegador compatível para receber avisos.'
      : needsInstall ? 'No iPhone: Compartilhar → Adicionar à Tela de Início. Depois abra o GCC pelo ícone.'
      : Notification.permission === 'denied' ? 'Notificações bloqueadas. Libere nas configurações do navegador ou do aplicativo.'
      : settings && !settings.enabled ? settings.message : 'Receba os novos chamados mesmo com o GCC fechado.');
    host.innerHTML = '<section class="gcc-phone-setup"><p role="status">' + esc(status) + '</p><div>' +
      (failed || (settings && !settings.enabled) ? '<button type="button" data-phone="retry">Tentar novamente</button>' : '') +
      (!installed() ? '<button type="button" data-phone="install">Instalar GCC</button>' : '') +
      (subscribed ? '<button type="button" data-phone="disable">Desativar avisos</button>'
        : '<button type="button" data-phone="enable"' + ((!canPush || needsInstall || !settings?.enabled || failed || busy || Notification.permission === 'denied') ? ' disabled' : '') + '>Ativar notificações</button>') +
      '</div></section>';
    host.querySelectorAll('button').forEach(button => {
      if (busy) button.disabled = true;
      button.addEventListener('click', () => act(button.dataset.phone));
    });
  }
  async function start() {
    if (busy) return;
    busy = true; failed = false; message = ''; settings = null;
    const turn = epoch;
    const owner = email();
    paint();
    try {
      if (!window.isSecureContext || !('serviceWorker' in navigator)) { paint(); return; }
      // Never cache API responses or authentication in the service worker.
      const result = await api('GET');
      if (turn !== epoch || owner !== email()) return;
      if (typeof result?.data?.enabled !== 'boolean') throw new Error('Invalid push settings');
      settings = result.data;
      if (!settings.enabled) return;
      const registered = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      if (turn !== epoch || owner !== email()) return;
      registration = registered;
      const sub = await registration.pushManager?.getSubscription();
      if (turn !== epoch || owner !== email()) return;
      if (sub && settings?.enabled && remembered() === owner) {
        await api('POST', { subscription: sub.toJSON() });
        if (turn !== epoch || owner !== email()) return;
        subscribed = true;
      }
    } catch {
      if (turn === epoch && owner === email()) {
        failed = true;
        message = 'Não foi possível preparar as notificações. Verifique a conexão e toque em Tentar novamente.';
      }
    } finally { if (turn === epoch) { busy = false; paint(); } }
  }
  async function act(action) {
    if (busy) return;
    if (action === 'retry') { message = ''; await start(); return; }
    if (action === 'install') {
      if (installPrompt) { const prompt = installPrompt; installPrompt = null; await prompt.prompt(); await prompt.userChoice; }
      else message = ios() ? 'Compartilhar → Adicionar à Tela de Início. Abra pelo ícone do GCC.' : 'No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.';
      paint(); return;
    }
    busy = true;
    const turn = epoch;
    let created;
    try {
      if (action === 'disable') {
        const sub = await registration.pushManager.getSubscription();
        // Unsubscribe first: a network outage must not leave this phone receiving.
        if (sub) { await sub.unsubscribe(); await api('POST', { action: 'remove', subscription: sub.toJSON() }); }
        subscribed = false; remember(''); message = 'Notificações desativadas.';
      } else {
        // Called directly by the click, before any asynchronous network work.
        const permission = await Notification.requestPermission();
        if (turn !== epoch) return;
        if (permission !== 'granted') { message = 'Permissão não concedida. Você pode ativar depois nas configurações.'; return; }
        const ready = await navigator.serviceWorker.ready;
        if (turn !== epoch) return;
        const key = settings.publicKey.replace(/-/g, '+').replace(/_/g, '/');
        created = await ready.pushManager.getSubscription() || await ready.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key), c => c.charCodeAt(0)),
        });
        if (turn !== epoch) { await created.unsubscribe(); return; }
        await api('POST', { subscription: created.toJSON() });
        if (turn !== epoch) { await created.unsubscribe(); return; }
        subscribed = true; remember(email()); message = '';
      }
    } catch {
      if (created) await created.unsubscribe().catch(() => {});
      subscribed = false;
      message = 'Não foi possível salvar as notificações. Tente novamente.';
    } finally { if (turn === epoch) { busy = false; paint(); } }
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; paint(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; message = ''; paint(); });
  return {
    mount(element) { const reopening = host !== element; host = element; paint(); if ((!started || (reopening && failed)) && email()) { started = true; start(); } },
    reset() { epoch++; started = false; subscribed = false; settings = null; host = null; message = ''; busy = false; failed = false; },
    logout() { remember(''); registration?.pushManager?.getSubscription().then(sub => sub?.unsubscribe()).catch(() => {}); },
  };
})();
