// ============================================================
// core/router.js — navegación SPA v1.2
// ============================================================

const _inits = {};
const _sections = ['login','dashboard','incidencias','actas','permisos','historial','personal','reportes','documentos','compromisos','clima','evaluacion'];

export function registerInit(name, fn) { _inits[name] = fn; }

export function go(route, params) {
  _sections.forEach(s => {
    document.getElementById(`sec-${s}`)?.classList.remove('active');
  });

  const layout   = document.getElementById('main-layout');
  const loginSec = document.getElementById('sec-login');

  if (route === 'login') {
    layout?.classList.add('hidden');
    loginSec?.classList.add('active');
  } else {
    layout?.classList.remove('hidden');
    loginSec?.classList.remove('active');
    document.getElementById(`sec-${route}`)?.classList.add('active');
  }

  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTop = 0;
  window.scrollTo(0, 0);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === route);
  });

  if (_inits[route]) _inits[route](params || {});
}
