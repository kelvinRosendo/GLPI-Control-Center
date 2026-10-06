/* The SAT visits the existing GCC TV in the same tab. No shared credentials,
 * iframe, changes to the SAT database, or changes to GCC permissions. */
window.GccSatTV = (() => {
  'use strict';
  const SAT_URL = 'https://aliceapp.ia.br/dashboard/view';
  const enabled = new URLSearchParams(window.location.search).get('tv') === 'sat';
  let fallback = null;
  let loginNotice = null;
  let waitingForLogin = false;
  let returning = false;

  function clearFallback() {
    if (fallback !== null) clearTimeout(fallback);
    fallback = null;
  }

  function returnToSat() {
    if (returning) return;
    returning = true;
    clearFallback();
    // Fixed destination: never redirect to an address supplied by the URL.
    window.location.replace(SAT_URL);
  }

  function onLoginRequired() {
    if (!enabled) return;
    clearFallback();
    loginNotice?.remove();
    loginNotice = document.createElement('div');
    loginNotice.className = 'gcc-sat-login-notice';
    loginNotice.innerHTML = '<p>Entre no GCC para exibir ativos e chamados. O painel volta ao SAT em 20 segundos.</p>' +
      '<button type="button">Fazer login e configurar avisos</button> ' +
      '<a href="' + SAT_URL + '">Voltar ao SAT</a>';
    loginNotice.querySelector('button').addEventListener('click', () => {
      waitingForLogin = true;
      clearFallback();
      loginNotice.querySelector('p').textContent = 'Entre com sua conta institucional. Depois, ative as notificações no modo TV.';
    });
    document.querySelector('#login-screen .login-card')?.appendChild(loginNotice);
    if (!waitingForLogin) fallback = setTimeout(returnToSat, 20000);
  }

  function onAuthenticated() {
    if (!enabled) return;
    clearFallback();
    loginNotice?.remove();
    loginNotice = null;
    // A slow or unavailable GCC must not stop the rest of the SAT cycle.
    fallback = setTimeout(returnToSat, 30000);
  }

  function onReady() {
    if (!enabled || returning || !window.UserContext?.isAuthenticated?.()) return;
    clearFallback();
    window.RoomTicketsTV?.open(null, { onCycleComplete: returnToSat, fullscreen: false });
    if (waitingForLogin) window.RoomTicketsTV?.showNotifications?.();
    waitingForLogin = false;
  }

  return { onLoginRequired, onAuthenticated, onReady };
})();
