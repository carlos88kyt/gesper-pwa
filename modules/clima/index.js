// ============================================================
// modules/clima/index.js — Panel Admin Clima Laboral v1.0
// Integrado en VW Índice RH PWA
// ============================================================

import { registerInit }   from '../../core/router.js';
import { Session }        from '../../core/auth.js';
import { db, collection, doc, getDocs, addDoc, updateDoc,
         query, where, orderBy, onSnapshot, Timestamp }
  from '../../core/firebase.js';
import { toastOk, toastError } from '../../core/toast.js';

// ── Preguntas de riesgo (invertidas en scoring) ────────────
const RISK_IDS = new Set(['l4','c2','w3','a2','g3','s2','s5','p2','p3','p4','p6']);

const SECCIONES_META = [
  { id:'s1', label:'Liderazgo',        emoji:'👤', color:'#1B3FAB' },
  { id:'s2', label:'Comunicación',     emoji:'💬', color:'#0284C7' },
  { id:'s3', label:'Carga/Estrés',     emoji:'⚖️', color:'#D97706' },
  { id:'s4', label:'Ambiente',         emoji:'🤝', color:'#059669' },
  { id:'s5', label:'Reconocimiento',   emoji:'🚀', color:'#7C3AED' },
  { id:'s6', label:'Satisfacción',     emoji:'😊', color:'#DB2777' },
  { id:'s7', label:'Seg. Psicológica', emoji:'🛡️', color:'#DC2626' },
];

const DEPTOS = {
  ventas:'Ventas & Marketing', servicio:'Servicio',
  seminuevos:'Seminuevos', administrativos:'Administrativos'
};

// ── Estado local ────────────────────────────────────────────
let _periodos    = [];
let _periodoSel  = null;
let _respuestas  = [];
let _evidencias  = [];
let _tabActual   = 'dashboard';
let _unsubRsp    = null;
let _unsubEvi    = null;

// ============================================================
// INIT
// ============================================================
registerInit('clima', async (params) => {
  // Verificar sesión activa — igual que todos los módulos del proyecto
  const { go } = await import('../../core/router.js');
  if (!Session.isActive()) { go('login'); return; }

  const sec = document.getElementById('sec-clima');
  if (!sec) return;
  sec.innerHTML = _buildShell();
  _bindShell();
  await _loadPeriodos();
  _renderTab('dashboard');
});

// ============================================================
// HTML SHELL
// ============================================================
function _buildShell() {
  return `
<div class="page-clima" style="height:calc(100dvh - var(--topbar-h) - var(--bottom-nav-h));overflow-y:auto">
  <div style="max-width:900px;margin:0 auto;padding:16px 14px 24px">

    <!-- Header -->
    <div class="sec-header">
      <h1 style="display:flex;align-items:center;gap:8px">
        <span style="font-size:22px">🌡️</span> Clima Laboral
      </h1>
      <p>Panel de evaluación y análisis — NOM-035-STPS-2018</p>
    </div>

    <!-- Selector de periodo + botón crear -->
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
      <select id="cl-sel-periodo" class="field-input field-select" style="flex:1;min-width:200px">
        <option value="">— Selecciona un periodo —</option>
      </select>
      ${Session.isAdmin() ? `
      <button id="cl-btn-new-periodo" class="btn-ghost" style="white-space:nowrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Nuevo periodo
      </button>
      ` : ''}
      <button id="cl-btn-link" class="btn-ghost" style="white-space:nowrap" title="Copiar link de encuesta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Link encuesta
      </button>
    </div>

    <!-- Alert periodo inactivo -->
    <div id="cl-alert-noperiodo" class="alert-banner alert-warn" style="display:none;margin-bottom:16px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Selecciona un periodo para ver los datos, o crea uno nuevo para comenzar una evaluación.
    </div>

    <!-- Tab bar -->
    <div class="tab-bar" id="cl-tabs" style="margin-bottom:18px">
      <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
      <button class="tab-btn" data-tab="participacion">Participación</button>
      <button class="tab-btn" data-tab="departamentos">Por área</button>
      <button class="tab-btn" data-tab="riesgos">Señales</button>
      <button class="tab-btn" data-tab="abiertas">Abiertas</button>
      <button class="tab-btn" data-tab="exportar">Exportar</button>
    </div>

    <!-- Content area -->
    <div id="cl-content"></div>

  </div>
</div>

<!-- Modal: nuevo periodo -->
<div id="cl-modal-periodo" class="modal-overlay hidden">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">Nuevo periodo de evaluación</span>
      <button class="modal-close" id="cl-modal-close-periodo">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label class="field-label">Nombre del periodo</label>
        <input id="cl-p-nombre" class="field-input" placeholder="Ej: Evaluación Q2 2026" type="text"/>
      </div>
      <div class="fields-grid">
        <div class="field-group">
          <label class="field-label">Fecha de inicio</label>
          <input id="cl-p-inicio" class="field-input" type="date"/>
        </div>
        <div class="field-group">
          <label class="field-label">Fecha de cierre</label>
          <input id="cl-p-fin" class="field-input" type="date"/>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Total esperado de participantes</label>
        <input id="cl-p-total" class="field-input" type="number" min="1" placeholder="Ej: 25"/>
      </div>
      <button class="btn-primary btn-full" id="cl-btn-crear-periodo">Crear periodo</button>
    </div>
  </div>
</div>

<!-- Modal: confirmar ver consultora -->
<div id="cl-modal-consultora" class="modal-overlay hidden">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">⚠️ Sección confidencial</span>
      <button class="modal-close" id="cl-modal-close-consultora">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:14px;color:var(--text2);line-height:1.6">
        Las respuestas de la sección <strong>Evaluación: Consultora de Experiencia</strong> son de carácter confidencial. Solo deben ser revisadas por la responsable de RH.<br><br>
        ¿Confirmas que eres la persona autorizada para ver este contenido?
      </p>
      <button class="btn-primary btn-full" id="cl-btn-confirm-consultora">Sí, soy la responsable de RH</button>
    </div>
  </div>
</div>
`;
}

