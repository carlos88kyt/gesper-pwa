// ============================================================
// modules/personal/index.js — Gestión de plantilla (admin)
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Empleados } from '../../core/db.js';
import { AREAS } from '../../core/config.js';
import { toastOk, toastError } from '../../core/toast.js';

const _s = { filtroArea: '', busqueda: '', editId: null };

async function render() {
  document.getElementById('sec-personal').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Gestión de Personal</h1>
        <p>Plantilla completa — ${(await DB_Empleados.getAll()).length} colaboradores</p>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        ${!Session.isDireccion() ? `<button class="btn-primary" id="btn-nuevo-emp" style="flex:1;min-width:140px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Agregar colaborador
        </button>` : ''}
      </div>

      <!-- Búsqueda y filtro -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input type="text" id="pers-search" class="field-input" placeholder="🔍 Buscar nombre..." style="flex:1"/>
        <select id="pers-area" class="field-input field-select" style="width:140px;flex-shrink:0">
          <option value="">Todas las áreas</option>
          ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>

      <div id="pers-lista"></div>
    </div>

    <!-- Modal agregar/editar -->
    <div id="modal-personal" class="modal-overlay hidden">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2 class="modal-title" id="modal-pers-title">Nuevo colaborador</h2>
          <button class="modal-close" id="btn-close-modal-pers">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="pers-edit-id"/>
          <div class="field-group">
            <label class="field-label">Nombre completo *</label>
            <input type="text" id="pers-nombre" class="field-input" placeholder="Nombre(s) Apellido Paterno Apellido Materno"/>
          </div>
          <div class="field-group">
            <label class="field-label">Puesto *</label>
            <input type="text" id="pers-puesto" class="field-input" placeholder="Ej. Ejecutivo de Ventas"/>
          </div>
          <div class="field-group">
            <label class="field-label">Área / Departamento *</label>
            <select id="pers-area-sel" class="field-input field-select">
              <option value="">— Seleccionar —</option>
              ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha de ingreso</label>
            <input type="date" id="pers-ingreso" class="field-input"/>
          </div>
          <div class="field-group">
            <label class="field-label">No. Expediente</label>
            <input type="text" id="pers-expediente" class="field-input" placeholder="Opcional"/>
          </div>
          <button class="btn-primary btn-full" id="btn-guardar-pers">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Guardar
          </button>
        </div>
      </div>
    </div>
  `;
  _renderLista();
  _attachEvents();
}

async function _renderLista() {
  const wrap = document.getElementById('pers-lista');
  if (!wrap) return;
  let lista = await DB_Empleados.getAll();
  if (_s.filtroArea) lista = lista.filter(e => e.area === _s.filtroArea);
  if (_s.busqueda)   lista = lista.filter(e => e.nombre.toLowerCase().includes(_s.busqueda.toLowerCase()) || e.puesto.toLowerCase().includes(_s.busqueda.toLowerCase()));
  lista = lista.sort((a,b) => a.nombre.localeCompare(b.nombre));

  if (!lista.length) {
    wrap.innerHTML = `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>Sin resultados</p></div>`;
    return;
  }

  // Agrupar por área
  const porArea = {};
  lista.forEach(e => {
    if (!porArea[e.area]) porArea[e.area] = [];
    porArea[e.area].push(e);
  });

  wrap.innerHTML = Object.entries(porArea).map(([area, emps]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">
        ${area} — ${emps.length} personas
      </div>
      ${emps.map(e => `
        <div class="inc-card" style="margin-bottom:8px;cursor:default">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:600;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_toTitle(e.nombre)}</div>
              <div style="font-size:12px;color:var(--text3)">${_toTitle(e.puesto)}</div>
              ${e.fechaIngreso ? `<div style="font-size:11px;color:var(--text3)">Ingreso: ${_fmt(e.fechaIngreso)}</div>` : ''}
            </div>
            ${!Session.isDireccion() ? `<div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
              ${Session.isAdmin() && e.usuario && e.usuario !== 'direccion' ? `<button class="btn-ghost" data-reset-pwd="${e.id}" data-reset-usuario="${e.usuario}" style="padding:5px 8px;font-size:12px" title="Resetear contraseña">🔑</button>` : ''}
              <button class="btn-ghost" data-edit="${e.id}" style="padding:5px 10px;font-size:12px">✏️</button>
              <button class="btn-danger" data-del="${e.id}" style="padding:5px 10px;font-size:12px">🗑</button>
            </div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function _fmt(dateStr) {
  if (!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
}

function _abrirModal(emp = null) {
  _s.editId = emp?.id || null;
  document.getElementById('modal-pers-title').textContent = emp ? 'Editar colaborador' : 'Nuevo colaborador';
  document.getElementById('pers-edit-id').value   = emp?.id || '';
  document.getElementById('pers-nombre').value    = emp ? _toTitle(emp.nombre) : '';
  document.getElementById('pers-puesto').value    = emp ? _toTitle(emp.puesto) : '';
  document.getElementById('pers-area-sel').value  = emp?.area || '';
  document.getElementById('pers-ingreso').value   = emp?.fechaIngreso || '';
  document.getElementById('pers-expediente').value= emp?.expediente || '';
  document.getElementById('modal-personal').classList.remove('hidden');
  document.getElementById('pers-nombre').focus();
}

function _cerrarModal() {
  document.getElementById('modal-personal').classList.add('hidden');
  _s.editId = null;
}

async function _guardar() {
  const nombre = document.getElementById('pers-nombre').value.trim().toUpperCase();
  const puesto = document.getElementById('pers-puesto').value.trim().toUpperCase();
  const area   = document.getElementById('pers-area-sel').value;
  const ingreso= document.getElementById('pers-ingreso').value;
  const expdte = document.getElementById('pers-expediente').value.trim();

  if (!nombre) { toastError('El nombre es obligatorio'); return; }
  if (!puesto)  { toastError('El puesto es obligatorio'); return; }
  if (!area)    { toastError('Selecciona un área'); return; }

  if (_s.editId) {
    await DB_Empleados.update(_s.editId, { nombre, puesto, area, fechaIngreso: ingreso, expediente: expdte });
    toastOk('Colaborador actualizado');
  } else {
    await DB_Empleados.add({ nombre, puesto, area, fechaIngreso: ingreso, expediente: expdte });
    toastOk('Colaborador agregado');
  }
  _cerrarModal();
  _renderLista();
  // Actualizar contador en header
  document.querySelector('.sec-header p').textContent = `Plantilla completa — ${(await DB_Empleados.getAll()).length} colaboradores`;
}

async function _attachEvents() {
  if (!Session.isDireccion()) {
    document.getElementById('btn-nuevo-emp')?.addEventListener('click', async () => _abrirModal());
  }
  document.getElementById('btn-close-modal-pers')?.addEventListener('click', _cerrarModal);
  document.getElementById('modal-personal')?.addEventListener('click', async e => {
    if (e.target.id === 'modal-personal') _cerrarModal();
  });
  document.getElementById('btn-guardar-pers')?.addEventListener('click', _guardar);

  document.getElementById('pers-search')?.addEventListener('input', async e => {
    _s.busqueda = e.target.value;
    _renderLista();
  });
  document.getElementById('pers-area')?.addEventListener('change', async e => {
    _s.filtroArea = e.target.value;
    _renderLista();
  });

  document.getElementById('pers-lista')?.addEventListener('click', async e => {
    const resetBtn = e.target.closest('[data-reset-pwd]');
    if (resetBtn && Session.isAdmin()) {
      const usuario = resetBtn.dataset.resetUsuario;
      const emailMap = { 'ventas':'ventas@indiceautomotriz.com', 'servicio':'servicio@indiceautomotriz.com', 'direccion':'direccion@indiceautomotriz.com' };
      const email = emailMap[usuario];
      if (email) {
        try {
          const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
          const { auth } = await import('../../core/firebase.js');
          await sendPasswordResetEmail(auth, email);
          toastOk(`✉️ Link enviado a ${email}`);
        } catch(err) { toastError('Error al enviar correo'); console.error(err); }
      }
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-del]');
    if (editBtn) {
      const emp = await DB_Empleados.getById(editBtn.dataset.edit);
      if (emp) _abrirModal(emp);
    }
    if (delBtn) {
      const emp = await DB_Empleados.getById(delBtn.dataset.del);
      if (!emp) return;
      if (!confirm(`¿Eliminar a ${_toTitle(emp.nombre)}? Esta acción no se puede deshacer.`)) return;
      await DB_Empleados.remove(delBtn.dataset.del);
      toastOk('Colaborador eliminado');
      _renderLista();
      document.querySelector('.sec-header p').textContent = `Plantilla completa — ${(await DB_Empleados.getAll()).length} colaboradores`;
    }
  });
}

registerInit('personal', () => {
  if (!Session.isActive()) { go('login'); return; }
  if (!Session.isAdmin() && !Session.isDireccion())  { go('dashboard'); return; }
  // Si es dirección, ocultar secciones de modificación después del render
  if (Session.isDireccion()) {
    setTimeout(() => {
      document.querySelectorAll('.personal-admin-only').forEach(el => el.style.display = 'none');
    }, 50);
  }
  render();
});
