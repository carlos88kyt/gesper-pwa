// ============================================================
// app.js — GesPer PWA Multi-tenant v2.0
// ============================================================

import { go }      from './core/router.js';
import { Session } from './core/auth.js';
import { auth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from './core/firebase.js';
import { DB_Incidencias, DB_Empleados } from './core/db.js';
import { TIPOS_INCIDENCIA, GRAVEDADES } from './core/config.js';
import { toastOk, toastError } from './core/toast.js';

// Cargar todos los módulos
import './modules/login/index.js';
import './modules/dashboard/index.js';
import './modules/incidencias/index.js';
import './modules/actas/index.js';
import './modules/permisos/index.js';
import './modules/historial/index.js';
import './modules/personal/index.js';
import './modules/reportes/index.js';
import './modules/compromisos/index.js';
import './modules/evaluacion/index.js';
import './modules/clima/index.js';
import './modules/documentos/index.js';

// ──────────────────────────────────────────────────────────
// BRANDING DINÁMICO
// Aplica colores y logo de la empresa del usuario logueado
// ──────────────────────────────────────────────────────────
export function aplicarBranding() {
  const empresa = Session.getEmpresa();
  if (!empresa) return;

  // 1) Colores CSS variables
  const root = document.documentElement;
  if (empresa.colores?.primary) {
    root.style.setProperty('--brand-primary', empresa.colores.primary);
  }
  if (empresa.colores?.secondary) {
    root.style.setProperty('--brand-secondary', empresa.colores.secondary);
  }

  // 2) Logo en topbar
  const logoEl = document.getElementById('topbar-logo');
  if (logoEl && empresa.logo_url) {
    logoEl.src = empresa.logo_url;
    logoEl.style.display = 'block';
  }

  // 3) Nombre empresa en topbar
  const nombreEl = document.getElementById('topbar-empresa');
  if (nombreEl) nombreEl.textContent = empresa.nombre;

  // 4) Título del documento
  document.title = `${empresa.nombre} · RH`;

  // 5) Theme color (para barra de navegador móvil)
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && empresa.colores?.primary) {
    themeMeta.setAttribute('content', empresa.colores.primary);
  }
}

// ──────────────────────────────────────────────────────────
// OCULTAR MÓDULOS NO HABILITADOS para esta empresa/usuario
// ──────────────────────────────────────────────────────────
export function aplicarModulosVisibles() {
  const modulos = Session.getModulos();
  if (!modulos.length) return;

  // Botones del bottom nav
  document.querySelectorAll('[data-route]').forEach(btn => {
    const route = btn.dataset.route;

    // Login y dashboard siempre visibles
    if (route === 'login' || route === 'dashboard') return;

    if (!modulos.includes(route)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });

  // Clima: oculto para gerentes siempre
  if (Session.isGerente()) {
    const btnClima = document.querySelector('[data-route="clima"]');
    if (btnClima) btnClima.style.display = 'none';
  }
}

// ──────────────────────────────────────────────────────────
// POST-LOGIN: branding + módulos + role label
// ──────────────────────────────────────────────────────────
export function setupPostLogin(session) {
  aplicarBranding();
  aplicarModulosVisibles();

  const _nombre0 = (session.nombre || '').split(' ')[0];
  const roleLabel = document.getElementById('topbar-role-label');
  if (roleLabel) {
    roleLabel.textContent =
      session.rol === 'admin_rh' ? `Admin RH — ${_nombre0}` :
      session.rol === 'director' ? `Dirección — ${session.nombre}` :
                                    `Gerente — ${session.area || ''}`;
  }

  // Ocultar registro exprés para dirección
  if (Session.isDireccion()) {
    const btnExp = document.getElementById('btn-expres-top');
    if (btnExp) btnExp.style.display = 'none';
  }
}

// ──────────────────────────────────────────────────────────
// Navegación bottom nav
// ──────────────────────────────────────────────────────────
document.getElementById('bottom-nav')?.addEventListener('click', e => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  go(btn.dataset.route);
});

// ──────────────────────────────────────────────────────────
// Logout
// ──────────────────────────────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await Session.logout();
  location.reload();
});