// ============================================================
// BIND SHELL EVENTS
// ============================================================
function _bindShell() {
  // Tabs
  document.getElementById('cl-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('#cl-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _tabActual = btn.dataset.tab;
    _renderTab(_tabActual);
  });

  // Selector periodo
  document.getElementById('cl-sel-periodo')?.addEventListener('change', async e => {
    const id = e.target.value;
    _periodoSel = _periodos.find(p => p.id === id) || null;
    document.getElementById('cl-alert-noperiodo').style.display = _periodoSel ? 'none' : 'flex';
    if (_periodoSel) {
      await _suscribirDatos();
      _renderTab(_tabActual);
    }
  });

  // Nuevo periodo
  document.getElementById('cl-btn-new-periodo')?.addEventListener('click', () => {
    document.getElementById('cl-modal-periodo').classList.remove('hidden');
  });
  document.getElementById('cl-modal-close-periodo')?.addEventListener('click', () => {
    document.getElementById('cl-modal-periodo').classList.add('hidden');
  });
  document.getElementById('cl-btn-crear-periodo')?.addEventListener('click', _crearPeriodo);

  // Link encuesta
  document.getElementById('cl-btn-link')?.addEventListener('click', () => {
    const url = window.location.origin + '/clima-encuesta.html';
    navigator.clipboard?.writeText(url).then(() => toastOk('Link copiado al portapapeles'))
      .catch(() => prompt('Copia este link:', url));
  });

  // Modal consultora
  document.getElementById('cl-modal-close-consultora')?.addEventListener('click', () => {
    document.getElementById('cl-modal-consultora').classList.add('hidden');
  });
  document.getElementById('cl-btn-confirm-consultora')?.addEventListener('click', () => {
    document.getElementById('cl-modal-consultora').classList.add('hidden');
    _renderRespuestasConsultora();
  });
}

// ============================================================
// CARGAR PERIODOS
// ============================================================
async function _loadPeriodos() {
  try {
    const snap = await getDocs(query(collection(db,'clima_periodos'), orderBy('fechaInicio','desc')));
    _periodos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('cl-sel-periodo');
    if (!sel) return;
    _periodos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const fechaStr = p.fechaInicio?.toDate?.()?.toLocaleDateString('es-MX') || '';
      opt.textContent = `${p.nombre}${p.activo ? ' ✓' : ''} — ${fechaStr}`;
      sel.appendChild(opt);
    });
    // Auto-seleccionar el activo
    const activo = _periodos.find(p => p.activo);
    if (activo) {
      sel.value = activo.id;
      _periodoSel = activo;
      document.getElementById('cl-alert-noperiodo').style.display = 'none';
      await _suscribirDatos();
    } else {
      document.getElementById('cl-alert-noperiodo').style.display = 'flex';
    }
  } catch(err) {
    console.error('[Clima] loadPeriodos:', err);
  }
}

// ============================================================
// SUSCRIBIR DATOS EN TIEMPO REAL
// ============================================================
async function _suscribirDatos() {
  if (!_periodoSel) return;
  // Cancelar suscripciones previas
  _unsubRsp?.();
  _unsubEvi?.();

  const qRsp = query(
    collection(db,'clima_evaluaciones'),
    where('periodoId','==',_periodoSel.id),
    where('completada','==',true)
  );
  _unsubRsp = onSnapshot(qRsp, snap => {
    _respuestas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderTab(_tabActual);
  });

  const qEvi = query(
    collection(db,'clima_evidencias'),
    where('periodoId','==',_periodoSel.id)
  );
  _unsubEvi = onSnapshot(qEvi, snap => {
    _evidencias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (_tabActual === 'participacion') _renderTab('participacion');
  });
}

