// ============================================================
// modules/compromisos/index.js — Carta Compromiso
// ============================================================

import { registerInit, go }            from '../../core/router.js';
import { Session }                      from '../../core/auth.js';
import { DB_Compromisos, DB_Empleados, DB_Actas } from '../../core/db.js';
import { toastOk, toastError }          from '../../core/toast.js';

// ── Estado local ─────────────────────────────────────────
const _s = { tab: 'nuevo', empId: null, empData: null, actaId: null, actaFolio: null };

// ── Helpers ──────────────────────────────────────────────
function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function _fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}
function _fmtDate(d) {
  if (!d) return '—';
  const [y,m,dd] = d.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${parseInt(dd)} ${meses[parseInt(m)-1]} ${y}`;
}
function _estadoBadge(estado) {
  const map = {
    en_seguimiento: { label: 'En seguimiento', color: 'var(--warning)' },
    cumplida:       { label: 'Cumplida',        color: 'var(--success)' },
    incumplida:     { label: 'Incumplida',      color: 'var(--error)'   },
  };
  const e = map[estado] || map.en_seguimiento;
  return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${e.color}22;color:${e.color}">${e.label}</span>`;
}

// ── Render principal ──────────────────────────────────────
function render(params = {}) {
  // Si viene actaId desde actas, pre-seleccionar
  if (params.actaId) {
    _s.actaId    = params.actaId;
    _s.actaFolio = params.actaFolio || null;
    _s.empId     = params.empId    || null;
    _s.empData   = params.empData  || null;
  }

  document.getElementById('sec-compromisos').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Cartas Compromiso</h1>
        <p>Seguimiento de compromisos de mejora</p>
      </div>

      <div class="tab-bar" style="margin-bottom:16px">
        <button class="tab-btn ${_s.tab==='nuevo'?'active':''}" data-ctab="nuevo">
          📝 Nueva carta
        </button>
        <button class="tab-btn ${_s.tab==='historial'?'active':''}" data-ctab="historial">
          📋 Historial
        </button>
      </div>

      <!-- TAB NUEVO -->
      <div id="ctab-nuevo" class="${_s.tab!=='nuevo'?'hidden':''}">
        ${Session.isDireccion() ? `
          <div class="alert-banner alert-info">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Rol Dirección — solo lectura</span>
          </div>` : `
        <div class="card">

          <!-- Colaborador -->
          <div class="field-group">
            <label class="field-label">Colaborador *</label>
            <input type="text" id="com-emp-input" class="field-input" placeholder="Buscar nombre..." autocomplete="off"/>
            <div id="com-emp-list" class="autocomplete-list hidden"></div>
            <div id="com-emp-info" class="hidden" style="margin-top:6px;padding:8px;background:var(--surface2);border-radius:var(--radius-sm)">
              <div style="font-size:13px;font-weight:600;color:var(--text1)" id="com-emp-nombre-disp">—</div>
              <div style="font-size:11px;color:var(--text3)" id="com-emp-puesto-disp">—</div>
            </div>
          </div>

          <!-- Acta vinculada (opcional) -->
          <div class="field-group">
            <label class="field-label">Acta vinculada <span style="font-weight:400;color:var(--text3)">(opcional)</span></label>
            <div id="com-acta-info" style="padding:8px;background:var(--surface2);border-radius:var(--radius-sm);font-size:13px;color:var(--text3)">
              ${_s.actaFolio ? `<span style="color:var(--primary);font-weight:700">${_s.actaFolio}</span>` : 'Sin acta vinculada'}
            </div>
            ${_s.actaFolio ? `<button class="btn-ghost" id="com-quitar-acta" style="font-size:12px;padding:4px 10px;margin-top:4px">✕ Quitar vinculación</button>` : ''}
          </div>

          <!-- Descripción del compromiso -->
          <div class="field-group">
            <label class="field-label">Descripción del compromiso *</label>
            <textarea id="com-descripcion" class="field-input field-textarea" style="min-height:80px"
              placeholder="¿A qué se compromete el colaborador? Sé específico y medible."></textarea>
          </div>

          <!-- Consecuencia -->
          <div class="field-group">
            <label class="field-label">Consecuencia si no cumple <span style="font-weight:400;color:var(--text3)">(opcional)</span></label>
            <textarea id="com-consecuencia" class="field-input field-textarea" style="min-height:60px"
              placeholder="Ej: Se procederá a levantar acta administrativa y suspensión..."></textarea>
          </div>

          <!-- Fecha límite -->
          <div class="field-group">
            <label class="field-label">Fecha límite de cumplimiento *</label>
            <input type="date" id="com-fecha-limite" class="field-input"/>
          </div>

          <button class="btn-primary btn-full" id="btn-guardar-compromiso" style="margin-top:8px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Guardar carta compromiso
          </button>
        </div>`}
      </div>

      <!-- TAB HISTORIAL -->
      <div id="ctab-historial" class="${_s.tab!=='historial'?'hidden':''}">
        <div id="com-hist-wrap">
          <div class="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p>Cargando...</p>
          </div>
        </div>
      </div>

    </div>
  `;

  // Fecha límite default: 15 días
  const hoy = new Date();
  hoy.setDate(hoy.getDate() + 15);
  const def = hoy.toISOString().split('T')[0];
  const fl = document.getElementById('com-fecha-limite');
  if (fl) fl.value = def;

  // Si viene empData desde actas, pre-llenar
  if (_s.empData && _s.empId) {
    const inp = document.getElementById('com-emp-input');
    if (inp) {
      inp.value = _toTitle(_s.empData.nombre);
      const info = document.getElementById('com-emp-info');
      if (info) {
        info.classList.remove('hidden');
        document.getElementById('com-emp-nombre-disp').textContent = _toTitle(_s.empData.nombre);
        document.getElementById('com-emp-puesto-disp').textContent = `${_toTitle(_s.empData.puesto)} — ${_s.empData.area}`;
      }
    }
  }

  _attachEvents();
  if (_s.tab === 'historial') _renderHistorial();
}

// ── Historial ─────────────────────────────────────────────
async function _renderHistorial() {
  const wrap = document.getElementById('com-hist-wrap');
  if (!wrap) return;
  const isAdm = Session.isAdmin() || Session.isDireccion();
  const area  = isAdm ? null : Session.getArea();
  const todos = await DB_Compromisos.getAll();
  const lista = (area
    ? todos.filter(c => (c.empleadoArea||'').toLowerCase() === area.toLowerCase())
    : todos
  ).sort((a,b) => b.timestamp - a.timestamp);

  if (!lista.length) {
    wrap.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>Sin cartas compromiso registradas</p>
    </div>`;
    return;
  }

  const hoy = new Date().toISOString().split('T')[0];
  wrap.innerHTML = lista.map(c => {
    const vencida = c.estado === 'en_seguimiento' && c.fechaLimite < hoy;
    return `
    <div class="inc-card" style="margin-bottom:10px${vencida?';border-left:3px solid var(--error)':''}">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name">${_toTitle(c.empleadoNombre)}</div>
          <div class="inc-card-meta">
            <span>${c.empleadoArea}</span>
            <span style="font-family:var(--font-mono);color:var(--primary)">${c.folio}</span>
          </div>
          ${c.actaFolio ? `<div style="font-size:11px;color:var(--text3)">Acta: ${c.actaFolio}</div>` : ''}
        </div>
        ${_estadoBadge(c.estado)}
      </div>
      <div style="font-size:12px;color:var(--text2);margin:4px 0">${c.descripcion?.slice(0,100)}${c.descripcion?.length>100?'...':''}</div>
      <div style="font-size:11px;color:${vencida?'var(--error)':'var(--text3)'}">
        Límite: ${_fmtDate(c.fechaLimite)}${vencida?' ⚠️ VENCIDA':''}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-ghost" data-com-ver="${c.id}" style="font-size:12px;padding:5px 10px">👁 Ver detalle</button>
        ${c.estado === 'en_seguimiento' && !Session.isDireccion() ? `
          <button class="btn-ghost" data-com-nota="${c.id}" style="font-size:12px;padding:5px 10px">📌 Agregar nota</button>
          ${Session.isAdmin() ? `
            <button class="btn-ghost" data-com-cerrar="${c.id}" data-estado="cumplida"
              style="font-size:12px;padding:5px 10px;color:var(--success)">✓ Cumplida</button>
            <button class="btn-ghost" data-com-cerrar="${c.id}" data-estado="incumplida"
              style="font-size:12px;padding:5px 10px;color:var(--error)">✗ Incumplida</button>` : ''}
        ` : ''}
        <button class="btn-ghost" data-com-pdf="${c.id}" style="font-size:12px;padding:5px 10px">🖨 PDF</button>
      </div>
    </div>`;
  }).join('');
}

