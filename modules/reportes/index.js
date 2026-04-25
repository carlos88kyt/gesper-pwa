// ============================================================
// modules/reportes/index.js — v13
// Métricas completas + alertas de actas sin sanción
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Incidencias, DB_Empleados, DB_Actas, DB_Permisos } from '../../core/db.js';
import { TIPOS_INCIDENCIA, AGENCIA, CIUDAD } from '../../core/config.js';
import { toastOk, toastError, toastWarn } from '../../core/toast.js';

let _pendingEmpleados = null;

function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function _detectarAlertasActas() {
  const todasActas = await DB_Actas.getAll();
  const alertas = [];

  // Agrupar por empleado
  const porEmp = {};
  todasActas.forEach(a => {
    if (!porEmp[a.empleadoId]) porEmp[a.empleadoId] = { nombre: a.empleadoNombre, area: a.empleadoArea, actas: [] };
    porEmp[a.empleadoId].actas.push(a);
  });

  Object.values(porEmp).forEach(emp => {
    const sinSancion = emp.actas.filter(a => !a.sancion || a.sancion === 'ninguna');
    const conSancion = emp.actas.filter(a => a.sancion && a.sancion !== 'ninguna');

    // Alerta: múltiples actas sin sanción
    if (sinSancion.length >= 2) {
      alertas.push({
        tipo: 'multiple_sin_sancion',
        nivel: 'error',
        empleado: emp.nombre,
        area: emp.area,
        msg: `${sinSancion.length} actas sin sanción aplicada — posible falta de seguimiento`,
      });
    }

    // Alerta: falta grave sin sanción
    const CAUSALES = ['conflicto','uso_indebido','confidencialidad','mala_atencion'];
    const graveSinSancion = emp.actas.filter(a =>
      CAUSALES.includes(a.tipoFaltaId) && (!a.sancion || a.sancion === 'ninguna')
    );
    if (graveSinSancion.length > 0) {
      alertas.push({
        tipo: 'grave_sin_sancion',
        nivel: 'error',
        empleado: emp.nombre,
        area: emp.area,
        msg: `Falta grave (${graveSinSancion[0].tipoFaltaNombre || 'causal de rescisión'}) sin sanción aplicada`,
      });
    }
  });

  // Alerta por gerente: muchas actas sin sanción
  const porGerente = {};
  todasActas.forEach(a => {
    if (!porGerente[a.registradoPor]) porGerente[a.registradoPor] = { nombre: a.levantaActa, total: 0, sinSancion: 0 };
    porGerente[a.registradoPor].total++;
    if (!a.sancion || a.sancion === 'ninguna') porGerente[a.registradoPor].sinSancion++;
  });
  Object.values(porGerente).forEach(g => {
    if (g.total >= 3 && g.sinSancion === g.total) {
      alertas.push({
        tipo: 'gerente_sin_sanciones',
        nivel: 'warning',
        empleado: g.nombre,
        area: 'Gerente',
        msg: `${g.nombre} tiene ${g.total} actas sin ninguna sanción aplicada — revisar criterio`,
      });
    }
  });

  return alertas;
}

