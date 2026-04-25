// ============================================================
// modules/login/index.js — GesPer PWA Multi-tenant
// Login con email + reset password
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { toastError, toastOk } from '../../core/toast.js';
import { aplicarBranding, aplicarModulosVisibles } from '../../app.js';

function render() {
  const sec = document.getElementById('sec-login');
  sec.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo-box">
        <div class="login-logo-placeholder">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#0F766E" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
      </div>
      <h1 class="login-brand-name">GesPer</h1>
      <p class="login-tagline">Sistema de Gestión de Personal</p>

      <div class="login-card">
        <div class="field-group">
          <label class="field-label">Email</label>
          <input type="email"
                 id="l-email"
                 class="field-input field-input-mono"
                 placeholder="tucorreo@empresa.com"
                 autocomplete="email"
                 autocapitalize="off"
                 autocorrect="off"
                 spellcheck="false"/>
        </div>

        <div class="field-group">
          <label class="field-label">Contraseña</label>
          <input type="password"
                 id="l-password"
                 class="field-input"
                 placeholder="••••••••"
                 autocomplete="current-password"/>
        </div>

        <button class="btn-primary btn-full" id="btn-login">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Iniciar sesión
        </button>

        <button class="btn-link btn-full" id="btn-forgot">
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <p class="login-footer">
        <span class="login-version">v2.0.0</span>
        <span class="login-dot">·</span>
        <span>GesPer · gesper.com.mx</span>
      </p>
    </div>
  `;
  _attachEvents();
}

function _attachEvents() {
  document.getElementById('btn-login')?.addEventListener('click', _doLogin);
  document.getElementById('btn-forgot')?.addEventListener('click', _doForgot);

  document.getElementById('l-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _doLogin();
  });
  document.getElementById('l-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('l-password')?.focus();
  });
}

async function _doLogin() {
  const email    = document.getElementById('l-email')?.value.trim();
  const password = document.getElementById('l-password')?.value;

  if (!email || !password) {
    toastError('Ingresa email y contraseña');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toastError('Email inválido');
    return;
  }

  const btn = document.getElementById('btn-login');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando...';
  }

  try {
    const session = await Session.login(email, password);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Iniciar sesión';
    }

    if (!session) {
      toastError('Usuario o contraseña incorrectos');
      return;
    }

    _postLogin(session);

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Iniciar sesión';
    }

    const code = err?.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      toastError('Email o contraseña incorrectos');
    } else if (code === 'auth/too-many-requests') {
      toastError('Demasiados intentos. Espera unos minutos.');
    } else if (code === 'auth/network-request-failed') {
      toastError('Sin conexión a internet');
    } else if (err.message) {
      toastError(err.message);
    } else {
      toastError('Error al iniciar sesión. Intenta de nuevo.');
    }
    console.error('[Login]', err);
  }
}

async function _doForgot() {
  const email = document.getElementById('l-email')?.value.trim();

  if (!email) {
    toastError('Escribe tu email primero');
    document.getElementById('l-email')?.focus();
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toastError('Email inválido');
    return;
  }

  if (!confirm(`¿Enviar email para restablecer contraseña a:\n\n${email}?`)) {
    return;
  }

  try {
    await Session.sendResetEmail(email);
    toastOk('Email de recuperación enviado. Revisa tu bandeja.');
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/user-not-found') {
      toastError('No existe usuario con ese email');
    } else {
      toastError('No se pudo enviar el email. Intenta de nuevo.');
    }
    console.error('[Forgot]', err);
  }
}

function _postLogin(session) {
  // 1) Aplicar branding (logo, colores, nombre empresa)
  aplicarBranding();

  // 2) Ocultar módulos no habilitados
  aplicarModulosVisibles();

  // 3) Mostrar rol y nombre
  const _n0 = (session.nombre || '').split(' ')[0];
  const roleLabel = document.getElementById('topbar-role-label');
  if (roleLabel) {
    roleLabel.textContent =
      session.rol === 'admin_rh' ? `Admin RH — ${_n0}` :
      session.rol === 'director' ? `Dirección — ${session.nombre}` :
                                    `Gerente — ${session.area || ''}`;
  }

  // 4) Configurar visibilidad de reportes (solo admin)
  const reportesBtn = document.querySelector('.nav-btn-admin');
  if (session.rol !== 'admin_rh' && session.rol !== 'director') {
    reportesBtn?.classList.add('hidden-role');
  } else {
    reportesBtn?.classList.remove('hidden-role');
  }

  // 5) Ir al dashboard
  go('dashboard');
}

registerInit('login', () => {
  if (Session.isActive()) {
    const s = Session.get();
    _postLogin(s);
    return;
  }
  render();
});

(function init() {
  const sec = document.getElementById('sec-login');
  if (sec) render();
})();