// ============================================================
// CREAR PERIODO
// ============================================================
async function _crearPeriodo() {
  const nombre = document.getElementById('cl-p-nombre').value.trim();
  const inicio = document.getElementById('cl-p-inicio').value;
  const fin    = document.getElementById('cl-p-fin').value;
  const total  = parseInt(document.getElementById('cl-p-total').value) || 0;

  if (!nombre || !inicio || !fin || !total) {
    toastError('Completa todos los campos'); return;
  }

  try {
    // Desactivar periodos anteriores activos
    for (const p of _periodos.filter(x => x.activo)) {
      await updateDoc(doc(db,'clima_periodos',p.id), { activo: false });
    }

    const ref = await addDoc(collection(db,'clima_periodos'), {
      nombre, activo: true, totalEsperado: total,
      creadoPor: Session.get()?.uid || 'admin',
      fechaInicio: Timestamp.fromDate(new Date(inicio + 'T00:00:00')),
      fechaFin:    Timestamp.fromDate(new Date(fin + 'T23:59:59')),
    });

    toastOk(`Periodo "${nombre}" creado`);
    document.getElementById('cl-modal-periodo').classList.add('hidden');
    await _loadPeriodosRefresh(ref.id);
  } catch(err) {
    console.error('[Clima] crearPeriodo:', err);
    toastError('Error al crear el periodo');
  }
}

async function _loadPeriodosRefresh(newId) {
  const snap = await getDocs(query(collection(db,'clima_periodos'), orderBy('fechaInicio','desc')));
  _periodos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sel = document.getElementById('cl-sel-periodo');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecciona un periodo —</option>';
  _periodos.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const fechaStr = p.fechaInicio?.toDate?.()?.toLocaleDateString('es-MX') || '';
    opt.textContent = `${p.nombre}${p.activo ? ' ✓' : ''} — ${fechaStr}`;
    sel.appendChild(opt);
  });
  if (newId) {
    sel.value = newId;
    _periodoSel = _periodos.find(p => p.id === newId) || null;
    document.getElementById('cl-alert-noperiodo').style.display = 'none';
    await _suscribirDatos();
    _renderTab(_tabActual);
  }
}

// ============================================================
// RENDER TAB
// ============================================================
function _renderTab(tab) {
  const cont = document.getElementById('cl-content');
  if (!cont) return;
  if (!_periodoSel) { cont.innerHTML = ''; return; }

  switch(tab) {
    case 'dashboard':     cont.innerHTML = _buildDashboard(); break;
    case 'participacion': cont.innerHTML = _buildParticipacion(); _bindParticipacion(); break;
    case 'departamentos': cont.innerHTML = _buildDepartamentos(); break;
    case 'riesgos':       cont.innerHTML = _buildRiesgos(); _bindRiesgos(); break;
    case 'abiertas':      cont.innerHTML = _buildAbiertas(); break;
    case 'exportar':      cont.innerHTML = _buildExportar(); _bindExportar(); break;
  }
}

// ============================================================
// UTILIDADES DE CÁLCULO
// ============================================================
function _scoreAjustado(qid, val) {
  return RISK_IDS.has(qid) ? (6 - val) : val;
}

function _promSeccion(idx) {
  if (!_respuestas.length) return 0;
  const sec = _seccMeta(idx);
  const prefixes = { 0:'l', 1:'c', 2:'w', 3:'a', 4:'g', 5:'s', 6:'p' };
  const prefix = prefixes[idx];
  const vals = _respuestas.flatMap(r => {
    const ans = r.answers || {};
    return Object.entries(ans)
      .filter(([k]) => k.startsWith(prefix) && !isNaN(ans[k]))
      .map(([k,v]) => _scoreAjustado(k, Number(v)));
  }).filter(v => v > 0);
  return vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : 0;
}

function _seccMeta(idx) { return SECCIONES_META[idx]; }

function _semaforo(score) {
  if (score < 2.5)  return { cls:'grav-alta',  emoji:'🔴', label:'Crítico' };
  if (score < 3.5)  return { cls:'grav-media', emoji:'🟡', label:'Atención' };
  return             { cls:'grav-baja',  emoji:'🟢', label:'Saludable' };
}

function _scoreBarra(score) {
  const pct = Math.round(((score-1)/4) * 100);
  const s = _semaforo(score);
  const colors = { 'grav-alta':'#dc2626','grav-media':'#d97706','grav-baja':'#059669' };
  return `<div style="height:8px;background:var(--surface3);border-radius:99px;overflow:hidden;margin-top:4px">
    <div style="height:100%;width:${pct}%;background:${colors[s.cls]};border-radius:99px;transition:width .5s"></div>
  </div>`;
}

function _participacion() {
  const total = _periodoSel?.totalEsperado || 1;
  const recibidas = _respuestas.length;
  return { recibidas, total, pct: Math.round((recibidas/total)*100) };
}

function _indiceRotacion() {
  if (!_respuestas.length) return 0;
  const vals = _respuestas.flatMap(r => {
    const a = r.answers || {};
    return [a['s2'], a['s5']].filter(v => v !== undefined).map(v => 6 - Number(v));
  });
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
}

function _indiceHostigamiento() {
  if (!_respuestas.length) return 0;
  const ids = ['p2','p3','p4','p6'];
  const vals = _respuestas.flatMap(r => {
    const a = r.answers || {};
    return ids.filter(id => a[id] !== undefined).map(id => 6 - Number(a[id]));
  });
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
}

function _npsData() {
  // s3 = recomendaría (mayor = promotor)
  if (!_respuestas.length) return { promotores: 0, neutros: 0, detractores: 0 };
  let p=0, n=0, d=0;
  _respuestas.forEach(r => {
    const v = Number((r.answers||{})['s3'] || 0);
    if (v >= 4) p++;
    else if (v === 3) n++;
    else if (v > 0) d++;
  });
  return { promotores:p, neutros:n, detractores:d };
}

