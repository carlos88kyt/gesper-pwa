// ============================================================
// modules/permisos/index.js — Permisos laborales v2
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Empleados, DB_Permisos } from '../../core/db.js';
import { AGENCIA, SUCURSAL } from '../../core/config.js';
import { toastOk, toastError } from '../../core/toast.js';

function render() {
  document.getElementById('sec-permisos').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Permisos Laborales</h1>
        <p>Registro y seguimiento de ausencias autorizadas</p>
      </div>
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="nuevo">📝 Nuevo permiso</button>
        <button class="tab-btn" data-tab="historial">📋 Historial</button>
      </div>

      <div id="tab-perm-nuevo">
        <div class="field-group" style="margin-bottom:14px;position:relative">
          <label class="field-label">Colaborador *</label>
          <input type="text" id="perm-emp-input" class="field-input" placeholder="Buscar nombre..." autocomplete="off"/>
          <div id="perm-emp-list" class="autocomplete-list hidden"></div>
          <input type="hidden" id="perm-emp-id"/>
        </div>
        <div id="perm-emp-info" class="hidden" style="margin-bottom:14px">
          <div class="card" style="padding:10px">
            <div style="font-size:13px;font-weight:600;color:var(--text1)" id="perm-emp-nombre-disp">—</div>
            <div style="font-size:11px;color:var(--text3)" id="perm-emp-puesto-disp">—</div>
          </div>
        </div>
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Fecha de solicitud</label>
          <input type="date" id="perm-fecha-sol" class="field-input"/>
        </div>
        <div class="fields-grid">
          <div class="field-group">
            <label class="field-label">Fecha inicio *</label>
            <input type="date" id="perm-fecha-ini" class="field-input"/>
          </div>
          <div class="field-group">
            <label class="field-label">Fecha fin *</label>
            <input type="date" id="perm-fecha-fin" class="field-input"/>
          </div>
        </div>
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Motivo *</label>
          <select id="perm-motivo" class="field-input field-select">
            <option value="">— Seleccionar —</option>
            <option value="Médico / de salud">Médico / de salud</option>
            <option value="Personal / familiar">Personal / familiar</option>
            <option value="Cursos / capacitación">Cursos / capacitación</option>
          </select>
        </div>
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Tipo de permiso *</label>
          <select id="perm-tipo" class="field-input field-select">
            <option value="">— Seleccionar —</option>
            <option value="Permiso con goce de sueldo">Con goce de sueldo</option>
            <option value="Permiso sin goce de sueldo">Sin goce de sueldo</option>
            <option value="Vacaciones">Vacaciones</option>
          </select>
        </div>
        <div class="field-group" style="margin-bottom:20px">
          <label class="field-label">Observaciones</label>
          <textarea id="perm-obs" class="field-input field-textarea" style="min-height:60px" placeholder="Notas adicionales..."></textarea>
        </div>
        <button class="btn-primary btn-full" id="btn-guardar-perm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/></svg>
          Guardar y generar comprobante
        </button>
      </div>

      <div id="tab-perm-historial" class="hidden">
        <div id="perm-hist-wrap"></div>
      </div>
    </div>
  `;
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('perm-fecha-sol').value = hoy;
  document.getElementById('perm-fecha-ini').value = hoy;
  document.getElementById('perm-fecha-fin').value = hoy;
  _attachEvents();
}

function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function _diasEntre(ini, fin) {
  const a = new Date(ini), b = new Date(fin);
  return Math.max(Math.round((b - a) / 86400000) + 1, 1);
}

function _fmtFecha(dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}

function _generarPDF(perm) {
  const dias = _diasEntre(perm.fechaIni, perm.fechaFin);
  const motivos = ['Médico / de salud','Personal / familiar','Cursos / capacitación'];
  const tipos   = ['Permiso con goce de sueldo','Permiso sin goce de sueldo','Vacaciones'];

  const bloquePermiso = (titulo) => `
    <div class="bloque">
      <div class="encabezado">
        <div class="enc-texto">
          <div class="enc-titulo">Índice Automotriz S.A. de C.V. — ${SUCURSAL}</div>
          <div class="enc-sub">Libramiento Manuel Pérez Treviño #400, Col. San Luis, Piedras Negras, Coahuila</div>
        </div>
      </div>
      <div class="titulo-doc">Permiso Laboral${titulo ? ' — ' + titulo : ''}</div>
      <div class="fila"><span class="etq">Fecha de solicitud:</span><span class="val">${_fmtFecha(perm.fechaSolicitud)}</span></div>
      <div class="fila"><span class="etq">Colaborador:</span><span class="val">${_toTitle(perm.empleadoNombre)}</span></div>
      <div class="fila"><span class="etq">Puesto:</span><span class="val">${_toTitle(perm.empleadoPuesto)}</span></div>
      <div class="fila"><span class="etq">Área:</span><span class="val">${perm.empleadoArea}</span></div>
      <div style="margin:8px 0 4px"><strong>Solicito permiso para ausentarme:</strong></div>
      <div class="fila">
        <span class="etq">Del:</span><span class="val">${_fmtFecha(perm.fechaIni)}</span>
        <span style="margin:0 8px">al</span>
        <span class="val">${_fmtFecha(perm.fechaFin)}</span>
        <span style="margin-left:8px;font-weight:bold">(${dias} día${dias>1?'s':''})</span>
      </div>
      <div style="margin:8px 0 4px"><strong>Motivo:</strong></div>
      <div class="opciones">
        ${motivos.map(m => `<div class="opcion"><div class="cuadro">${perm.motivo===m?'✓':''}</div>${m}</div>`).join('')}
      </div>
      <div style="margin:6px 0 4px"><strong>Tipo:</strong></div>
      <div class="opciones">
        ${tipos.map(t => `<div class="opcion"><div class="cuadro">${perm.tipo===t?'✓':''}</div>${t}</div>`).join('')}
      </div>
      ${perm.observaciones ? `<div style="margin-top:6px;font-size:10px"><strong>Obs:</strong> ${perm.observaciones}</div>` : ''}
      <div class="firmas">
        <div class="firma"><div class="firma-espacio"></div><div class="firma-linea"></div><div class="firma-nombre">Gerente que Autoriza<br><strong>${perm.registradoPorNombre}</strong></div></div>
        <div class="firma"><div class="firma-espacio"></div><div class="firma-linea"></div><div class="firma-nombre">Colaborador<br><strong>${_toTitle(perm.empleadoNombre)}</strong></div></div>
      </div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Permiso Laboral</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 216mm; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 11px; color: #000; }
  .pagina { width: 216mm; height: 279mm; padding: 0; display: flex; flex-direction: column; }
  .bloque { width: 100%; height: 139.5mm; padding: 10mm 15mm; display: flex; flex-direction: column; gap: 4px; }
  .corte { border-top: 1px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #999; letter-spacing: 1px; padding: 1mm 0; }
  .encabezado { border-bottom: 2px solid #1B3FAB; padding-bottom: 6px; margin-bottom: 8px; }
  .enc-titulo { font-size: 12px; font-weight: bold; color: #1B3FAB; }
  .enc-sub { font-size: 9px; color: #666; }
  .titulo-doc { text-align: center; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 6px 0; }
  .fila { display: flex; align-items: baseline; margin-bottom: 4px; flex-wrap: wrap; gap: 4px; }
  .etq { font-weight: bold; min-width: 120px; font-size: 10px; }
  .val { border-bottom: 1px solid #999; flex: 1; min-width: 100px; padding-bottom: 1px; font-size: 10px; }
  .opciones { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
  .opcion { display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .cuadro { width: 12px; height: 12px; border: 1px solid #333; display: flex; align-items: center; justify-content: center; font-size: 9px; flex-shrink: 0; }
  .firmas { display: flex; justify-content: space-around; margin-top: auto; padding-top: 8px; }
  .firma { text-align: center; flex: 1; padding: 0 10px; }
  .firma-espacio { height: 30px; }
  .firma-linea { border-top: 1px solid #000; margin-bottom: 3px; }
  .firma-nombre { font-size: 9px; }
  @media print {
    html, body { width: 216mm; }
    .pagina { page-break-after: avoid; }
    @page { size: letter; margin: 0; }
  }
</style>
</head>
<body>
<div class="pagina">
  ${bloquePermiso('Copia Empresa')}
  <div class="corte">✂ &nbsp; CORTAR Y ENTREGAR COPIA AL COLABORADOR &nbsp; ✂</div>
  ${bloquePermiso('Copia Colaborador')}
</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

async function _renderHistorial(){
  const wrap = document.getElementById('perm-hist-wrap');
  if (!wrap) return;
  // Causa raíz: getByArea() es frágil (capitalización). Usar getAll() + filter igual que incidencias
  const isAdm = Session.isAdmin() || Session.isDireccion();
  const area  = isAdm ? null : Session.getArea();
  const todos = await DB_Permisos.getAll();
  const permisos = (area
    ? todos.filter(p => (p.empleadoArea||'').toLowerCase() === area.toLowerCase())
    : todos
  ).sort((a,b) => b.timestamp - a.timestamp);

  if (!permisos.length) {
    wrap.innerHTML = `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><p>Sin permisos registrados</p></div>`;
    return;
  }
  wrap.innerHTML = permisos.map(p => `
    <div class="inc-card" style="margin-bottom:10px">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name">${_toTitle(p.empleadoNombre)}</div>
          <div class="inc-card-meta">
            <span>${p.empleadoArea}</span>
            <span>${_fmtFecha(p.fechaIni)} — ${_fmtFecha(p.fechaFin)}</span>
          </div>
        </div>
        <span class="inc-chip">${p.tipo?.replace('Permiso ','') || '—'}</span>
      </div>
      <div style="font-size:12px;color:var(--text3)">${p.motivo} · Registró: ${p.registradoPorNombre}</div>
      <button class="btn-ghost" data-reimp-perm="${p.id}" style="font-size:12px;padding:5px 10px;margin-top:6px">🖨 Reimprimir</button>
    </div>
  `).join('');
}

async function _attachEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-perm-nuevo').classList.toggle('hidden', tab !== 'nuevo');
      document.getElementById('tab-perm-historial').classList.toggle('hidden', tab !== 'historial');
      if (tab === 'historial') _renderHistorial();
    });
  });

  const input = document.getElementById('perm-emp-input');
  const list  = document.getElementById('perm-emp-list');
  input?.addEventListener('input', async () => {
    const q = input.value.trim();
    if (!q) { list.classList.add('hidden'); return; }
    let res = await DB_Empleados.search(q);
    if (!Session.isAdmin() && !Session.isDireccion()) res = res.filter(e => e.area === Session.getArea());
    res = res.slice(0,8);
    list.innerHTML = res.map(e =>
      `<div class="autocomplete-item" data-id="${e.id}">${_toTitle(e.nombre)} <span>${e.area}</span></div>`
    ).join('');
    list.classList.toggle('hidden', !res.length);
  });

  list?.addEventListener('click', async e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const emp = await DB_Empleados.getById(item.dataset.id);
    if (!emp) return;
    document.getElementById('perm-emp-id').value = emp.id;
    input.value = _toTitle(emp.nombre);
    input._empData = emp;
    list.classList.add('hidden');
    document.getElementById('perm-emp-info').classList.remove('hidden');
    document.getElementById('perm-emp-nombre-disp').textContent = _toTitle(emp.nombre);
    document.getElementById('perm-emp-puesto-disp').textContent = `${_toTitle(emp.puesto)} — ${emp.area}`;
  });

  if (window._permisosClickHandler) document.removeEventListener('click', window._permisosClickHandler);
  window._permisosClickHandler = e => {
    if (!e.target.closest('#perm-emp-input') && !e.target.closest('#perm-emp-list')) {
      list?.classList.add('hidden');
    }
  };
  document.addEventListener('click', window._permisosClickHandler);

  if (Session.isDireccion()) { document.getElementById('btn-guardar-perm')?.remove(); return; }
  document.getElementById('btn-guardar-perm')?.addEventListener('click', async () => {
    const empId = document.getElementById('perm-emp-id').value;
    if (!empId) { toastError('Selecciona un colaborador'); return; }
    const empData = input._empData;
    const motivo  = document.getElementById('perm-motivo').value;
    const tipo    = document.getElementById('perm-tipo').value;
    const fechaIni = document.getElementById('perm-fecha-ini').value;
    const fechaFin = document.getElementById('perm-fecha-fin').value;
    if (!motivo)   { toastError('Selecciona el motivo'); return; }
    if (!tipo)     { toastError('Selecciona el tipo de permiso'); return; }
    if (!fechaIni) { toastError('Indica la fecha de inicio'); return; }
    const perm = {
      empleadoId: empId, empleadoNombre: empData.nombre,
      empleadoPuesto: empData.puesto, empleadoArea: empData.area,
      fechaSolicitud: document.getElementById('perm-fecha-sol').value,
      fechaIni, fechaFin: fechaFin || fechaIni,
      motivo, tipo,
      observaciones: document.getElementById('perm-obs').value.trim(),
    };
    await DB_Permisos.add(perm, Session.get());
    toastOk('Permiso registrado');
    setTimeout(() => _generarPDF(perm), 300);
  });

  document.getElementById('tab-perm-historial')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-reimp-perm]');
    if (!btn) return;
    const p = (await DB_Permisos.getAll()).find(x => x.id === btn.dataset.reimpPerm);
    if (p) _generarPDF(p);
  });
}

registerInit('permisos', () => {
  if (!Session.isActive()) { go('login'); return; }
  render();
});