// ──────────────────────────────────────────────────────────
// Registro Exprés
// ──────────────────────────────────────────────────────────
function _setupExpres() {
  const modal   = document.getElementById('modal-expres');
  const close   = document.getElementById('btn-close-expres');
  const input   = document.getElementById('exp-empleado');
  const list    = document.getElementById('exp-empleado-list');
  const tipoSel = document.getElementById('exp-tipo');
  const gravEl  = document.getElementById('exp-gravedad-display');
  let _empId = null, _empCache = {};

  if (tipoSel) {
    tipoSel.innerHTML = '<option value="">— Seleccionar —</option>' +
      TIPOS_INCIDENCIA.filter(t => t.activo).map(t =>
        `<option value="${t.id}" data-grav="${t.gravedad}">${t.nombre}</option>`
      ).join('');
  }

  document.getElementById('btn-expres-top')?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    _reset();
  });
  close?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  input?.addEventListener('input', async () => {
    _empId = null;
    const q = input.value.trim();
    if (!q) { list?.classList.add('hidden'); return; }
    let res = await DB_Empleados.search(q);
    if (!Session.isAdminOrDir()) res = res.filter(e => e.area === Session.getArea());
    res = res.slice(0, 6);
    if (!res.length) { list?.classList.add('hidden'); return; }
    list.innerHTML = res.map(e =>
      `<div class="autocomplete-item" data-id="${e.id}" data-nombre="${e.nombre}" data-area="${e.area}" data-puesto="${e.puesto}">
        ${e.nombre.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())} <span>${e.area}</span>
      </div>`
    ).join('');
    list?.classList.remove('hidden');
  });

  list?.addEventListener('click', e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    _empId = item.dataset.id;
    _empCache = { nombre: item.dataset.nombre, area: item.dataset.area, puesto: item.dataset.puesto };
    input.value = item.dataset.nombre.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
    list.classList.add('hidden');
  });

  tipoSel?.addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    const g = GRAVEDADES[opt?.dataset.grav];
    if (g && gravEl) { gravEl.textContent = g.label; gravEl.className = `gravedad-badge-lg ${g.cls}`; }
    else if (gravEl) { gravEl.textContent = '— selecciona tipo —'; gravEl.className = 'gravedad-badge-lg'; }
  });

  document.getElementById('btn-guardar-expres')?.addEventListener('click', async () => {
    if (!_empId)          { toastError('Selecciona un empleado'); return; }
    if (!tipoSel?.value)  { toastError('Selecciona el tipo'); return; }
    const tipo = TIPOS_INCIDENCIA.find(t => t.id === tipoSel.value);
    const opt  = tipoSel.selectedOptions[0];
    await DB_Incidencias.add({
      empleadoId: _empId, empleadoNombre: _empCache.nombre,
      puesto: _empCache.puesto, area: _empCache.area,
      tipoId: tipoSel.value, tipoNombre: tipo?.nombre || tipoSel.value,
      gravedad: opt?.dataset.grav || 'media',
      descripcion: `Registro exprés — ${tipo?.nombre}`,
      fechaHecho: new Date().toISOString().split('T')[0], testigos: '',
    }, Session.get());
    toastOk('⚡ Incidencia registrada');
    modal?.classList.add('hidden');
    _reset();
  });

  function _reset() {
    _empId = null; _empCache = {};
    if (input) input.value = '';
    if (tipoSel) tipoSel.value = '';
    if (gravEl) { gravEl.textContent = '— selecciona tipo —'; gravEl.className = 'gravedad-badge-lg'; }
    list?.classList.add('hidden');
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#exp-empleado') && !e.target.closest('#exp-empleado-list')) {
      list?.classList.add('hidden');
    }
  });
}

// ──────────────────────────────────────────────────────────
// Service Worker
// ──────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ──────────────────────────────────────────────────────────
// Cambiar contraseña (ahora con email del Firebase Auth)
// ──────────────────────────────────────────────────────────
function _setupCambiarPassword() {
  const modal = document.getElementById('modal-password');

  document.getElementById('btn-cambiar-pwd')?.addEventListener('click', () => {
    document.getElementById('pwd-actual').value = '';
    document.getElementById('pwd-nueva').value = '';
    document.getElementById('pwd-confirmar').value = '';
    modal?.classList.remove('hidden');
  });
  document.getElementById('btn-close-pwd')?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  document.getElementById('btn-guardar-pwd')?.addEventListener('click', async () => {
    const actual    = document.getElementById('pwd-actual').value.trim();
    const nueva     = document.getElementById('pwd-nueva').value.trim();
    const confirmar = document.getElementById('pwd-confirmar').value.trim();

    if (!actual || !nueva || !confirmar) { toastError('Completa todos los campos'); return; }
    if (nueva.length < 6) { toastError('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (nueva !== confirmar) { toastError('Las contraseñas no coinciden'); return; }

    try {
      const firebaseUser = auth.currentUser;
      const email        = Session.getEmail();
      if (!firebaseUser || !email) {
        toastError('Sesión expirada. Inicia de nuevo.');
        return;
      }
      const credential = EmailAuthProvider.credential(email, actual);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, nueva);
      toastOk('Contraseña actualizada correctamente');
      modal?.classList.add('hidden');
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        toastError('La contraseña actual es incorrecta');
      } else if (e.code === 'auth/requires-recent-login') {
        toastError('Sesión expirada — cierra sesión e inicia de nuevo para cambiar la contraseña');
      } else {
        toastError('Error al cambiar contraseña — intenta de nuevo');
        console.error('[CambiarPwd]', e.code, e.message);
      }
    }
  });
}

// ──────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────
_setupExpres();
_setupCambiarPassword();

// Si ya hay sesión, aplicar branding antes de renderizar
if (Session.isActive()) {
  aplicarBranding();
  aplicarModulosVisibles();
  go('dashboard');
} else {
  go('login');
}