function _kpiCard(label, value, sub, colorCls='') {
  return `<div class="kpi-card${colorCls?' '+colorCls:''}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value${colorCls?'':''}">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}

// ============================================================
// DASHBOARD
// ============================================================
function _buildDashboard() {
  const { recibidas, total, pct } = _participacion();
  const globalScore = SECCIONES_META.map((_,i) => _promSeccion(i)).filter(v=>v>0);
  const pGlobal = globalScore.length ? globalScore.reduce((a,b)=>a+b,0)/globalScore.length : 0;
  const sGlobal = _semaforo(pGlobal);
  const rot = _indiceRotacion();
  const sRot = _semaforo(rot);
  const hos = _indiceHostigamiento();
  const sHos = _semaforo(hos);
  const { promotores, neutros, detractores } = _npsData();
  const total_nps = promotores + neutros + detractores;
  const npsLabel = total_nps ? `${promotores}P · ${neutros}N · ${detractores}D` : 'Sin datos';

  // Alertas críticas
  let alertas = '';
  if (hos > 0 && hos < 2.5) {
    alertas = `<div class="alert-banner alert-error" style="margin-bottom:16px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div><strong>Alerta NOM-035:</strong> El índice de hostigamiento está en nivel crítico (${hos.toFixed(1)}). Revisar Sección 7 de inmediato.</div>
    </div>`;
  }

  const barras = SECCIONES_META.map((s, i) => {
    const score = _promSeccion(i);
    const sem = _semaforo(score);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;width:24px">${s.emoji}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:13px;font-weight:500;color:var(--text1)">${s.label}</span>
          <span class="gravedad-badge ${sem.cls}" style="font-size:11px">${score ? score.toFixed(1) : '—'} ${sem.emoji}</span>
        </div>
        ${score ? _scoreBarra(score) : '<div style="font-size:11px;color:var(--text3)">Sin datos</div>'}
      </div>
    </div>`;
  }).join('');

  return `
${alertas}
<div class="kpi-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
  ${_kpiCard('Participación', pct+'%', `${recibidas} de ${total} personas`, recibidas>=total?'kpi-primary':'')}
  ${_kpiCard('Puntaje global', pGlobal ? pGlobal.toFixed(1)+'/5' : '—', sGlobal.label + ' ' + sGlobal.emoji)}
  ${_kpiCard('Riesgo rotación', rot ? rot.toFixed(1) : '—', sRot.label + ' ' + sRot.emoji, rot < 2.5 && rot > 0 ? '' : '')}
  ${_kpiCard('Riesgo hostigamiento', hos ? hos.toFixed(1) : '—', sHos.label + ' ' + sHos.emoji)}
</div>
<div class="card" style="margin-bottom:16px">
  <div class="card-header"><span class="card-title">NPS implícito — "¿Recomendarías la agencia?"</span></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="text-align:center;flex:1">
      <div style="font-size:24px;font-weight:700;color:var(--success)">${promotores}</div>
      <div style="font-size:11px;color:var(--text3)">Promotores (4-5)</div>
    </div>
    <div style="text-align:center;flex:1">
      <div style="font-size:24px;font-weight:700;color:var(--warning)">${neutros}</div>
      <div style="font-size:11px;color:var(--text3)">Neutros (3)</div>
    </div>
    <div style="text-align:center;flex:1">
      <div style="font-size:24px;font-weight:700;color:var(--error)">${detractores}</div>
      <div style="font-size:11px;color:var(--text3)">Detractores (1-2)</div>
    </div>
  </div>
</div>
<div class="card">
  <div class="card-header"><span class="card-title">Puntaje por sección</span></div>
  ${barras}
</div>`;
}

