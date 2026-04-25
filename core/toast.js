// ============================================================
// core/toast.js — notificaciones globales
// ============================================================

function _show(msg, type = 'ok', icon = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon ? `<span>${icon}</span>` : ''}<span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    el.addEventListener('animationend', () => el.remove());
  }, 3000);
}

export const toastOk   = (msg) => _show(msg, 'ok',   '✓');
export const toastError= (msg) => _show(msg, 'err',  '✕');
export const toastWarn = (msg) => _show(msg, 'warn', '⚠');
export const toastInfo = (msg) => _show(msg, 'ok',   'ℹ');
