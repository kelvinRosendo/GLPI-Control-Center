/**
 * GLPI Control Center - session-warning.js
 * -----------------------------------------------------------------------------
 * Alerta de sessão expirando com countdown visual.
 *
 * Exibe um modal quando a sessão está prestes a expirar,
 * permitindo ao usuário renovar ou fazer logout.
 *
 * Sprint 15: Autenticação
 */

window.SessionWarning = (function () {
  'use strict';

  const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minutos antes de expirar
  const CHECK_INTERVAL_MS = 60 * 1000; // Verificar a cada 1 minuto

  let _warningInterval = null;
  let _modalEl = null;
  let _countdownInterval = null;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    _stopMonitoring();
    _startMonitoring();
  }

  function destroy() {
    _stopMonitoring();
    _hideModal();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MONITORAMENTO
  // ════════════════════════════════════════════════════════════════════════════

  function _startMonitoring() {
    _stopMonitoring();

    _warningInterval = setInterval(function () {
      _checkSession();
    }, CHECK_INTERVAL_MS);
  }

  function _stopMonitoring() {
    if (_warningInterval) {
      clearInterval(_warningInterval);
      _warningInterval = null;
    }
  }

  function _checkSession() {
    if (!window.UserContext?.isAuthenticated()) {
      _stopMonitoring();
      return;
    }

    const session = window.UserContext.getSession();
    if (!session?.expiresAt) return;

    const now = Date.now();
    const expiresAt = session.expiresAt;
    const timeLeft = expiresAt - now;

    // Sessão já expirou
    if (timeLeft <= 0) {
      _stopMonitoring();
      _hideModal();
      return;
    }

    // Mostrar aviso quando faltam 5 minutos
    if (timeLeft <= WARNING_BEFORE_MS && !_modalEl) {
      _showModal(timeLeft);
    }

    // Atualizar countdown se modal estiver aberto
    if (_modalEl && timeLeft > 0) {
      _updateCountdown(timeLeft);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MODAL
  // ════════════════════════════════════════════════════════════════════════════

  function _showModal(timeLeftMs) {
    if (_modalEl) return;

    _modalEl = document.createElement('div');
    _modalEl.className = 'session-warning-overlay';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    _modalEl.setAttribute('aria-labelledby', 'session-warning-title');

    _modalEl.innerHTML = `
      <div class="session-warning-modal">
        <div class="session-warning-icon">&#9203;</div>
        <h3 id="session-warning-title" class="session-warning-title">Sessão expirando</h3>
        <p class="session-warning-text">
          Sua sessão irá expirar em <strong id="session-countdown">5:00</strong>.
        </p>
        <p class="session-warning-subtext">
          Deseja continuar conectado?
        </p>
        <div class="session-warning-actions">
          <button class="session-warning-btn session-warning-btn--primary" id="session-renew-btn">
            Renovar Sessão
          </button>
          <button class="session-warning-btn session-warning-btn--secondary" id="session-logout-btn">
            Sair
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(_modalEl);

    // Event listeners
    document.getElementById('session-renew-btn')?.addEventListener('click', _renewSession);
    document.getElementById('session-logout-btn')?.addEventListener('click', _logout);

    // Iniciar countdown
    _startCountdown(timeLeftMs);

    // Emitir evento
    _emit('session:warning', { timeLeft: timeLeftMs });
  }

  function _hideModal() {
    _stopCountdown();

    if (_modalEl) {
      _modalEl.remove();
      _modalEl = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COUNTDOWN
  // ════════════════════════════════════════════════════════════════════════════

  function _startCountdown(timeLeftMs) {
    _stopCountdown();
    _updateCountdown(timeLeftMs);

    _countdownInterval = setInterval(function () {
      const session = window.UserContext?.getSession();
      if (!session?.expiresAt) {
        _stopCountdown();
        return;
      }

      const timeLeft = session.expiresAt - Date.now();
      if (timeLeft <= 0) {
        _stopCountdown();
        _hideModal();
        return;
      }

      _updateCountdown(timeLeft);
    }, 1000);
  }

  function _stopCountdown() {
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
  }

  function _updateCountdown(timeLeftMs) {
    const countdownEl = document.getElementById('session-countdown');
    if (!countdownEl) return;

    const minutes = Math.floor(timeLeftMs / 60000);
    const seconds = Math.floor((timeLeftMs % 60000) / 1000);
    countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  function _renewSession() {
    const renewed = window.UserContext?.refreshSession();
    if (renewed) {
      _hideModal();
      _emit('session:renewed', { success: true });

      // Auditar
      if (window.Audit) {
        window.Audit.log('session_renewed', { module: 'auth' });
      }
    } else {
      _emit('session:renewed', { success: false });
    }
  }

  function _logout() {
    _hideModal();
    if (window.Auth?.logout) {
      window.Auth.logout();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    destroy,
  };
})();