// ============================================================
// PARTICIPACIÓN
// ============================================================
function _buildParticipacion() {
  const { recibidas, total, pct } = _participacion();
  const verificadas = _evidencias.filter(e => e.verificada).length;

  const rows = _evidencias.map(e => {
    const fecha = e.timestampCompletado?.toDate?.()?.toLocaleString('es-MX') || '—';
    const depto = DEPTOS[e.departamento] || e.departamento;
    const puestoLabel = e.puesto === 'gerente' ? 'Gerente/Supervisor' : 'Colaborador/Operativo';
    const estadoBadge = e.verificada
      ? `<span class="gravedad-badge grav-baja">✓ Verificada</span>`
      : `<button class="btn-ghost cl-btn-verificar" data-id="${e.id}" style="font-size:12px;padding:5px 10px">Verificar</button>`;
    return `<div class="inc-card" style="cursor:default">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name" style="font-family:monospace;letter-spacing:2px">${e.codigoEvidencia}</div>
          <div class="inc-card-meta">${depto} · ${puestoLabel}</div>
        </div>
        ${estadoBadge}
      </div>
      <div style="font-size:12px;color:var(--text3)">${fecha}</div>
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:14px;text-align:center;padding:20px 0">Sin respuestas registradas aún</p>';

  return `
<div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
  ${_kpiCard('Recibidas', recibidas, `de ${total} esperadas`)}
  ${_kpiCard('Participación', pct+'%', pct >= 80 ? '🟢 Buena cobertura' : pct >= 50 ? '🟡 Cobertura media' : '🔴 Cobertura baja')}
  ${_kpiCard('Verificadas', verificadas, `de ${_evidencias.length} registros`)}
</div>
<div class="card">
  <div class="card-header">
    <span class="card-title">Registros de evidencia</span>
    <span style="font-size:12px;color:var(--text3)">Actualización en tiempo real</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px" id="cl-evi-list">
    ${rows}
  </div>
</div>`;
}

function _bindParticipacion() {
  document.querySelectorAll('.cl-btn-verificar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await updateDoc(doc(db,'clima_evidencias',id), { verificada: true });
        toastOk('Evidencia verificada');
      } catch(e) { toastError('Error al verificar'); }
    });
  });
}

// ============================================================
// DEPARTAMENTOS
// ============================================================
function _buildDepartamentos() {
  const deptos = Object.keys(DEPTOS);

  const tabla = SECCIONES_META.map((sec, si) => {
    const celdas = deptos.map(d => {
      const rsp = _respuestas.filter(r => r.departamento === d);
      if (!rsp.length) return `<td style="text-align:center;color:var(--text3);font-size:12px">—</td>`;
      const prefixes = { 0:'l', 1:'c', 2:'w', 3:'a', 4:'g', 5:'s', 6:'p' };
      const prefix = prefixes[si];
      const vals = rsp.flatMap(r => {
        const a = r.answers || {};
        return Object.entries(a)
          .filter(([k]) => k.startsWith(prefix) && !isNaN(a[k]))
          .map(([k,v]) => _scoreAjustado(k, Number(v)));
      });
      const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
      const s = _semaforo(avg);
      return `<td style="text-align:center">
        <span class="gravedad-badge ${s.cls}">${avg.toFixed(1)} ${s.emoji}</span>
      </td>`;
    }).join('');

    return `<tr>
      <td style="padding:8px;font-size:13px;font-weight:500;white-space:nowrap">${sec.emoji} ${sec.label}</td>
      ${celdas}
    </tr>`;
  }).join('');

  const headers = deptos.map(d => `<th style="padding:8px;font-size:11px;text-align:center;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${DEPTOS[d]}</th>`).join('');

  const conteo = deptos.map(d => {
    const n = _respuestas.filter(r => r.departamento === d).length;
    return `<td style="text-align:center;font-size:12px;color:var(--text3)">${n} resp.</td>`;
  }).join('');

  return `
<div class="card" style="overflow-x:auto">
  <div class="card-header"><span class="card-title">Puntaje por sección × departamento</span></div>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        <th style="padding:8px;text-align:left;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Sección</th>
        ${headers}
      </tr>
    </thead>
    <tbody>${tabla}</tbody>
    <tfoot>
      <tr style="border-top:2px solid var(--border)">
        <td style="padding:8px;font-size:12px;color:var(--text3);font-weight:600">Respuestas</td>
        ${conteo}
      </tr>
    </tfoot>
  </table>
</div>

<div class="card" style="margin-top:16px">
  <div class="card-header"><span class="card-title">Semáforo de referencia</span></div>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <span class="gravedad-badge grav-baja">🟢 3.5–5.0 Saludable</span>
    <span class="gravedad-badge grav-media">🟡 2.5–3.4 Atención</span>
    <span class="gravedad-badge grav-alta">🔴 1.0–2.4 Crítico</span>
  </div>
</div>`;
}

// ============================================================
// SEÑALES DE RIESGO
// ============================================================
function _buildRiesgos() {
  const riskDef = [
    { id:'l4', label:'Trato preferencial percibido', seccion:'Liderazgo' },
    { id:'c2', label:'Comunicación por rumores', seccion:'Comunicación' },
    { id:'w3', label:'Carga inequitativa', seccion:'Trabajo' },
    { id:'a2', label:'Subgrupos y favoritismo visible', seccion:'Ambiente' },
    { id:'g3', label:'Ascensos por relaciones personales', seccion:'Crecimiento' },
    { id:'s2', label:'Intención de renuncia activa', seccion:'Satisfacción' },
    { id:'s5', label:'Desmotivación crónica', seccion:'Satisfacción' },
    { id:'p2', label:'Humillación/exclusión sistemática', seccion:'Seg. Psicológica' },
    { id:'p3', label:'Comentarios irrespetuosos', seccion:'Seg. Psicológica' },
    { id:'p4', label:'Miedo a reportar', seccion:'Seg. Psicológica' },
    { id:'p6', label:'Represalias indirectas', seccion:'Seg. Psicológica' },
  ];

  const cards = riskDef.map(r => {
    const vals = _respuestas.map(rsp => Number((rsp.answers||{})[r.id])).filter(v => v > 0);
    if (!vals.length) return `<div class="inc-card" style="cursor:default">
      <div class="inc-card-top">
        <div><div class="inc-card-name">${r.label}</div><div class="inc-card-meta">${r.seccion}</div></div>
        <span class="gravedad-badge">Sin datos</span>
      </div>
    </div>`;

    const avg_raw = vals.reduce((a,b)=>a+b,0)/vals.length;
    const avg_adj = 6 - avg_raw; // invertido: mayor raw = peor
    const s = _semaforo(avg_adj);
    const dist = [1,2,3,4,5].map(v => {
      const cnt = vals.filter(x => x === v).length;
      const pct = Math.round((cnt/vals.length)*100);
      return `<span style="font-size:11px;color:var(--text3)">${v}:${cnt}(${pct}%)</span>`;
    }).join(' · ');

    return `<div class="inc-card" style="cursor:default">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name" style="font-size:13px">${r.label}</div>
          <div class="inc-card-meta">${r.seccion} · n=${vals.length}</div>
        </div>
        <span class="gravedad-badge ${s.cls}">${avg_adj.toFixed(1)} ${s.emoji}</span>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">Distribución: ${dist}</div>
      ${_scoreBarra(avg_adj)}
    </div>`;
  }).join('');

  return `
<div class="alert-banner alert-info" style="margin-bottom:16px">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
  Las preguntas de riesgo usan escala invertida: mayor puntaje original = mayor problema. El índice mostrado ya está ajustado (mayor = mejor).
</div>
<div style="display:flex;flex-direction:column;gap:10px">${cards}</div>
<div class="card" style="margin-top:16px" id="cl-abiertas-riesgo">
  <div class="card-header">
    <span class="card-title">Respuestas abiertas críticas (p7, a7, s7)</span>
    <button class="btn-ghost" id="cl-btn-ver-consultora" style="font-size:12px">⭐ Ver Consultora</button>
  </div>
  ${_buildAbiertasRiesgo()}
</div>`;
}

function _buildAbiertasRiesgo() {
  const criticas = [
    { id:'p7', label:'Situaciones injustas o inapropiadas (Seg. Psicológica)' },
    { id:'a7', label:'Situaciones que la dirección debería conocer (Ambiente)' },
    { id:'s7', label:'Mensaje directo a gerencia general (Satisfacción)' },
  ];

  return criticas.map(c => {
    const textos = _respuestas
      .map(r => (r.answers||{})[c.id])
      .filter(t => t && t.trim().length > 0);
    if (!textos.length) return `<div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px">${c.label}</div>
      <p style="font-size:13px;color:var(--text3)">Sin respuestas</p>
    </div>`;
    return `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">${c.label} (${textos.length})</div>
      ${textos.map(t => `<div style="background:var(--surface3);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text1);line-height:1.5;margin-bottom:6px">"${t}"</div>`).join('')}
    </div>`;
  }).join('');
}

function _bindRiesgos() {
  document.getElementById('cl-btn-ver-consultora')?.addEventListener('click', () => {
    document.getElementById('cl-modal-consultora').classList.remove('hidden');
  });
}

let _consultoraVisible = false;
function _renderRespuestasConsultora() {
  const area = document.getElementById('cl-abiertas-riesgo');
  if (!area) return;

  const consultoraQ = [
    { id:'e6', label:'Fortalezas de la Consultora de Experiencia' },
    { id:'e7', label:'Áreas de oportunidad de la Consultora (CONFIDENCIAL)' },
  ];

  const html = `<div style="margin-top:20px;padding-top:16px;border-top:2px solid var(--border)">
    <div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">
      ⭐ Sección 8 — Consultora de Experiencia (Solo gerentes)
    </div>
    ${consultoraQ.map(c => {
      const textos = _respuestas
        .map(r => (r.answers||{})[c.id])
        .filter(t => t && t.trim().length > 0);
      if (!textos.length) return `<div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px">${c.label}</div>
        <p style="font-size:13px;color:var(--text3)">Sin respuestas de gerentes</p>
      </div>`;
      return `<div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">${c.label} (${textos.length})</div>
        ${textos.map(t => `<div style="background:rgba(0,30,80,.06);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text1);line-height:1.5;margin-bottom:6px">"${t}"</div>`).join('')}
      </div>`;
    }).join('')}
  </div>`;

  area.insertAdjacentHTML('beforeend', html);
}

// ============================================================
// RESPUESTAS ABIERTAS
// ============================================================
function _buildAbiertas() {
  const PREGUNTAS_ABIERTAS = [
    { id:'l6', label:'¿Qué cambiarías en el liderazgo de tu jefe?', sec:'Liderazgo' },
    { id:'l7', label:'¿Cómo responde tu supervisor ante problemas?', sec:'Liderazgo' },
    { id:'c6', label:'Temas que nadie habla abiertamente', sec:'Comunicación' },
    { id:'c7', label:'¿Cómo mejorarías la comunicación?', sec:'Comunicación' },
    { id:'w6', label:'Tareas fuera de rol o sobrecarga', sec:'Carga/Estrés' },
    { id:'w7', label:'¿Qué reduciría el estrés en tu área?', sec:'Carga/Estrés' },
    { id:'a6', label:'Una cosa que cambiarías del ambiente', sec:'Ambiente' },
    { id:'a7', label:'Situaciones que la dirección debería conocer', sec:'Ambiente' },
    { id:'g6', label:'¿En qué áreas te gustaría crecer?', sec:'Reconocimiento' },
    { id:'g7', label:'¿Qué tendría que cambiar para quedarte?', sec:'Reconocimiento' },
    { id:'s6', label:'¿Por qué sigues en la agencia?', sec:'Satisfacción' },
    { id:'s7', label:'Mensaje directo a gerencia', sec:'Satisfacción' },
    { id:'p7', label:'Situaciones injustas presenciadas', sec:'Seg. Psicológica' },
    { id:'p8', label:'¿Qué haría que te sintieras seguro/a reportando?', sec:'Seg. Psicológica' },
  ];

  const depto_filter = `<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn-ghost cl-depto-filter active" data-depto="" style="font-size:12px">Todos</button>
    ${Object.entries(DEPTOS).map(([k,v]) => `<button class="btn-ghost cl-depto-filter" data-depto="${k}" style="font-size:12px">${v}</button>`).join('')}
  </div>`;

  const pregsHtml = PREGUNTAS_ABIERTAS.map(p => {
    const textos = _respuestas
      .map(r => ({ texto: (r.answers||{})[p.id], depto: r.departamento }))
      .filter(x => x.texto && x.texto.trim().length > 0);
    const count = textos.length;
    if (!count) return '';

    const items = textos.map(x =>
      `<div class="cl-abierta-item" data-depto="${x.depto}" style="background:var(--surface3);border-radius:8px;padding:10px 12px;margin-bottom:6px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:3px">${DEPTOS[x.depto] || x.depto}</div>
        <div style="font-size:13px;color:var(--text1);line-height:1.5">"${x.texto}"</div>
      </div>`
    ).join('');

    return `<div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span class="card-title">${p.label}</span>
        <span class="inc-chip">${p.sec} · ${count} resp.</span>
      </div>
      ${items}
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:14px;text-align:center;padding:30px 0">Sin respuestas abiertas registradas</p>';

  return depto_filter + `<div id="cl-abiertas-list">${pregsHtml}</div>`;
}

// ============================================================
// EXPORTAR
// ============================================================
function _buildExportar() {
  return `
<div class="card" style="margin-bottom:16px">
  <div class="card-header"><span class="card-title">Exportar datos</span></div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <button class="btn-primary btn-full" id="cl-btn-pdf">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Reporte completo PDF
    </button>
    <button class="btn-ghost btn-full" id="cl-btn-csv">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
      Exportar CSV (datos numéricos)
    </button>
    <button class="btn-ghost btn-full" id="cl-btn-pdf-ejecutivo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Reporte ejecutivo 1 página (para dirección)
    </button>
  </div>
</div>
<div class="card">
  <div class="card-header"><span class="card-title">Información del periodo</span></div>
  <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
    <div style="display:flex;justify-content:space-between">
      <span style="color:var(--text3)">Nombre</span>
      <span style="font-weight:500">${_periodoSel?.nombre || '—'}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:var(--text3)">Respuestas recibidas</span>
      <span style="font-weight:500">${_respuestas.length} de ${_periodoSel?.totalEsperado || '?'}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:var(--text3)">Fecha inicio</span>
      <span>${_periodoSel?.fechaInicio?.toDate?.()?.toLocaleDateString('es-MX') || '—'}</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:var(--text3)">Fecha cierre</span>
      <span>${_periodoSel?.fechaFin?.toDate?.()?.toLocaleDateString('es-MX') || '—'}</span>
    </div>
  </div>
</div>`;
}

function _bindExportar() {
  document.getElementById('cl-btn-csv')?.addEventListener('click', _exportCSV);
  document.getElementById('cl-btn-pdf')?.addEventListener('click', () => _exportPDF(false));
  document.getElementById('cl-btn-pdf-ejecutivo')?.addEventListener('click', () => _exportPDF(true));
}

// ── CSV Export ─────────────────────────────────────────────
function _exportCSV() {
  if (!_respuestas.length) { toastError('Sin datos para exportar'); return; }

  const allIds = [
    'l1','l2','l3','l4','l5',
    'c1','c2','c3','c4','c5',
    'w1','w2','w3','w4','w5',
    'a1','a2','a3','a4','a5',
    'g1','g2','g3','g4','g5',
    's1','s2','s3','s4','s5',
    'p1','p2','p3','p4','p5','p6',
    'e1','e2','e3','e4','e5',
  ];

  const header = ['id','timestamp','departamento','puesto',...allIds,'score_global'].join(',');
  const rows = _respuestas.map(r => {
    const ts = r.timestamp?.toDate?.()?.toISOString() || '';
    const scores = allIds.map(id => {
      const v = Number((r.answers||{})[id]) || '';
      if (!v) return '';
      return RISK_IDS.has(id) ? (6 - v) : v;
    });
    const valid = scores.filter(s => s !== '');
    const global = valid.length ? (valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(2) : '';
    return [r.id, ts, r.departamento, r.puesto, ...scores, global].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `clima_${_periodoSel.nombre.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toastOk('CSV descargado');
}

// ── PDF Export ─────────────────────────────────────────────
async function _exportPDF(ejecutivo) {
  toastOk('Generando PDF…');
  try {
    // Cargar jsPDF dinámicamente
    const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const pdf = new jsPDF({ orientation:'p', unit:'mm', format:'a4' });
    const W = 210, M = 15;

    // ── Portada ──
    pdf.setFillColor(0, 30, 80);
    pdf.rect(0, 0, W, 50, 'F');
    pdf.setTextColor(255,255,255);
    pdf.setFontSize(18);
    pdf.setFont('helvetica','bold');
    pdf.text('Evaluación de Clima Laboral', W/2, 22, {align:'center'});
    pdf.setFontSize(11);
    pdf.setFont('helvetica','normal');
    pdf.text('Volkswagen Índice Automotriz — Piedras Negras, Coahuila', W/2, 31, {align:'center'});
    pdf.setFontSize(10);
    pdf.text(_periodoSel?.nombre || '', W/2, 40, {align:'center'});
    pdf.text('Generado: ' + new Date().toLocaleDateString('es-MX'), W/2, 46, {align:'center'});

    pdf.setTextColor(15,23,36);
    let y = 58;

    // ── KPIs ──
    const { recibidas, total, pct } = _participacion();
    const allS = SECCIONES_META.map((_,i) => _promSeccion(i)).filter(v=>v>0);
    const pGlobal = allS.length ? allS.reduce((a,b)=>a+b,0)/allS.length : 0;
    const rot = _indiceRotacion();
    const hos = _indiceHostigamiento();

    pdf.setFontSize(13); pdf.setFont('helvetica','bold');
    pdf.text('KPIs Principales', M, y); y += 7;

    const kpis = [
      ['Participación', `${pct}% (${recibidas}/${total})`],
      ['Puntaje global', pGlobal ? `${pGlobal.toFixed(2)}/5.00 — ${_semaforo(pGlobal).label}` : 'Sin datos'],
      ['Índice de rotación', rot ? `${rot.toFixed(2)}/5.00 — ${_semaforo(rot).label}` : 'Sin datos'],
      ['Índice hostigamiento (NOM-035)', hos ? `${hos.toFixed(2)}/5.00 — ${_semaforo(hos).label}` : 'Sin datos'],
    ];

    pdf.setFontSize(10); pdf.setFont('helvetica','normal');
    kpis.forEach(([k,v]) => {
      pdf.setFont('helvetica','bold'); pdf.text(k + ':', M, y);
      pdf.setFont('helvetica','normal'); pdf.text(v, M+65, y);
      y += 6;
    });
    y += 4;

    if (!ejecutivo) {
      // ── Tabla por secciones ──
      pdf.setFontSize(13); pdf.setFont('helvetica','bold');
      pdf.text('Resultados por sección', M, y); y += 7;

      SECCIONES_META.forEach((s, i) => {
        const score = _promSeccion(i);
        const sem = _semaforo(score);
        pdf.setFontSize(10); pdf.setFont('helvetica','bold');
        pdf.text(`${s.emoji} ${s.label}`, M, y);
        pdf.setFont('helvetica','normal');
        pdf.text(score ? `${score.toFixed(2)} — ${sem.label}` : 'Sin datos', M+80, y);
        y += 6;
        if (y > 270) { pdf.addPage(); y = 20; }
      });
      y += 4;

      // ── Señales de riesgo críticas ──
      pdf.setFontSize(13); pdf.setFont('helvetica','bold');
      pdf.text('Señales de riesgo', M, y); y += 7;

      const riskDef = [
        { id:'s2', label:'Intención de renuncia' },
        { id:'p2', label:'Humillación/exclusión' },
        { id:'p3', label:'Comentarios irrespetuosos' },
        { id:'p4', label:'Miedo a reportar' },
        { id:'p6', label:'Represalias indirectas' },
      ];
      riskDef.forEach(r => {
        const vals = _respuestas.map(rsp => Number((rsp.answers||{})[r.id])).filter(v => v > 0);
        if (!vals.length) return;
        const avg_adj = 6 - (vals.reduce((a,b)=>a+b,0)/vals.length);
        const sem = _semaforo(avg_adj);
        pdf.setFontSize(10); pdf.setFont('helvetica','bold');
        pdf.text(r.label + ':', M, y);
        pdf.setFont('helvetica','normal');
        pdf.text(`${avg_adj.toFixed(2)} — ${sem.label}`, M+65, y);
        y += 6;
        if (y > 270) { pdf.addPage(); y = 20; }
      });
    }

    // ── Nota legal ──
    y += 6;
    pdf.setFontSize(9); pdf.setFont('helvetica','italic');
    pdf.setTextColor(120,139,168);
    pdf.text('Evaluación realizada conforme a NOM-035-STPS-2018 (identificación de factores de riesgo psicosocial).', M, y);
    y += 5;
    pdf.text(`Responsable: Lic. Mónica Alejandra González González — alejandra.gonzalez@vw-indice.com.mx`, M, y);

    const fname = ejecutivo
      ? `clima_ejecutivo_${new Date().toISOString().slice(0,10)}.pdf`
      : `clima_completo_${_periodoSel.nombre.replace(/\s+/g,'_')}.pdf`;
    pdf.save(fname);
    toastOk('PDF generado y descargado');
  } catch(err) {
    console.error('[Clima] PDF:', err);
    toastError('Error al generar PDF — verifica la conexión');
  }
}
