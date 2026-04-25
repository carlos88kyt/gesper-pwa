// ============================================================
// modules/dashboard/index.js — v15
// Panel con bloque de Pendientes de acción
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Incidencias, DB_Empleados, DB_Actas, DB_Permisos, DB_Compromisos } from '../../core/db.js';

function _toTitle(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function _buildPendientes() {
  const user  = Session.get();
  const isAdm = Session.isAdmin() || Session.isDireccion();
  const area  = isAdm ? null : Session.getArea();
  const items = [];

  // Incidencias sin seguimiento (activas o en_seguimiento, sin notas en bitácora)
  const todasIncs = (await DB_Incidencias.getAll())
    .filter(i => i.estado === 'activa' || i.estado === 'en_seguimiento');
  const sinSeguimiento = (area ? todasIncs.filter(i => i.area === area) : todasIncs)
    .filter(i => !i.bitacora || i.bitacora.length === 0);
  if (sinSeguimiento.length > 0) {
    items.push({
      nivel: sinSeguimiento.length >= 3 ? 'err' : 'warn',
      icono: '📝',
      texto: `${sinSeguimiento.length} incidencia${sinSeguimiento.length > 1 ? 's' : ''} sin seguimiento`,
      accion: 'Ver',
      ruta: '_incidencias_pendientes',
    });
  }

  // Actas sin confirmar recibida
  const todasActas = await DB_Actas.getAll();
  const actasSinConfirmar = (area ? todasActas.filter(a => a.empleadoArea === area) : todasActas)
    .filter(a => !a.recibidaConfirmada);
  if (actasSinConfirmar.length > 0) {
    items.push({
      nivel: 'err',
      icono: '📄',
      texto: `${actasSinConfirmar.length} acta${actasSinConfirmar.length > 1 ? 's' : ''} sin confirmar recibida`,
      accion: 'Ver',
      ruta: '_actas_pendientes',
    });
  }

  // Evaluaciones pendientes en ciclo activo (solo admin)
  if (isAdm && !Session.isDireccion()) {
    try {
      const { DB_EvalCiclos, DB_Evaluaciones } = await import('../../core/db.js');
      const ciclo = await DB_EvalCiclos.getActivo();
      if (ciclo) {
        const evals = await DB_Evaluaciones.getByCiclo(ciclo.id);
        const evalPend = evals.filter(e => e.estado === 'borrador').length;
        if (evalPend > 0) {
          items.push({
            nivel: 'info', icono: '📊',
            texto: `${evalPend} evaluación${evalPend>1?'es':''} pendiente${evalPend>1?'s':''} — ${ciclo.nombre}`,
            accion: 'Ver', ruta: 'evaluacion',
          });
        }
      }
    } catch(e) { /* silencioso */ }
  }

  // Cartas compromiso vencidas
  const todasComps = await DB_Compromisos.getAll();
  const hoyStr     = new Date().toISOString().split('T')[0];
  const compArea   = isAdm ? todasComps : todasComps.filter(c => (c.empleadoArea||'').toLowerCase() === (area||'').toLowerCase());
  const compsVenc  = compArea.filter(c => c.estado === 'en_seguimiento' && c.fechaLimite < hoyStr);
  if (compsVenc.length > 0) {
    items.push({
      nivel: 'warn',
      icono: '📋',
      texto: `${compsVenc.length} carta${compsVenc.length>1?'s':''} compromiso vencida${compsVenc.length>1?'s':''}`,
      accion: 'Ver',
      ruta:   'compromisos',
    });
  }

  // Permisos de esta semana
  const hoy  = Date.now();
  const semana = 7 * 86400000;
  const todosPerms = await DB_Permisos.getAll();
  const permsSemana = (area ? todosPerms.filter(p => p.empleadoArea === area) : todosPerms)
    .filter(p => {
      const ini = new Date(p.fechaIni).getTime();
      return ini >= hoy - semana && ini <= hoy + semana;
    });
  if (permsSemana.length > 0) {
    items.push({
      nivel: 'info',
      icono: '📅',
      texto: `${permsSemana.length} permiso${permsSemana.length > 1 ? 's' : ''} activo${permsSemana.length > 1 ? 's' : ''} esta semana`,
      accion: 'Ver',
      ruta: '_permisos_activos',
    });
  }

  // Admin — actas sin sanción con historial previo
  if (isAdm) {
    const actasSinSancion = todasActas.filter(a => !a.sancion || a.sancion === 'ninguna');
    const porEmp = {};
    actasSinSancion.forEach(a => {
      porEmp[a.empleadoId] = (porEmp[a.empleadoId] || 0) + 1;
    });
    const multiples = Object.values(porEmp).filter(c => c >= 2).length;
    if (multiples > 0) {
      items.push({
        nivel: 'err',
        icono: '⚠️',
        texto: `${multiples} colaborador${multiples > 1 ? 'es' : ''} con múltiples actas sin sanción`,
        accion: 'Revisar',
        ruta: 'reportes',
      });
    }
  }

  if (!items.length) {
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">✅ Pendientes</span></div>
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--success)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Sin pendientes — todo al día
        </div>
      </div>`;
  }

  const colorMap = { err: 'var(--error)', warn: 'var(--warning)', info: 'var(--info)' };
  const bgMap    = { err: 'var(--error-lite)', warn: 'var(--warning-lite)', info: 'var(--info-lite)' };

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span class="card-title">⚠ Pendientes</span>
        <span style="background:var(--warning);color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">${items.length}</span>
      </div>
      ${items.map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="width:8px;height:8px;border-radius:50%;background:${colorMap[item.nivel]};box-shadow:0 0 5px ${colorMap[item.nivel]};flex-shrink:0"></div>
          <div style="flex:1;font-size:13px;color:var(--text2)">${item.icono} ${item.texto}</div>
          <button class="pend-accion-btn"
            data-ruta="${item.ruta}"
            data-htab="${item.htab || ''}"
            data-empid="${item.empId || ''}"
            data-empnombre="${item.empNombre || ''}"
            style="background:transparent;border:1px solid var(--border2);border-radius:6px;color:var(--accent);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;font-family:inherit">
            ${item.accion} →
          </button>
        </div>`).join('')}
    </div>`;
}

async function render() {
  const user  = Session.get();
  const isAdm = Session.isAdmin() || Session.isDireccion();
  const area  = isAdm ? null : Session.getArea();
  const kpis  = await DB_Incidencias.getKPIs(area);
  const _todosEmp = await DB_Empleados.getAll();
  const miUsuario = Session.getUsuario();
  const totalEmp  = isAdm
    ? _todosEmp.length
    : _todosEmp.filter(e => e.area === area && e.usuario !== miUsuario).length;

  document.getElementById('sec-dashboard').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Hola, ${user.nombre.split(' ')[0]} 👋</h1>
        <p>${isAdm ? 'Panel de administración — Vista global' : `Gerente de ${area}`}</p>
      </div>

      ${kpis.reincidencias.length > 0 ? `
      <div class="reincidence-alert" style="margin-bottom:16px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ${kpis.reincidencias.length} alerta${kpis.reincidencias.length > 1 ? 's' : ''} de reincidencia
      </div>` : ''}

      <div class="kpi-grid">
        <div class="kpi-card kpi-primary">
          <div class="kpi-label">Incidencias (30d)</div>
          <div class="kpi-value ${kpis.total > 10 ? 'kpi-warn' : ''}">${kpis.total}</div>
          <div class="kpi-sub">${kpis.delta !== null ? `${kpis.delta > 0 ? '+' : ''}${kpis.delta}% vs mes ant.` : 'Este mes'}</div>
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
          <div class="kpi-label">Plantilla</div>
          <div class="kpi-value">${totalEmp}</div>
          <div class="kpi-sub">Colaboradores</div>
        </div>
      </div>

      ${await _buildPendientes()}

      ${kpis.rankingEmp.length > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title">Top incidencias (30d)</span>
          <span style="font-size:11px;color:var(--text3)">Toca un nombre para ver historial</span>
        </div>
        ${kpis.rankingEmp.map((e,i) => `
          <div class="rank-item rank-clickable" data-emp-nombre="${e.nombre}" style="cursor:pointer">
            <div class="rank-num ${i===0?'rank-1':''}">${i+1}</div>
            <div style="flex:1">
              <div class="rank-name" style="color:var(--accent)">${_toTitle(e.nombre)}</div>
              <div class="rank-sub">${e.area}</div>
            </div>
            <div class="rank-count">${e.count}</div>
          </div>`).join('')}
      </div>` : `
      <div class="card" style="margin-bottom:16px">
        <div class="empty-state" style="padding:28px 24px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
          <p>Sin incidencias en los últimos 30 días</p>
        </div>
      </div>`}

      <!-- Documentos institucionales — todos los roles -->
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">📁 Documentos</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn-ghost" id="dash-rit" style="justify-content:center;font-size:13px">📋 Reglamento RIT</button>
          <button class="btn-ghost" id="dash-etica" style="justify-content:center;font-size:13px">📘 Código de Ética</button>
        </div>
      </div>

      ${isAdm ? `
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><span class="card-title">Administración</span></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${!Session.isDireccion() ? `<button class="btn-ghost" id="dash-personal" style="justify-content:center">👤 Gestión de personal</button>` : ""}
          <button class="btn-ghost" id="dash-reportes" style="justify-content:center">📊 Reportes y métricas</button>
        </div>
      </div>` : ''}
    </div>
  `;

  _attachEvents();
}

async function _mostrarIncidenciasPendientes() {
  const area = (Session.isAdmin() || Session.isDireccion()) ? null : Session.getArea();
  const todas = await DB_Incidencias.getAll();
  const sinSeg = todas
    .filter(i => (i.estado === 'activa' || i.estado === 'en_seguimiento') && (!i.bitacora || i.bitacora.length === 0))
    .filter(i => area ? i.area === area : true);

  // Group by employee
  const porEmp = {};
  sinSeg.forEach(i => {
    if (!porEmp[i.empleadoId]) {
      porEmp[i.empleadoId] = { id: i.empleadoId, nombre: i.empleadoNombre, area: i.area, items: [] };
    }
    porEmp[i.empleadoId].items.push(i);
  });
  const lista = Object.values(porEmp).sort((a,b) => b.items.length - a.items.length);

  const modal = document.createElement('div');
  modal.id = 'modal-inc-pend';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);width:100%;max-width:600px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:20px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text1)">📝 Incidencias sin seguimiento</div>
        <button id="btn-close-inc-pend" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
      </div>
      ${lista.map(e => `
        <div class="rank-item rank-clickable" data-emp-id="${e.id}"
          style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;background:var(--surface2)">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(217,119,6,.1);border:1px solid var(--warning);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--warning);flex-shrink:0">
            ${e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--accent)">${_toTitle(e.nombre)}</div>
            <div style="font-size:11px;color:var(--text3)">${e.area} · ${e.items.length} incidencia${e.items.length>1?'s':''}</div>
          </div>
          <div style="font-size:12px;color:var(--accent);font-weight:600">Ver →</div>
        </div>`).join('')}
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#btn-close-inc-pend').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelectorAll('[data-emp-id]').forEach(item => {
    item.addEventListener('click', () => {
      modal.remove();
      go('historial', { empId: item.dataset.empId, htab: 'incidencias' });
    });
  });
}

async function _mostrarActasPendientes() {
  const area = (Session.isAdmin() || Session.isDireccion()) ? null : Session.getArea();
  const todasActas = await DB_Actas.getAll();
  const actas = todasActas
    .filter(a => !a.recibidaConfirmada && !a.cancelada)
    .filter(a => area ? a.empleadoArea === area : true);

  // Agrupar por colaborador
  const porEmp = {};
  actas.forEach(a => {
    if (!porEmp[a.empleadoId]) {
      porEmp[a.empleadoId] = { id: a.empleadoId, nombre: a.empleadoNombre, area: a.empleadoArea, count: 0 };
    }
    porEmp[a.empleadoId].count++;
  });
  const lista = Object.values(porEmp).sort((a,b) => b.count - a.count);

  const modal = document.createElement('div');
  modal.id = 'modal-actas-pend';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);width:100%;max-width:600px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:20px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text1)">📄 Actas sin confirmar recibida</div>
        <button id="btn-close-actas-pend" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
      </div>
      ${lista.map(e => `
        <div class="rank-item rank-clickable" data-emp-id="${e.id}"
          style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;background:var(--surface2)">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--error-lite);border:1px solid var(--error);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--error);flex-shrink:0">
            ${e.nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--accent)">${e.nombre.toLowerCase().replace(/\w/g,c=>c.toUpperCase())}</div>
            <div style="font-size:11px;color:var(--text3)">${e.area}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--error)">${e.count} acta${e.count>1?'s':''}</div>
          <div style="font-size:12px;color:var(--accent);font-weight:600">Ver →</div>
        </div>`).join('')}
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#btn-close-actas-pend').addEventListener('click', async () => modal.remove());
  modal.addEventListener('click', async e => { if (e.target === modal) modal.remove(); });
  modal.querySelectorAll('[data-emp-id]').forEach(item => {
    item.addEventListener('click', async () => {
      modal.remove();
      go('historial', { empId: item.dataset.empId, htab: 'actas' });
    });
  });
}

async function _mostrarPermisosActivos() {
  const area   = (Session.isAdmin() || Session.isDireccion()) ? null : Session.getArea();
  const semana = 7 * 86400000;
  const hoy    = Date.now();
  const todos  = await DB_Permisos.getAll();
  const activos = todos.filter(p => {
    const ini = new Date(p.fechaIni).getTime();
    return ini >= hoy - semana && ini <= hoy + semana && (area ? p.empleadoArea === area : true);
  }).sort((a,b) => new Date(a.fechaIni) - new Date(b.fechaIni));

  const modal = document.createElement('div');
  modal.id = 'modal-permisos-act';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface);width:100%;max-width:600px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:20px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text1)">📅 Permisos activos esta semana</div>
        <button id="btn-close-permisos-act" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
      </div>
      ${activos.length === 0 ? '<div style="text-align:center;padding:24px;color:var(--text3)">Sin permisos esta semana</div>' :
        activos.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;background:var(--surface2)">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#7C3AED;flex-shrink:0">
            ${(p.empleadoNombre||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text1)">${_toTitle(p.empleadoNombre||'')}</div>
            <div style="font-size:11px;color:var(--text3)">${p.empleadoArea} · ${p.tipo||''}</div>
            <div style="font-size:11px;color:var(--text3)">${p.fechaIni}${p.fechaFin && p.fechaFin !== p.fechaIni ? ' → '+p.fechaFin : ''}</div>
          </div>
        </div>`).join('')}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#btn-close-permisos-act').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function _attachEvents() {
  // Pendientes — botones de acción con navegación inteligente
  document.querySelectorAll('.pend-accion-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.ruta === '_actas_pendientes') {
        _mostrarActasPendientes();
        return;
      }
      if (btn.dataset.ruta === '_incidencias_pendientes') {
        _mostrarIncidenciasPendientes();
        return;
      }
      if (btn.dataset.ruta === '_permisos_activos') {
        _mostrarPermisosActivos();
        return;
      }
      go(btn.dataset.ruta, {
        empId:     btn.dataset.empid     || null,
        htab:      btn.dataset.htab      || null,
        empNombre: btn.dataset.empnombre || null,
      });
    });
  });

  // Top incidencias — click en nombre
  document.querySelectorAll('.rank-clickable').forEach(item => {
    item.addEventListener('click', async () => {
      go('historial', { empNombre: item.dataset.empNombre });
    });
  });

  document.getElementById('dash-rit')?.addEventListener('click', async () => go('documentos', { sub: 'rit' }));
  document.getElementById('dash-etica')?.addEventListener('click', async () => go('documentos', { sub: 'etica' }));
  document.getElementById('dash-personal')?.addEventListener('click', async () => go('personal'));
  document.getElementById('dash-reportes')?.addEventListener('click', async () => go('reportes'));
}

registerInit('dashboard', () => {
  if (!Session.isActive()) { go('login'); return; }
  render();
});