// ── PDF ──────────────────────────────────────────────────
function _generarPDF(c) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:216mm;font-family:Arial,sans-serif;font-size:11px;color:#000;padding:15mm}
    .header{border-bottom:3px solid #1B3FAB;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start}
    .logo-txt{font-size:16px;font-weight:900;color:#1B3FAB}
    .sub{font-size:10px;color:#666}
    .folio{font-size:13px;font-weight:700;color:#1B3FAB;font-family:monospace}
    h2{font-size:14px;font-weight:900;text-align:center;margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em}
    .fila{display:flex;gap:8px;margin-bottom:8px;align-items:baseline}
    .etq{font-weight:700;min-width:130px;font-size:10px;color:#555;text-transform:uppercase}
    .val{border-bottom:1px solid #999;flex:1;padding-bottom:2px;font-size:11px}
    .bloque{border:1px solid #ccc;border-radius:6px;padding:12px;margin-bottom:14px}
    .bloque-titulo{font-size:10px;font-weight:700;text-transform:uppercase;color:#1B3FAB;margin-bottom:8px}
    .firmas{display:flex;justify-content:space-around;margin-top:30px;padding-top:10px}
    .firma{text-align:center;flex:1;padding:0 10px}
    .firma-espacio{height:40px}
    .firma-linea{border-top:1px solid #000;margin:0 10px}
    .firma-nombre{font-size:10px;margin-top:4px;color:#555}
    .footer{margin-top:20px;font-size:9px;color:#999;text-align:center}
    ${c.actaFolio?'.ref-acta{background:#f0f4ff;padding:6px 10px;border-radius:4px;font-size:10px;color:#1B3FAB;margin-bottom:10px}':''}
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo-txt">Índice Automotriz</div>
      <div class="sub">Piedras Negras, Coahuila</div>
    </div>
    <div style="text-align:right">
      <div class="folio">${c.folio}</div>
      <div class="sub">Carta Compromiso</div>
      <div class="sub">${_fmtDate(new Date().toISOString().split('T')[0])}</div>
    </div>
  </div>

  <h2>Carta de Compromiso Laboral</h2>

  ${c.actaFolio ? `<div class="ref-acta">📄 Acta vinculada: <strong>${c.actaFolio}</strong></div>` : ''}

  <div class="bloque">
    <div class="bloque-titulo">Datos del Colaborador</div>
    <div class="fila"><span class="etq">Nombre:</span><span class="val">${_toTitle(c.empleadoNombre)}</span></div>
    <div class="fila"><span class="etq">Puesto:</span><span class="val">${_toTitle(c.empleadoPuesto||'')}</span></div>
    <div class="fila"><span class="etq">Área:</span><span class="val">${c.empleadoArea}</span></div>
    <div class="fila"><span class="etq">Fecha del compromiso:</span><span class="val">${_fmtDate(new Date().toISOString().split('T')[0])}</span></div>
    <div class="fila"><span class="etq">Fecha límite:</span><span class="val"><strong>${_fmtDate(c.fechaLimite)}</strong></span></div>
  </div>

  <div class="bloque">
    <div class="bloque-titulo">Descripción del Compromiso</div>
    <p style="font-size:11px;line-height:1.6">${c.descripcion}</p>
  </div>

  ${c.consecuencia ? `
  <div class="bloque">
    <div class="bloque-titulo">Consecuencia en caso de incumplimiento</div>
    <p style="font-size:11px;line-height:1.6">${c.consecuencia}</p>
  </div>` : ''}

  <p style="font-size:11px;line-height:1.7;margin-bottom:16px">
    El colaborador abajo firmante declara haber leído, comprendido y aceptado los términos del presente
    compromiso, manifestando su conformidad con los acuerdos establecidos y el plazo indicado.
  </p>

  <div class="firmas">
    <div class="firma">
      <div class="firma-espacio"></div>
      <div class="firma-linea"></div>
      <div class="firma-nombre">Colaborador<br><strong>${_toTitle(c.empleadoNombre)}</strong></div>
    </div>
    <div class="firma">
      <div class="firma-espacio"></div>
      <div class="firma-linea"></div>
      <div class="firma-nombre">Testigo<br><strong>&nbsp;</strong></div>
    </div>
    <div class="firma">
      <div class="firma-espacio"></div>
      <div class="firma-linea"></div>
      <div class="firma-nombre">Recursos Humanos<br><strong>Alejandra González</strong></div>
    </div>
  </div>

  <div class="footer">Índice Automotriz S.A. de C.V. — Documento interno — ${c.folio}</div>
  </body></html>`;

  const win = window.open('','_blank','width=900,height=700');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

// ── Modal ver detalle ─────────────────────────────────────
function _mostrarDetalle(c) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);width:100%;max-width:600px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:20px;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div style="font-size:15px;font-weight:700">📋 ${c.folio}</div>
          <div style="font-size:11px;color:var(--text3)">${_toTitle(c.empleadoNombre)} — ${c.empleadoArea}</div>
        </div>
        <button id="btn-close-com-det" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
      </div>

      ${_estadoBadge(c.estado)}
      ${c.actaFolio ? `<div style="font-size:12px;color:var(--primary);margin-top:6px">📄 Acta: ${c.actaFolio}</div>` : ''}

      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Compromiso</div>
        <div style="font-size:13px;color:var(--text1);line-height:1.5">${c.descripcion}</div>
      </div>

      ${c.consecuencia ? `
      <div style="margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Consecuencia</div>
        <div style="font-size:13px;color:var(--text2)">${c.consecuencia}</div>
      </div>` : ''}

      <div style="margin-top:10px;display:flex;gap:16px">
        <div><span style="font-size:11px;color:var(--text3)">Generada:</span> <span style="font-size:12px">${_fmt(c.timestamp)}</span></div>
        <div><span style="font-size:11px;color:var(--text3)">Límite:</span> <span style="font-size:12px;font-weight:700">${_fmtDate(c.fechaLimite)}</span></div>
      </div>

      ${(c.seguimiento||[]).length > 0 ? `
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Seguimiento (${c.seguimiento.length})</div>
        ${c.seguimiento.map(n => `
          <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:8px;margin-bottom:6px">
            <div style="font-size:12px;color:var(--text1)">${n.texto}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${_fmt(n.ts)} · ${n.autor}</div>
          </div>`).join('')}
      </div>` : ''}

      ${c.cierreNota ? `
      <div style="margin-top:10px;padding:8px;border-radius:var(--radius-sm);background:${c.estado==='cumplida'?'rgba(5,150,105,.1)':'rgba(220,38,38,.1)'}">
        <div style="font-size:11px;font-weight:700;color:${c.estado==='cumplida'?'var(--success)':'var(--error)'};margin-bottom:2px">
          ${c.estado==='cumplida'?'✓ Cerrada como cumplida':'✗ Cerrada como incumplida'}
        </div>
        <div style="font-size:12px">${c.cierreNota}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${_fmt(c.cierreTs)} · ${c.cierrePor}</div>
      </div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#btn-close-com-det').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── Eventos ───────────────────────────────────────────────
function _attachEvents() {
  // Tabs
  document.querySelectorAll('[data-ctab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _s.tab = btn.dataset.ctab;
      document.querySelectorAll('[data-ctab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('ctab-nuevo')?.classList.toggle('hidden', _s.tab !== 'nuevo');
      document.getElementById('ctab-historial')?.classList.toggle('hidden', _s.tab !== 'historial');
      if (_s.tab === 'historial') _renderHistorial();
    });
  });

  // Buscador de empleados
  const input = document.getElementById('com-emp-input');
  const list  = document.getElementById('com-emp-list');
  if (input && list) {
    input.addEventListener('input', async () => {
      const q = input.value.trim();
      if (!q) { list.classList.add('hidden'); _s.empId = null; return; }
      let res = await DB_Empleados.search(q);
      if (!Session.isAdmin() && !Session.isDireccion()) res = res.filter(e => e.area === Session.getArea());
      if (!res.length) { list.classList.add('hidden'); return; }
      list.innerHTML = res.slice(0,6).map(e =>
        `<div class="autocomplete-item" data-id="${e.id}" data-nombre="${e.nombre}"
          data-area="${e.area}" data-puesto="${e.puesto}">
          ${_toTitle(e.nombre)} <span>${e.area}</span>
        </div>`
      ).join('');
      list.classList.remove('hidden');
    });

    list.addEventListener('click', e => {
      const item = e.target.closest('.autocomplete-item');
      if (!item) return;
      _s.empId   = item.dataset.id;
      _s.empData = { nombre: item.dataset.nombre, area: item.dataset.area, puesto: item.dataset.puesto };
      input.value = _toTitle(item.dataset.nombre);
      list.classList.add('hidden');
      document.getElementById('com-emp-info')?.classList.remove('hidden');
      document.getElementById('com-emp-nombre-disp').textContent = _toTitle(item.dataset.nombre);
      document.getElementById('com-emp-puesto-disp').textContent = `${_toTitle(item.dataset.puesto)} — ${item.dataset.area}`;
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#com-emp-input') && !e.target.closest('#com-emp-list')) {
        list.classList.add('hidden');
      }
    });
  }

  // Quitar vinculación de acta
  document.getElementById('com-quitar-acta')?.addEventListener('click', () => {
    _s.actaId = null; _s.actaFolio = null;
    document.getElementById('com-acta-info').innerHTML = 'Sin acta vinculada';
    document.getElementById('com-quitar-acta')?.remove();
  });

  // Guardar compromiso
  document.getElementById('btn-guardar-compromiso')?.addEventListener('click', async () => {
    if (!_s.empId)  { toastError('Selecciona un colaborador'); return; }
    const desc  = document.getElementById('com-descripcion').value.trim();
    const fLim  = document.getElementById('com-fecha-limite').value;
    if (!desc)  { toastError('Describe el compromiso'); return; }
    if (!fLim)  { toastError('Indica la fecha límite'); return; }
    const cons  = document.getElementById('com-consecuencia').value.trim();
    const emp   = await DB_Empleados.getById(_s.empId);
    const data  = {
      empleadoId:     _s.empId,
      empleadoNombre: emp.nombre,
      empleadoPuesto: emp.puesto,
      empleadoArea:   emp.area,
      actaId:         _s.actaId   || null,
      actaFolio:      _s.actaFolio || null,
      descripcion:    desc,
      consecuencia:   cons || null,
      fechaLimite:    fLim,
    };
    try {
      const nuevo = await DB_Compromisos.add(data, Session.get());
      toastOk(`Carta ${nuevo.folio} guardada`);
      // Limpiar estado
      _s.empId = null; _s.empData = null; _s.actaId = null; _s.actaFolio = null;
      setTimeout(() => _generarPDF(nuevo), 300);
      // Cambiar a historial
      _s.tab = 'historial';
      render();
    } catch(e) {
      toastError('Error al guardar — intenta de nuevo');
      console.error('[Compromisos]', e);
    }
  });

  // Historial — acciones
  document.getElementById('ctab-historial')?.addEventListener('click', async e => {

    // Ver detalle
    const verBtn = e.target.closest('[data-com-ver]');
    if (verBtn) {
      const c = await DB_Compromisos.getById(verBtn.dataset.comVer);
      if (c) _mostrarDetalle(c);
      return;
    }

    // PDF
    const pdfBtn = e.target.closest('[data-com-pdf]');
    if (pdfBtn) {
      const c = await DB_Compromisos.getById(pdfBtn.dataset.comPdf);
      if (c) _generarPDF(c);
      return;
    }

    // Agregar nota
    const notaBtn = e.target.closest('[data-com-nota]');
    if (notaBtn) {
      const id    = notaBtn.dataset.comNota;
      const texto = prompt('Nota de seguimiento:');
      if (!texto?.trim()) return;
      await DB_Compromisos.agregarNota(id, texto.trim(), Session.get());
      toastOk('Nota agregada');
      _renderHistorial();
      return;
    }

    // Cerrar cumplida / incumplida
    const cerrarBtn = e.target.closest('[data-com-cerrar]');
    if (cerrarBtn && Session.isAdmin()) {
      const id     = cerrarBtn.dataset.comCerrar;
      const estado = cerrarBtn.dataset.estado;
      const label  = estado === 'cumplida' ? 'cumplida ✓' : 'incumplida ✗';
      const nota   = prompt(`Nota de cierre (carta marcada como ${label}):`);
      if (nota === null) return;
      await DB_Compromisos.cerrar(id, estado, nota.trim(), Session.get());
      toastOk(`Carta marcada como ${label}`);
      if (estado === 'incumplida') {
        setTimeout(() => {
          if (confirm('¿Deseas generar un acta por incumplimiento?')) {
            go('actas');
          }
        }, 500);
      }
      _renderHistorial();
    }
  });
}

// ── Init ─────────────────────────────────────────────────
registerInit('compromisos', (params = {}) => {
  if (!Session.isActive()) { go('login'); return; }
  if (!Session.isAdmin() && !Session.isGerente() && !Session.isDireccion()) {
    go('dashboard'); return;
  }
  render(params);
});