async function render() {
  const kpis       = await DB_Incidencias.getKPIs();
  const inc30      = await DB_Incidencias.getRecientes(30);
  const todasActas = await DB_Actas.getAll();
  const totalEmp   = (await DB_Empleados.getAll()).length;
  const totalActas = todasActas.length;
  const actasSinSancion = todasActas.filter(a => !a.sancion || a.sancion === 'ninguna').length;
  const actasConSancion = totalActas - actasSinSancion;
  const totalPermisos = (await DB_Permisos.getAll()).length;
  const alertas = _detectarAlertasActas();

  const AREAS = ['Ventas','Servicio','Administrativo','Refacciones','Marketing','Seminuevos'];
  const porArea = AREAS.map(a => ({ area: a, count: inc30.filter(i => i.area === a).length }));
  const maxArea = Math.max(...porArea.map(a => a.count), 1);

  // Por tipo de falta en actas
  const porTipoActa = {};
  todasActas.forEach(a => {
    const k = a.tipoFaltaNombre || 'Sin tipo';
    porTipoActa[k] = (porTipoActa[k] || 0) + 1;
  });
  const tiposActaSorted = Object.entries(porTipoActa).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxTipoActa = Math.max(...tiposActaSorted.map(t=>t[1]), 1);

  // Por tipo incidencias
  const porTipo = {};
  inc30.forEach(i => { porTipo[i.tipoNombre] = (porTipo[i.tipoNombre] || 0) + 1; });
  const tiposSorted = Object.entries(porTipo).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxTipo = Math.max(...tiposSorted.map(t=>t[1]), 1);

  document.getElementById('sec-reportes').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Reportes y Métricas</h1>
        <p>Solo visible para Administración</p>
      </div>

      <!-- KPIs generales -->
      <div class="kpi-grid" style="margin-bottom:20px">
        <div class="kpi-card kpi-primary">
          <div class="kpi-label">Incidencias (30d)</div>
          <div class="kpi-value">${kpis.total}</div>
          <div class="kpi-sub">${kpis.delta !== null ? `${kpis.delta>0?'+':''}${kpis.delta}% vs anterior` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Alta gravedad</div>
          <div class="kpi-value ${kpis.altas > 0 ? 'kpi-err' : 'kpi-ok'}">${kpis.altas}</div>
          <div class="kpi-sub">Últimos 30 días</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Reincidencias</div>
          <div class="kpi-value ${kpis.reincidencias.length > 0 ? 'kpi-err' : 'kpi-ok'}">${kpis.reincidencias.length}</div>
          <div class="kpi-sub">Alertas activas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Personal</div>
          <div class="kpi-value">${totalEmp}</div>
          <div class="kpi-sub">Colaboradores</div>
        </div>
        <div class="kpi-card ${totalActas > 0 ? 'kpi-primary' : ''}">
          <div class="kpi-label">Actas totales</div>
          <div class="kpi-value ${totalActas > 0 ? 'kpi-err' : ''}">${totalActas}</div>
          <div class="kpi-sub">Generadas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Actas sin sanción</div>
          <div class="kpi-value ${actasSinSancion > 0 ? 'kpi-warn' : 'kpi-ok'}">${actasSinSancion}</div>
          <div class="kpi-sub">${actasConSancion} con sanción</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Permisos</div>
          <div class="kpi-value">${totalPermisos}</div>
          <div class="kpi-sub">Registrados</div>
        </div>
      </div>

      <!-- ⚠ ALERTAS DE ACTAS -->
      ${alertas.length > 0 ? `
      <div class="card" style="margin-bottom:16px;border-color:rgba(239,68,68,.3)">
        <div class="card-header">
          <span class="card-title" style="color:var(--error)">⚠ Alertas de actas — ${alertas.length} pendiente${alertas.length>1?'s':''}</span>
        </div>
        ${alertas.map(a => `
          <div class="alert-banner ${a.nivel==='error'?'alert-error':'alert-warn'}" style="margin-bottom:8px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <strong>${_toTitle(a.empleado)}</strong> (${a.area})<br>
              <span style="font-size:11px">${a.msg}</span>
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="alert-banner alert-ok" style="margin-bottom:16px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Sin alertas de actas pendientes
      </div>`}

      <!-- ACTAS — desglose por tipo de falta -->
      ${tiposActaSorted.length > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">📄 Actas por tipo de falta</span></div>
        ${tiposActaSorted.map(([tipo,count]) => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:12px;color:var(--text2)">${tipo}</span>
              <span style="font-size:12px;font-weight:700;color:var(--text1)">${count}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${Math.round(count/maxTipoActa*100)}%;background:var(--error)"></div>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <!-- ACTAS — lista reciente -->
      ${totalActas > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">📋 Actas recientes</span></div>
        ${todasActas.slice().sort((a,b)=>b.timestamp-a.timestamp).slice(0,8).map(a => {
          const sinSancion = !a.sancion || a.sancion === 'ninguna';
          const sancionLabel = {suspension1:'1 día',suspension3:'3 días',suspension7:'1 semana',rescision:'Rescisión'};
          return `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text1)">${_toTitle(a.empleadoNombre)}</div>
              <div style="font-size:11px;color:var(--text3)">${a.empleadoArea} · ${new Date(a.timestamp).toLocaleDateString('es-MX')} · ${a.levantaActa}</div>
              ${a.tipoFaltaNombre ? `<div style="font-size:11px;color:var(--text2)">${a.tipoFaltaNombre}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              ${sinSancion
                ? `<span style="font-size:10px;background:rgba(245,158,11,.15);color:var(--warning);border:1px solid rgba(245,158,11,.3);border-radius:99px;padding:2px 8px">Sin sanción</span>`
                : `<span style="font-size:10px;background:rgba(239,68,68,.15);color:var(--error);border:1px solid rgba(239,68,68,.3);border-radius:99px;padding:2px 8px">${sancionLabel[a.sancion]||a.sancion}</span>`
              }
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Incidencias por área -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">Incidencias por área (30d)</span></div>
        ${porArea.map(a => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:12px;color:var(--text2)">${a.area}</span>
              <span style="font-size:12px;font-weight:700;color:var(--text1)">${a.count}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${Math.round(a.count/maxArea*100)}%;background:var(--primary)"></div>
            </div>
          </div>`).join('')}
      </div>

      <!-- Tipos más frecuentes -->
      ${tiposSorted.length > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">Tipos de incidencia más frecuentes</span></div>
        ${tiposSorted.map(([tipo,count]) => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:12px;color:var(--text2)">${tipo}</span>
              <span style="font-size:12px;font-weight:700;color:var(--text1)">${count}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${Math.round(count/maxTipo*100)}%;background:var(--secondary)"></div>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <!-- Ranking empleados -->
      ${kpis.rankingEmp.length > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">Top colaboradores con incidencias</span></div>
        ${kpis.rankingEmp.map((e,i) => `
          <div class="rank-item">
            <div class="rank-num ${i===0?'rank-1':''}">${i+1}</div>
            <div style="flex:1"><div class="rank-name">${_toTitle(e.nombre)}</div><div class="rank-sub">${e.area}</div></div>
            <div class="rank-count">${e.count}</div>
          </div>`).join('')}
      </div>` : ''}

      <!-- CARGAR PLANTILLA — solo admin -->
      ${!(Session.isDireccion()) ? `<div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">📋 Plantilla de Personal</span></div>
        <p style="font-size:13px;color:var(--text3);margin-bottom:12px">Carga el CSV con la plantilla actualizada.</p>
        <div class="alert-banner alert-info" style="margin-bottom:12px;font-size:12px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Columnas: <b>nombre, puesto, area</b> — Primera fila = encabezados</span>
        </div>
        <div id="upload-drop-zone" style="border:2px dashed var(--border2);border-radius:var(--radius);padding:20px;text-align:center;cursor:pointer;margin-bottom:10px">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="margin-bottom:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p style="font-size:12px;color:var(--text3)">Arrastra CSV o haz clic</p>
          <input type="file" id="input-plantilla" accept=".csv" style="display:none"/>
        </div>
        <div id="upload-preview" class="hidden" style="margin-bottom:10px">
          <div class="alert-banner alert-ok" id="upload-preview-msg"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn-primary" id="btn-cargar-plantilla" disabled style="opacity:.5">Cargar al sistema</button>
          <button class="btn-ghost" id="btn-descargar-plantilla" style="justify-content:center">⬇ Descargar plantilla vacía</button>
        </div>
      </div>` : ''}

      <!-- EXPORTAR -->
      <div class="card">
        <div class="card-header"><span class="card-title">Exportar datos</span></div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          <button class="btn-primary" id="btn-export-csv">⬇ Exportar incidencias CSV</button>
          <button class="btn-ghost" id="btn-export-actas" style="justify-content:center">⬇ Exportar actas CSV</button>
          <button class="btn-ghost" id="btn-export-empleados" style="justify-content:center">⬇ Exportar empleados CSV</button>
        </div>
      </div>
    </div>
  `;
  _attachEvents();
}

function _parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g,''));
  const iN = headers.findIndex(h => h.includes('nombre'));
  const iP = headers.findIndex(h => h.includes('puesto'));
  const iA = headers.findIndex(h => h.includes('area') || h.includes('área'));
  if (iN===-1||iP===-1||iA===-1) return null;
  const empleados = [];
  for (let i=1; i<lines.length; i++) {
    const cols = lines[i].split(',').map(c=>c.trim().replace(/^"|"$/g,''));
    const nombre=cols[iN], puesto=cols[iP], area=cols[iA];
    if (!nombre||!puesto||!area) continue;
    empleados.push({id:`emp_${Date.now()}_${i}`, nombre, puesto, area});
  }
  return empleados.length > 0 ? empleados : null;
}

function _toCSV(rows, headers) {
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [headers.map(esc).join(','), ...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\r\n');
}
function _downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF'+content], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

async function _attachEvents() {
  const dropZone  = document.getElementById('upload-drop-zone');
  const fileInput = document.getElementById('input-plantilla');
  const btnCargar = document.getElementById('btn-cargar-plantilla');
  const preview   = document.getElementById('upload-preview');
  const previewMsg= document.getElementById('upload-preview-msg');

  dropZone?.addEventListener('click', async () => fileInput?.click());
  dropZone?.addEventListener('dragover', async e => { e.preventDefault(); dropZone.style.borderColor='var(--secondary)'; });
  dropZone?.addEventListener('dragleave', async () => { dropZone.style.borderColor='var(--border2)'; });
  dropZone?.addEventListener('drop', async e => { e.preventDefault(); dropZone.style.borderColor='var(--border2)'; if(e.dataTransfer.files[0]) _readFile(e.dataTransfer.files[0]); });
  fileInput?.addEventListener('change', async e => { if(e.target.files[0]) _readFile(e.target.files[0]); });

  function _readFile(file) {
    if (!file.name.endsWith('.csv')) { toastError('Solo archivos CSV'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = _parseCSV(e.target.result);
      if (!parsed) { toastError('No se pudo leer. Verifica columnas: nombre, puesto, area'); return; }
      _pendingEmpleados = parsed;
      if (previewMsg) previewMsg.innerHTML = `<b>✓ ${parsed.length} empleados detectados</b>`;
      preview?.classList.remove('hidden');
      if (btnCargar) { btnCargar.disabled=false; btnCargar.style.opacity='1'; }
      toastOk(`${parsed.length} empleados listos para cargar`);
    };
    reader.readAsText(file,'UTF-8');
  }

  btnCargar?.addEventListener('click', async () => {
    if (!_pendingEmpleados) return;
    if (!confirm(`¿Confirmas cargar ${_pendingEmpleados.length} empleados?`)) return;
    for (const emp of _pendingEmpleados) { await DB_Empleados.add(emp); }
    toastOk(`✓ ${_pendingEmpleados.length} empleados cargados`);
    _pendingEmpleados = null;
    preview?.classList.add('hidden');
    if (btnCargar) { btnCargar.disabled=true; btnCargar.style.opacity='.5'; }
    setTimeout(() => render(), 800);
  });

  document.getElementById('btn-descargar-plantilla')?.addEventListener('click', async () => {
    const blob = new Blob(['\uFEFF'+'nombre,puesto,area\nEjemplo Empleado,Asesor de Ventas,Ventas\n'],{type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='plantilla_personal_vw.csv'; a.click();
    toastOk('Plantilla descargada');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    const all = await DB_Incidencias.getAll();
    if (!all.length) { toastWarn('Sin incidencias para exportar'); return; }
    const rows = all.map(i => ({Fecha:new Date(i.timestamp).toLocaleDateString('es-MX'),Empleado:i.empleadoNombre,Puesto:i.puesto,Area:i.area,Tipo:i.tipoNombre,Gravedad:i.gravedad,Descripcion:i.descripcion,Estado:i.estado,Testigos:i.testigos||'',RegistradoPor:i.registradoPorNombre}));
    _downloadCSV(_toCSV(rows,['Fecha','Empleado','Puesto','Area','Tipo','Gravedad','Descripcion','Estado','Testigos','RegistradoPor']),`incidencias_${new Date().toISOString().split('T')[0]}.csv`);
    toastOk('Descargado');
  });

  document.getElementById('btn-export-actas')?.addEventListener('click', async () => {
    const all = await DB_Actas.getAll();
    if (!all.length) { toastWarn('Sin actas para exportar'); return; }
    const rows = all.map(a => ({
      Fecha: a.fecha, Hora: a.hora,
      Empleado: a.empleadoNombre, Puesto: a.empleadoPuesto, Area: a.empleadoArea,
      TipoFalta: a.tipoFaltaNombre || '', Articulo: a.articulo,
      Sancion: a.sancion || 'ninguna', Resolucion: a.resolucion || '',
      Replica: a.replica || '', LevantaActa: a.levantaActa,
      Recibida: a.recibidaConfirmada ? `Sí — ${a.recibidaPor}` : 'No',
    }));
    _downloadCSV(_toCSV(rows,['Fecha','Hora','Empleado','Puesto','Area','TipoFalta','Articulo','Sancion','Resolucion','Replica','LevantaActa','Recibida']),`actas_${new Date().toISOString().split('T')[0]}.csv`);
    toastOk('Descargado');
  });

  document.getElementById('btn-export-empleados')?.addEventListener('click', async () => {
    const all  = await DB_Empleados.getAll();
    const incs = await DB_Incidencias.getAll();
    const actas= await DB_Actas.getAll();
    const rows = all.map(e => ({
      nombre: e.nombre, puesto: e.puesto, area: e.area,
      incidencias_activas: incs.filter(i=>i.empleadoId===e.id&&i.estado==='activa').length,
      actas_total: actas.filter(a=>a.empleadoId===e.id).length,
    }));
    _downloadCSV(_toCSV(rows,['nombre','puesto','area','incidencias_activas','actas_total']),`empleados_${new Date().toISOString().split('T')[0]}.csv`);
    toastOk('Descargado');
  });
}

registerInit('reportes', () => {
  if (!Session.isActive()) { go('login'); return; }
  if (!(Session.isAdmin() || Session.isDireccion()))  { go('dashboard'); return; }
  render();
});
