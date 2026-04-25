// ============================================================
// modules/incidencias/index.js — v19
// Bitácora acumulativa + estados + cierre
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Incidencias, DB_Empleados } from '../../core/db.js';
import { TIPOS_INCIDENCIA, GRAVEDADES } from '../../core/config.js';
import { toastOk, toastError } from '../../core/toast.js';

const _s = { tab: 'form', filtroArea: '' };

function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function _fmt(ts) {
  return new Date(ts).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function _gravBadge(grav) {
  const g = GRAVEDADES[grav];
  return g ? `<span class="gravedad-badge ${g.cls}">${g.label}</span>` : '';
}
function _estadoBadge(estado) {
  const map = {
    activa:        { label: 'Activa',        bg: 'rgba(2,132,199,.12)',   color: '#0284C7' },
    en_seguimiento:{ label: 'En seguimiento',bg: 'rgba(217,119,6,.12)',   color: '#D97706' },
    resuelta:      { label: 'Resuelta',      bg: 'rgba(5,150,105,.12)',   color: '#059669' },
    escalada:      { label: 'Escalada a acta',bg:'rgba(220,38,38,.12)',   color: '#DC2626' },
    cancelada:     { label: 'Cancelada',     bg: 'rgba(100,100,100,.12)', color: '#6B7280' },
  };
  const s = map[estado] || map.activa;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function _setGravedad(gravId) {
  const disp = document.getElementById('inc-gravedad-display');
  if (!disp) return;
  const g = GRAVEDADES[gravId];
  if (g) { disp.textContent = g.label; disp.className = `gravedad-badge-lg ${g.cls}`; }
  else   { disp.textContent = '— selecciona tipo —'; disp.className = 'gravedad-badge-lg'; }
}

function render() {
  const isAdm = Session.isAdmin();
  document.getElementById('sec-incidencias').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Registrar Incidencia</h1>
        <p>Objetivo: menos de 2 minutos</p>
      </div>
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="form">📝 Nueva</button>
        <button class="tab-btn" data-tab="lista">📋 Recientes</button>
      </div>

      <!-- FORM -->
      <div id="tab-form">
        <div class="fields-grid">
          <div class="field-group" style="position:relative">
            <label class="field-label">Empleado *</label>
            <input type="text" id="inc-empleado-input" class="field-input" placeholder="Buscar..." autocomplete="off"/>
            <div id="inc-empleado-list" class="autocomplete-list hidden"></div>
            <input type="hidden" id="inc-empleado-id"/>
          </div>
          <div class="field-group">
            <label class="field-label">Área</label>
            <input type="text" id="inc-area" class="field-input" readonly style="opacity:.6"/>
          </div>
        </div>
        <div class="fields-grid">
          <div class="field-group">
            <label class="field-label">Puesto</label>
            <input type="text" id="inc-puesto" class="field-input" readonly style="opacity:.6"/>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha *</label>
            <input type="date" id="inc-fecha" class="field-input"/>
          </div>
        </div>
        <div class="fields-grid">
          <div class="field-group">
            <label class="field-label">Tipo *</label>
            <select id="inc-tipo" class="field-input field-select">
              <option value="">— Seleccionar —</option>
              ${TIPOS_INCIDENCIA.filter(t=>t.activo).map(t =>
                `<option value="${t.id}" data-grav="${t.gravedad}">${t.nombre}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Gravedad</label>
            <div id="inc-gravedad-display" class="gravedad-badge-lg">— selecciona tipo —</div>
          </div>
        </div>
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Descripción * (máx. 200 caracteres)</label>
          <textarea id="inc-desc" class="field-input field-textarea" maxlength="200" placeholder="Describe brevemente..."></textarea>
          <span id="inc-desc-count" style="font-size:11px;color:var(--text3);text-align:right">0/200</span>
        </div>
        <div class="field-group" style="margin-bottom:20px">
          <label class="field-label">Testigos (opcional)</label>
          <input type="text" id="inc-testigos" class="field-input" placeholder="Nombre(s)..."/>
        </div>
        <button class="btn-primary btn-full" id="btn-guardar-inc">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Guardar incidencia
        </button>
        <div class="timer-hint">⏱ Objetivo: menos de 2 minutos</div>
      </div>

      <!-- LISTA -->
      <div id="tab-lista" class="hidden">
        ${isAdm ? `<div class="chip-row" id="lista-filtros">
          <button class="filter-chip active" data-area="">Todas</button>
          ${['Ventas','Servicio','Administrativo','Refacciones','Marketing','Seminuevos'].map(a =>
            `<button class="filter-chip" data-area="${a}">${a}</button>`
          ).join('')}
        </div>` : ''}
        <div id="inc-lista-wrap"></div>
      </div>
    </div>

    <!-- MODAL BITÁCORA -->
    <div id="modal-bitacora" class="modal-overlay hidden">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2 class="modal-title">📌 Seguimiento</h2>
          <button class="modal-close" id="btn-close-bit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="bit-inc-id"/>
          <div id="bit-inc-info" style="background:var(--surface3);border-radius:var(--radius-sm);padding:10px;margin-bottom:12px;font-size:13px;color:var(--text2)"></div>

          <!-- Bitácora existente -->
          <div id="bit-historial" style="margin-bottom:12px;max-height:200px;overflow-y:auto"></div>

          <!-- Nueva nota -->
          <div class="field-group">
            <label class="field-label">Nueva nota de seguimiento</label>
            <textarea id="bit-nota" class="field-input field-textarea" style="min-height:72px" placeholder="Describe el seguimiento, acciones tomadas..."></textarea>
          </div>

          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn-primary" style="flex:1;min-width:120px" id="btn-guardar-bit">💬 Agregar nota</button>
            <button class="btn-ghost" id="btn-resolver-inc" style="flex:1;min-width:120px;justify-content:center">✅ Marcar resuelta</button>
            <button class="btn-ghost" id="btn-crear-acta-desde-inc" style="flex:1;min-width:120px;justify-content:center">📄 Convertir a acta</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inc-fecha').value = today;
  _attachEvents();
}

async function _renderLista(areaFiltro = '') {
  const wrap = document.getElementById('inc-lista-wrap');
  if (!wrap) return;
  const isAdm = Session.isAdmin();
  let items = isAdm
    ? (areaFiltro ? await DB_Incidencias.getByArea(areaFiltro) : await DB_Incidencias.getRecientes(60))
    : await DB_Incidencias.getByArea(Session.getArea());

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg><p>Sin incidencias registradas</p></div>`;
    return;
  }

  const activas = ['activa','en_seguimiento','escalada'];
  wrap.innerHTML = items.map(i => {
    const noActiva = !activas.includes(i.estado);
    return `
    <div class="inc-card" style="margin-bottom:10px;${noActiva?'opacity:.6':''}">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name">${_toTitle(i.empleadoNombre)}</div>
          <div class="inc-card-meta"><span>${i.area}</span><span>${_fmt(i.timestamp)}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${_gravBadge(i.gravedad)}
          ${_estadoBadge(i.estado)}
        </div>
      </div>
      <div><span class="inc-chip">${i.tipoNombre}</span></div>
      ${i.descripcion ? `<div class="inc-card-desc">${i.descripcion}</div>` : ''}
      ${(i.bitacora && i.bitacora.length > 0) ? `
        <div style="margin-top:6px;padding:6px 10px;background:var(--info-lite);border-radius:6px;border:1px solid rgba(2,132,199,.15)">
          <div style="font-size:10px;font-weight:700;color:var(--info);margin-bottom:4px">📌 ${i.bitacora.length} nota${i.bitacora.length>1?'s':''} de seguimiento</div>
          <div style="font-size:11px;color:var(--text2)">${i.bitacora[i.bitacora.length-1].texto.replace('✅ CIERRE: ','')}</div>
          <div style="font-size:10px;color:var(--text3)">${_fmt(i.bitacora[i.bitacora.length-1].ts)} · ${i.bitacora[i.bitacora.length-1].autor}</div>
        </div>` : ''}
      ${i.estado === 'cancelada' ? `<div style="font-size:11px;color:var(--text3)">⊘ Cancelada — ${i.canceladoMotivo}</div>` : ''}
      ${activas.includes(i.estado) ? `
        <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;flex-wrap:wrap">
          ${!Session.isDireccion() ? `<button class="btn-ghost" data-bitacora="${i.id}" style="font-size:12px;padding:5px 10px">📌 Seguimiento</button>` : ''}
          <button class="btn-danger" data-cancel="${i.id}" style="font-size:12px;padding:5px 10px">Cancelar</button>
        </div>` : ''}
    </div>`}).join('');
}

async function _abrirBitacora(id) {
  const inc = (await DB_Incidencias.getAll()).find(i => i.id === id);
  if (!inc) return;
  document.getElementById('bit-inc-id').value = id;
  document.getElementById('bit-nota').value   = '';
  document.getElementById('bit-inc-info').textContent =
    `${_toTitle(inc.empleadoNombre)} · ${inc.tipoNombre} · ${_fmt(inc.timestamp)}`;

  // Render bitácora existente
  const hist = document.getElementById('bit-historial');
  const notas = inc.bitacora || [];
  if (!notas.length) {
    hist.innerHTML = `<div style="font-size:12px;color:var(--text3);font-style:italic;padding:4px 0">Sin notas previas — sé el primero en agregar seguimiento.</div>`;
  } else {
    hist.innerHTML = notas.map(n => `
      <div style="background:var(--surface3);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:6px;border-left:3px solid var(--primary)">
        <div style="font-size:12px;color:var(--text1)">${n.texto}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${_fmt(n.ts)} · ${n.autor}</div>
      </div>`).join('');
  }

  document.getElementById('modal-bitacora')._incData = inc;
  document.getElementById('modal-bitacora').classList.remove('hidden');
}

function _clearForm() {
  ['inc-empleado-input','inc-area','inc-puesto','inc-desc','inc-testigos'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const idEl = document.getElementById('inc-empleado-id');
  if (idEl) idEl.value = '';
  const tipo = document.getElementById('inc-tipo');
  if (tipo) tipo.value = '';
  _setGravedad(null);
  document.getElementById('inc-fecha').value = new Date().toISOString().split('T')[0];
  const cnt = document.getElementById('inc-desc-count');
  if (cnt) cnt.textContent = '0/200';
}

async function _guardar(){
  const empleadoId = document.getElementById('inc-empleado-id')?.value;
  const tipoEl = document.getElementById('inc-tipo');
  const tipoId = tipoEl?.value;
  const desc   = document.getElementById('inc-desc')?.value.trim();
  if (!empleadoId) { toastError('Selecciona un empleado'); return; }
  if (!tipoId)     { toastError('Selecciona el tipo'); return; }
  if (!desc)       { toastError('Escribe una descripción'); return; }
  const opt  = tipoEl.selectedOptions[0];
  const tipo = TIPOS_INCIDENCIA.find(t => t.id === tipoId);
  await DB_Incidencias.add({
    empleadoId,
    empleadoNombre: document.getElementById('inc-empleado-input')?.value,
    puesto:  document.getElementById('inc-puesto')?.value,
    area:    document.getElementById('inc-area')?.value,
    tipoId, tipoNombre: tipo?.nombre || tipoId,
    gravedad: opt?.dataset.grav || 'media',
    descripcion: desc,
    fechaHecho: document.getElementById('inc-fecha')?.value,
    testigos: document.getElementById('inc-testigos')?.value.trim() || '',
  }, Session.get());
  toastOk('✓ Incidencia registrada');
  _clearForm();
}

async function _attachEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-form').classList.toggle('hidden', tab !== 'form');
      document.getElementById('tab-lista').classList.toggle('hidden', tab !== 'lista');
      if (tab === 'lista') _renderLista(_s.filtroArea);
    });
  });

  const empInput = document.getElementById('inc-empleado-input');
  const empList  = document.getElementById('inc-empleado-list');
  empInput?.addEventListener('input', async () => {
    const q = empInput.value.trim();
    if (!q) { empList?.classList.add('hidden'); return; }
    let res = await DB_Empleados.search(q);
    if (!Session.isAdmin() && !Session.isDireccion()) res = res.filter(e => e.area === Session.getArea());
    res = res.slice(0,6);
    if (!res.length) { empList?.classList.add('hidden'); return; }
    empList.innerHTML = res.map(e =>
      `<div class="autocomplete-item" data-id="${e.id}" data-nombre="${e.nombre}" data-area="${e.area}" data-puesto="${e.puesto}">
        ${_toTitle(e.nombre)} <span>${e.area}</span></div>`
    ).join('');
    empList?.classList.remove('hidden');
  });
  empList?.addEventListener('click', async e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    empInput.value = _toTitle(item.dataset.nombre);
    document.getElementById('inc-empleado-id').value = item.dataset.id;
    document.getElementById('inc-area').value  = item.dataset.area;
    document.getElementById('inc-puesto').value = _toTitle(item.dataset.puesto);
    empList.classList.add('hidden');
  });

  document.getElementById('inc-tipo')?.addEventListener('change', async e => {
    _setGravedad(e.target.selectedOptions[0]?.dataset.grav || null);
  });
  document.getElementById('inc-desc')?.addEventListener('input', async e => {
    const cnt = document.getElementById('inc-desc-count');
    if (cnt) cnt.textContent = `${e.target.value.length}/200`;
  });
  if (!Session.isDireccion()) {
    document.getElementById('btn-guardar-inc')?.addEventListener('click', _guardar);
  } else {
    document.getElementById('btn-guardar-inc')?.remove();
  }

  document.getElementById('lista-filtros')?.addEventListener('click', async e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    _s.filtroArea = chip.dataset.area;
    _renderLista(_s.filtroArea);
  });

  document.getElementById('inc-lista-wrap')?.addEventListener('click', async e => {
    const cancelBtn = e.target.closest('[data-cancel]');
    const bitBtn    = e.target.closest('[data-bitacora]');

    if (cancelBtn) {
      const motivo = prompt('Motivo de cancelación (obligatorio):');
      if (!motivo?.trim()) return;
      await DB_Incidencias.cancelar(cancelBtn.dataset.cancel, motivo.trim(), Session.get());
      toastOk('Incidencia cancelada');
      _renderLista(_s.filtroArea);
    }
    if (bitBtn) _abrirBitacora(bitBtn.dataset.bitacora);
  });

  // Modal bitácora
  document.getElementById('btn-close-bit')?.addEventListener('click', async () => {
    document.getElementById('modal-bitacora').classList.add('hidden');
  });
  document.getElementById('modal-bitacora')?.addEventListener('click', async e => {
    if (e.target.id === 'modal-bitacora') e.target.classList.add('hidden');
  });

  document.getElementById('btn-guardar-bit')?.addEventListener('click', async () => {
    const id   = document.getElementById('bit-inc-id').value;
    const nota = document.getElementById('bit-nota').value.trim();
    if (!nota) { toastError('Escribe una nota'); return; }
    await DB_Incidencias.agregarNota(id, nota, Session.get());
    toastOk('Nota agregada');
    _abrirBitacora(id); // Refrescar bitácora
    _renderLista(_s.filtroArea);
  });

  document.getElementById('btn-resolver-inc')?.addEventListener('click', async () => {
    const id   = document.getElementById('bit-inc-id').value;
    const nota = document.getElementById('bit-nota').value.trim();
    if (!nota) { toastError('Escribe la nota de cierre'); return; }
    if (!confirm('¿Marcar esta incidencia como RESUELTA? Ya no aparecerá en el semáforo activo.')) return;
    await DB_Incidencias.resolver(id, nota, Session.get());
    toastOk('✅ Incidencia marcada como resuelta');
    document.getElementById('modal-bitacora').classList.add('hidden');
    _renderLista(_s.filtroArea);
  });

  document.getElementById('btn-crear-acta-desde-inc')?.addEventListener('click', async () => {
    const inc = document.getElementById('modal-bitacora')._incData;
    if (!inc) return;
    await DB_Incidencias.escalar(inc.id, Session.get());
    document.getElementById('modal-bitacora').classList.add('hidden');
    window._actaDesdeIncidencia = inc;
    go('actas');
    toastOk('Datos cargados en el acta');
  });

  if (window._incidenciasClickHandler) document.removeEventListener('click', window._incidenciasClickHandler);
  window._incidenciasClickHandler = e => {
    if (!e.target.closest('#inc-empleado-input') && !e.target.closest('#inc-empleado-list')) {
      empList?.classList.add('hidden');
    }
  };
  document.addEventListener('click', window._incidenciasClickHandler);
}

registerInit('incidencias', () => {
  if (!Session.isActive()) { go('login'); return; }
  render();
});
