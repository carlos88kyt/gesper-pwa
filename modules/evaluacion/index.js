// ============================================================
// modules/evaluacion/index.js — Evaluación de Desempeño v1.0
// VW Índice RH — NO modificar módulos existentes
// ============================================================

import { registerInit, go }     from '../../core/router.js';
import { Session }               from '../../core/auth.js';
import { DB_EvalCiclos, DB_Evaluaciones, DB_Empleados,
         DB_Incidencias, DB_Actas, DB_Compromisos } from '../../core/db.js';
import { EVAL_TIPO_PUESTO_MAP, EVAL_CLASIFICACIONES,
         EVAL_ACCIONES }         from '../../core/config.js';
import { toastOk, toastError }   from '../../core/toast.js';

// ── Estado local ─────────────────────────────────────────
const _s = {
  cicloActivo:   null,
  todosEval:     [],
  evalActual:    null,   // evaluación en edición
  vista:         'dashboard', // dashboard | lista | formulario | detalle | reporte
};

// ── Helpers ──────────────────────────────────────────────
function _toTitle(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function _fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}
function _tipoPuesto(puesto) {
  return EVAL_TIPO_PUESTO_MAP[(puesto||'').toUpperCase()] || 'operativo';
}
function _calcPuntaje(ev) {
  const b = ['b1','b2','b3','b4','b5'].map(k => Number(ev[k]||0));
  const c = ['c1','c2','c3','c4','c5','c6','c7'].map(k => Number(ev[k]||0));
  const d = ['d1','d2','d3','d4','d5'].map(k => Number(ev[k]||0));
  const sumaB = b.reduce((a,v)=>a+v,0);
  const sumaC = c.reduce((a,v)=>a+v,0);
  const sumaD = d.reduce((a,v)=>a+v,0);
  const subtotalB     = sumaB;
  const subtotalCNorm = Math.round(sumaC / 28 * 12 * 10) / 10;
  const subtotalDNorm = Math.round(sumaD / 20 * 8  * 10) / 10;
  const puntajeTotal  = Math.round((subtotalB + subtotalCNorm + subtotalDNorm) * 10) / 10;
  const alertaD       = d.some(v => v === 1);
  let clasificacion;
  if (alertaD)           clasificacion = 'en_revision';
  else if (puntajeTotal >= 34) clasificacion = 'excelente';
  else if (puntajeTotal >= 26) clasificacion = 'bueno';
  else if (puntajeTotal >= 18) clasificacion = 'regular';
  else                         clasificacion = 'critico';
  return { subtotalB, subtotalCNorm, subtotalDNorm, puntajeTotal, alertaD, clasificacion };
}
function _clasifBadge(clasificacion) {
  const map = {
    excelente:   { label:'⭐ Excelente',    color:'#059669' },
    bueno:       { label:'✅ Bueno',        color:'#0284C7' },
    regular:     { label:'⚠️ Regular',     color:'#D97706' },
    critico:     { label:'🔴 Crítico',     color:'#DC2626' },
    en_revision: { label:'🔒 En revisión', color:'#7C3AED' },
    borrador:    { label:'✏️ Borrador',    color:'#94A3B8' },
    completada:  { label:'📋 Completada',  color:'#0284C7' },
    validada:    { label:'✓ Validada',     color:'#059669' },
    bloqueada:   { label:'🔒 Bloqueada',   color:'#7C3AED' },
  };
  const e = map[clasificacion] || map.borrador;
  return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${e.color}22;color:${e.color}">${e.label}</span>`;
}

// ── Indicadores B por tipo de puesto ─────────────────────
const INDICADORES_B = {
  ventas: [
    { id:'b1', label:'Cumplimiento de meta de ventas del período',      fuente:'Sistema CRM / reporte mensual' },
    { id:'b2', label:'Seguimiento activo de prospectos en CRM',         fuente:'CRM — tasa de conversión' },
    { id:'b3', label:'Calidad del proceso de venta',                    fuente:'Retroalimentación del gerente' },
    { id:'b4', label:'Entrega correcta de unidades (documentación)',    fuente:'Expedientes de entrega' },
    { id:'b5', label:'Tiempo de respuesta a cliente nuevo',             fuente:'WhatsApp / CRM' },
  ],
  administrativo: [
    { id:'b1', label:'Cumplimiento de entregables en tiempo',           fuente:'Registros internos' },
    { id:'b2', label:'Exactitud en registros y documentos',             fuente:'Revisión de archivos' },
    { id:'b3', label:'Respuesta oportuna a solicitudes internas',       fuente:'Correo / bitácora' },
    { id:'b4', label:'Control y orden de archivos asignados',           fuente:'Revisión física/digital' },
    { id:'b5', label:'Cumplimiento de procesos sin desviaciones',       fuente:'Observación + registros' },
  ],
  operativo: [
    { id:'b1', label:'Puntualidad y asistencia',                        fuente:'Nómina / control de asistencia' },
    { id:'b2', label:'Cumplimiento de tareas sin supervisión',          fuente:'Observación del gerente' },
    { id:'b3', label:'Tiempo de respuesta en órdenes de trabajo',       fuente:'Órdenes de servicio' },
    { id:'b4', label:'Calidad del trabajo (retrabajo / quejas)',        fuente:'Registros de calidad' },
    { id:'b5', label:'Uso correcto de herramientas y equipos',          fuente:'Inventario / observación' },
  ],
};
const INDICADORES_C = [
  { id:'c1', label:'Puntualidad y presentación',       criterio:'Llega a tiempo, uniforme correcto, sin llamados frecuentes' },
  { id:'c2', label:'Actitud hacia el trabajo',         criterio:'Hace su trabajo sin quejarse, toma iniciativa básica' },
  { id:'c3', label:'Relación con compañeros',          criterio:'No genera conflictos, colabora, trato respetuoso' },
  { id:'c4', label:'Respeto a la jerarquía',           criterio:'Acepta instrucciones, no cuestiona de forma disruptiva' },
  { id:'c5', label:'Comunicación',                     criterio:'Se expresa con claridad, no genera malentendidos frecuentes' },
  { id:'c6', label:'Responsabilidad ante errores',     criterio:'Reconoce errores, no los oculta ni los transfiere a otros' },
  { id:'c7', label:'Disposición a aprender',           criterio:'Acepta retroalimentación, aplica correcciones dadas anteriormente' },
];
const INDICADORES_D = [
  { id:'d1', label:'Transparencia con prospectos/clientes', riesgo:'Malas prácticas, engaño, manipulación de información' },
  { id:'d2', label:'Uso correcto de sistemas de la empresa', riesgo:'Datos falsos en CRM, registros alterados' },
  { id:'d3', label:'Manejo de información confidencial',     riesgo:'Filtra precios, datos de clientes, información interna' },
  { id:'d4', label:'Cumplimiento de políticas internas',     riesgo:'Incumplimiento recurrente de reglas conocidas' },
  { id:'d5', label:'Comportamiento en instalaciones',        riesgo:'Actitudes que afectan el ambiente o imagen de la agencia' },
];
const ESCALA_LABELS = { 4:'Supera', 3:'Cumple', 2:'Por debajo', 1:'Inaceptable' };

const AREA_EVALUADOR_DEFAULT = {
  'Ventas': 'ventas', 'Servicio': 'servicio',
  'Seminuevos': 'admin', 'Refacciones': 'admin',
  'Administrativo': 'ventas', 'Marketing': 'ventas',
};
function _evaluadorDefault(area, esGerente) {
  if (esGerente) return 'admin';
  return AREA_EVALUADOR_DEFAULT[area] || 'admin';
}
function _nombreEvaluador(usuario) {
  if (usuario === 'admin')    return 'Alejandra González';
  if (usuario === 'ventas')   return 'Juan Manuel Moreno Godinez';
  if (usuario === 'servicio') return 'Silvia Vanessa Hernandez Melendez';
  return 'Sin asignar';
}
const ESCALA_COLORS = { 4:'#059669', 3:'#0284C7', 2:'#D97706', 1:'#DC2626' };

// ── Render principal ──────────────────────────────────────
async function render(params = {}) {
  const sec = document.getElementById('sec-evaluacion');
  if (!sec) return;

  _s.cicloActivo = await DB_EvalCiclos.getActivo();
  if (_s.cicloActivo) {
    _s.todosEval = await DB_Evaluaciones.getByCiclo(_s.cicloActivo.id);
  }

  const isAdm  = Session.isAdmin();
  const isDir  = Session.isDireccion();
  const isGer  = Session.isGerente();
  const area   = Session.getArea();

  if (params.vista === 'formulario' && params.evalId) {
    _s.evalActual = await DB_Evaluaciones.getById(params.evalId);
    _s.vista = 'formulario';
  } else if (params.vista) {
    _s.vista = params.vista;
  } else {
    _s.vista = 'dashboard';
  }

  sec.innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>📊 Evaluación de Desempeño</h1>
        <p>${_s.cicloActivo ? _s.cicloActivo.nombre : 'Sin ciclo activo'}</p>
      </div>
      <div id="eval-content"></div>
    </div>
  `;

  if (_s.vista === 'formulario' && _s.evalActual) {
    _renderFormulario(_s.evalActual);
  } else if (_s.vista === 'detalle' && params.evalId) {
    const ev = await DB_Evaluaciones.getById(params.evalId);
    _renderDetalle(ev);
  } else if (_s.vista === 'reporte') {
    _renderReporte();
  } else if (_s.vista === 'lista') {
    _renderLista();
  } else {
    _renderDashboard();
  }
}

// ── Dashboard ─────────────────────────────────────────────
function _renderDashboard() {
  const isAdm = Session.isAdmin();
  const isDir = Session.isDireccion();
  const isGer = Session.isGerente();
  const area  = Session.getArea();

  let evalVista = _s.todosEval;
  if (isGer) evalVista = evalVista.filter(e => e.area === area);

  const total      = evalVista.length;
  const completadas = evalVista.filter(e => ['completada','validada'].includes(e.estado)).length;
  const pendientes  = evalVista.filter(e => e.estado === 'borrador').length;
  const alertas     = evalVista.filter(e => e.alertaD || e.estado === 'bloqueada').length;
  const validadas   = evalVista.filter(e => e.estado === 'validada').length;

  const wrap = document.getElementById('eval-content');
  wrap.innerHTML = `
    ${!_s.cicloActivo ? `
      <div class="alert-banner alert-info" style="margin-bottom:16px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Sin ciclo activo. ${isAdm ? 'Crea un ciclo para comenzar.' : 'Esperando que RH abra el período de evaluación.'}</span>
      </div>
      ${isAdm ? `<button class="btn-primary" id="btn-nuevo-ciclo" style="margin-bottom:16px">➕ Nuevo ciclo de evaluación</button>` : ''}
    ` : `
      <div class="card" style="margin-bottom:12px;background:var(--primary-lite);border:1px solid var(--primary)">
        <div style="font-size:13px;font-weight:700;color:var(--primary)">${_s.cicloActivo.nombre}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${_fmt(_s.cicloActivo.fechaInicio)} → ${_fmt(_s.cicloActivo.fechaFin)}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          ${isAdm ? `<button class="btn-ghost" id="btn-nuevo-ciclo" style="font-size:12px;padding:5px 10px">➕ Nuevo ciclo</button>` : ''}
          ${isAdm ? `<button class="btn-ghost" id="btn-cerrar-ciclo" style="font-size:12px;padding:5px 10px;color:var(--error)">🔒 Cerrar ciclo</button>` : ''}
          ${isAdm || isDir ? `<button class="btn-ghost" id="btn-ver-reporte" style="font-size:12px;padding:5px 10px">📊 Reporte</button>` : ''}
        </div>
      </div>
    `}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="card" style="text-align:center;cursor:pointer" id="kpi-pendientes">
        <div style="font-size:28px;font-weight:700;color:${pendientes>0?'var(--warning)':'var(--text3)'}">${pendientes}</div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Pendientes</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--success)">${validadas}</div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Validadas</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--info)">${completadas}</div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Completadas</div>
      </div>
      <div class="card" style="text-align:center;cursor:pointer" id="kpi-alertas">
        <div style="font-size:28px;font-weight:700;color:${alertas>0?'var(--error)':'var(--text3)'}">${alertas}</div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">⚠️ Alertas</div>
      </div>
    </div>

    ${_s.cicloActivo ? `
    <button class="btn-primary btn-full" id="btn-ver-lista" style="margin-bottom:12px">
      📋 Ver evaluaciones ${isGer ? 'de mi equipo' : 'del ciclo'}
    </button>` : ''}

    ${isGer && _s.cicloActivo ? `
    <div class="card">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Mi equipo — pendientes</div>
      ${evalVista.filter(e=>e.estado==='borrador').map(e=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:600">${_toTitle(e.colaboradorNombre)}</div>
            <div style="font-size:11px;color:var(--text3)">${_toTitle(e.colaboradorPuesto)}</div>
          </div>
          <button class="btn-primary" data-eval-id="${e.id}" style="font-size:12px;padding:5px 12px">Evaluar</button>
        </div>`).join('') || '<div style="font-size:12px;color:var(--text3);padding:8px 0">✅ Sin pendientes</div>'}
    </div>` : ''}
  `;

  // Eventos
  document.getElementById('btn-nuevo-ciclo')?.addEventListener('click', _abrirModalCiclo);
  document.getElementById('btn-cerrar-ciclo')?.addEventListener('click', _cerrarCiclo);
  document.getElementById('btn-ver-lista')?.addEventListener('click', () => { _s.vista='lista'; _renderLista(); });
  document.getElementById('btn-ver-reporte')?.addEventListener('click', () => { _s.vista='reporte'; _renderReporte(); });
  document.getElementById('kpi-pendientes')?.addEventListener('click', () => { _s.vista='lista'; _renderLista(); });
  document.getElementById('kpi-alertas')?.addEventListener('click', () => { _s.vista='lista'; _renderLista('bloqueada'); });

  wrap.querySelectorAll('[data-eval-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = await DB_Evaluaciones.getById(btn.dataset.evalId);
      _s.evalActual = ev;
      _s.vista = 'formulario';
      _renderFormulario(ev);
    });
  });
}

// ── Lista de evaluaciones ─────────────────────────────────
function _renderLista(filtroEstado = null) {
  const isAdm = Session.isAdmin();
  const isDir = Session.isDireccion();
  const area  = Session.getArea();

  let lista = _s.todosEval;
  if (Session.isGerente()) lista = lista.filter(e => e.gerenteUsuario === Session.getUsuario());
  if (filtroEstado) lista = lista.filter(e => e.estado === filtroEstado || e.alertaD);

  const wrap = document.getElementById('eval-content');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button class="btn-ghost" id="btn-back-dash" style="font-size:12px;padding:5px 10px">← Volver</button>
      <div style="font-size:14px;font-weight:700">Evaluaciones del ciclo</div>
    </div>
    ${lista.length === 0 ? `<div class="empty-state"><p>Sin evaluaciones</p></div>` :
      lista.sort((a,b)=>a.colaboradorNombre.localeCompare(b.colaboradorNombre)).map(e => `
      <div class="inc-card" style="margin-bottom:10px">
        <div class="inc-card-top">
          <div>
            <div class="inc-card-name">${_toTitle(e.colaboradorNombre)}</div>
            <div class="inc-card-meta"><span>${e.area}</span><span>${_toTitle(e.colaboradorPuesto)}</span></div>
          </div>
          ${_clasifBadge(e.estado === 'validada' ? e.clasificacion : e.estado)}
        </div>
        ${e.puntajeTotal ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">Puntaje: <strong>${e.puntajeTotal}/40</strong></div>` : ''}
        ${e.alertaD ? `<div style="font-size:11px;color:var(--error);margin-top:2px">⚠️ Alerta D activa</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${(Session.isGerente() && e.estado === 'borrador') ? `
            <button class="btn-primary" data-eval-form="${e.id}" style="font-size:12px;padding:5px 10px">✏️ Evaluar</button>` : ''}
          ${(isAdm || isDir) ? `
            <button class="btn-ghost" data-eval-det="${e.id}" style="font-size:12px;padding:5px 10px">👁 Ver detalle</button>` : ''}
          ${(isAdm && (e.estado === 'completada' || e.estado === 'bloqueada')) ? `
            <button class="btn-ghost" data-eval-val="${e.id}" style="font-size:12px;padding:5px 10px;color:var(--success)">✓ Validar</button>` : ''}
        </div>
      </div>`).join('')}
  `;

  document.getElementById('btn-back-dash')?.addEventListener('click', () => { _s.vista='dashboard'; _renderDashboard(); });

  wrap.querySelectorAll('[data-eval-form]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _s.evalActual = await DB_Evaluaciones.getById(btn.dataset.evalForm);
      _s.vista = 'formulario';
      _renderFormulario(_s.evalActual);
    });
  });
  wrap.querySelectorAll('[data-eval-det]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = await DB_Evaluaciones.getById(btn.dataset.evalDet);
      _renderDetalle(ev);
    });
  });
  wrap.querySelectorAll('[data-eval-val]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = await DB_Evaluaciones.getById(btn.dataset.evalVal);
      _renderValidacion(ev);
    });
  });
}

// ── Formulario de evaluación (gerente) ───────────────────
function _renderFormulario(ev) {
  const tipo = _tipoPuesto(ev.colaboradorPuesto);
  const indicB = INDICADORES_B[tipo] || INDICADORES_B.operativo;

  function _seccionB() {
    return indicB.map(ind => _buildToggle(ind, ev[ind.id], 'B')).join('');
  }
  function _seccionC() {
    return INDICADORES_C.map(ind => _buildToggle(ind, ev[ind.id], 'C')).join('');
  }
  function _seccionD() {
    return INDICADORES_D.map(ind => _buildToggle(ind, ev[ind.id], 'D', true)).join('');
  }
  function _buildToggle(ind, val, sec, esRiesgo = false) {
    return `
      <div style="margin-bottom:14px;padding:10px;background:var(--surface2);border-radius:var(--radius-sm)${esRiesgo?';border-left:3px solid var(--error)':''}">
        <div style="font-size:13px;font-weight:600;color:var(--text1);margin-bottom:6px">
          ${esRiesgo ? '🔴 ' : ''}${ind.label}
        </div>
        ${ind.fuente ? `<div style="font-size:10px;color:var(--text3);margin-bottom:8px">Fuente: ${ind.fuente}</div>` : ''}
        ${ind.criterio ? `<div style="font-size:10px;color:var(--text3);margin-bottom:8px">${ind.criterio}</div>` : ''}
        ${ind.riesgo ? `<div style="font-size:10px;color:var(--error);margin-bottom:8px">Detecta: ${ind.riesgo}</div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
          ${[4,3,2,1].map(n => `
            <button class="eval-toggle${val===n?' active':''}" data-ind="${ind.id}" data-val="${n}"
              style="padding:8px 4px;border:2px solid ${val===n?ESCALA_COLORS[n]:'var(--border)'};border-radius:var(--radius-sm);background:${val===n?ESCALA_COLORS[n]+'22':'var(--surface)'};cursor:pointer;font-size:11px;font-weight:${val===n?'700':'400'};color:${val===n?ESCALA_COLORS[n]:'var(--text2)'}">
              <div style="font-size:16px;font-weight:700">${n}</div>
              <div>${ESCALA_LABELS[n]}</div>
            </button>`).join('')}
        </div>
      </div>`;
  }

  const calc = _calcPuntaje(ev);

  const wrap = document.getElementById('eval-content');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button class="btn-ghost" id="btn-back-lista" style="font-size:12px;padding:5px 10px">← Volver</button>
      <div style="font-size:14px;font-weight:700">${_toTitle(ev.colaboradorNombre)}</div>
    </div>

    <!-- Info colaborador -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--text3)">Área: <strong>${ev.area}</strong> · Puesto: <strong>${_toTitle(ev.colaboradorPuesto)}</strong> · Tipo: <strong>${_toTitle(tipo)}</strong></div>
    </div>

    <!-- Preview puntaje en tiempo real -->
    <div class="card" id="eval-preview" style="margin-bottom:12px;text-align:center">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Puntaje en tiempo real</div>
      <div id="preview-puntaje" style="font-size:32px;font-weight:700;color:var(--primary)">${calc.puntajeTotal.toFixed(1)}<span style="font-size:14px;color:var(--text3)">/40</span></div>
      <div id="preview-clasif" style="margin-top:4px">${_clasifBadge(calc.clasificacion)}</div>
      <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:11px;color:var(--text3)">
        <span>B: <strong>${calc.subtotalB}/20</strong></span>
        <span>C: <strong>${calc.subtotalCNorm.toFixed(1)}/12</strong></span>
        <span>D: <strong>${calc.subtotalDNorm.toFixed(1)}/8</strong></span>
      </div>
    </div>

    <!-- Sección B -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;margin-bottom:10px">Sección B — Indicadores de desempeño (${_toTitle(tipo)})</div>
      ${_seccionB()}
    </div>

    <!-- Sección C -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;margin-bottom:10px">Sección C — Comportamiento y actitud</div>
      ${_seccionC()}
    </div>

    <!-- Sección D -->
    <div class="card" style="margin-bottom:12px;border:1px solid var(--error)">
      <div style="font-size:12px;font-weight:700;color:var(--error);text-transform:uppercase;margin-bottom:6px">🔴 Sección D — Indicadores de riesgo</div>
      <div style="font-size:11px;color:var(--error);margin-bottom:10px">Cualquier calificación de 1 bloquea automáticamente la evaluación para revisión de RH.</div>
      ${_seccionD()}
    </div>

    <!-- Comentarios -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Comentarios del gerente</div>
      <textarea id="eval-comentarios" class="field-input field-textarea" style="min-height:80px"
        placeholder="Observaciones generales sobre el desempeño del colaborador...">${ev.comentariosGerente||''}</textarea>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:24px">
      <button class="btn-ghost btn-full" id="btn-guardar-borrador">💾 Guardar borrador</button>
      <button class="btn-primary btn-full" id="btn-finalizar-eval">✓ Finalizar evaluación</button>
    </div>
  `;

  // Toggle de calificación con actualización en tiempo real
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.eval-toggle');
    if (!btn) return;
    const ind = btn.dataset.ind;
    const val = parseInt(btn.dataset.val);
    _s.evalActual[ind] = val;

    // Refrescar visualmente los botones de esa fila
    wrap.querySelectorAll(`[data-ind="${ind}"]`).forEach(b => {
      const n = parseInt(b.dataset.val);
      const activo = n === val;
      b.style.borderColor = activo ? ESCALA_COLORS[n] : 'var(--border)';
      b.style.background  = activo ? ESCALA_COLORS[n]+'22' : 'var(--surface)';
      b.style.fontWeight  = activo ? '700' : '400';
      b.style.color       = activo ? ESCALA_COLORS[n] : 'var(--text2)';
    });

    // Actualizar preview
    const c = _calcPuntaje(_s.evalActual);
    const pp = document.getElementById('preview-puntaje');
    const pc = document.getElementById('preview-clasif');
    if (pp) pp.innerHTML = `${c.puntajeTotal.toFixed(1)}<span style="font-size:14px;color:var(--text3)">/40</span>`;
    if (pc) pc.innerHTML = _clasifBadge(c.clasificacion);
  });

  document.getElementById('btn-back-lista')?.addEventListener('click', () => { _s.vista='lista'; _renderLista(); });

  document.getElementById('btn-guardar-borrador')?.addEventListener('click', async () => {
    await _guardarEval('borrador');
    toastOk('Borrador guardado');
  });

  document.getElementById('btn-finalizar-eval')?.addEventListener('click', async () => {
    // Validar que todos los indicadores estén llenos
    const tipo2 = _tipoPuesto(_s.evalActual.colaboradorPuesto);
    const indB = INDICADORES_B[tipo2] || INDICADORES_B.operativo;
    const todos = [...indB, ...INDICADORES_C, ...INDICADORES_D];
    const faltantes = todos.filter(i => !_s.evalActual[i.id]);
    if (faltantes.length > 0) {
      toastError(`Faltan ${faltantes.length} indicadores por calificar`);
      return;
    }
    await _guardarEval('completada');
    toastOk('Evaluación finalizada');
    _s.vista = 'dashboard';
    await render();
  });
}

async function _guardarEval(nuevoEstado) {
  const calc  = _calcPuntaje(_s.evalActual);
  const coment = document.getElementById('eval-comentarios')?.value?.trim() || '';
  const estado = (nuevoEstado === 'completada' && calc.alertaD) ? 'bloqueada' : nuevoEstado;

  const cambios = {
    ...calc,
    comentariosGerente: coment,
    estado,
    accionRecomendada: EVAL_ACCIONES[calc.clasificacion] || '',
  };
  // Copiar calificaciones
  ['b1','b2','b3','b4','b5','c1','c2','c3','c4','c5','c6','c7','d1','d2','d3','d4','d5'].forEach(k => {
    if (_s.evalActual[k] !== undefined) cambios[k] = _s.evalActual[k];
  });
  await DB_Evaluaciones.update(_s.evalActual.id, cambios);
  _s.evalActual = { ..._s.evalActual, ...cambios };
}

// ── Detalle (admin/dirección) ─────────────────────────────
async function _renderDetalle(ev) {
  const tipo   = _tipoPuesto(ev.colaboradorPuesto);
  const indB   = INDICADORES_B[tipo] || INDICADORES_B.operativo;
  const todos  = [...indB, ...INDICADORES_C, ...INDICADORES_D];

  // Contexto cruzado: incidencias y actas del período
  let incsCount = 0, actasCount = 0, compsCount = 0;
  try {
    const incs  = await DB_Incidencias.getByEmpleado(ev.colaboradorId);
    const actas = await DB_Actas.getByEmpleado(ev.colaboradorId);
    const comps = await DB_Compromisos.getByEmpleado(ev.colaboradorId);
    incsCount   = incs.filter(i => i.estado === 'activa').length;
    actasCount  = actas.filter(a => !a.cancelada).length;
    compsCount  = comps.filter(c => c.estado === 'en_seguimiento').length;
  } catch(e) { /* silencioso */ }

  const wrap = document.getElementById('eval-content');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button class="btn-ghost" id="btn-back-lista2" style="font-size:12px;padding:5px 10px">← Volver</button>
      <div style="font-size:14px;font-weight:700">${_toTitle(ev.colaboradorNombre)}</div>
    </div>

    ${Session.isAdmin() ? `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn-ghost" id="btn-reasignar" style="font-size:12px;padding:5px 10px">👤 Reasignar evaluador</button>
    </div>` : ''}
    <!-- Resumen -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:13px;color:var(--text3)">${ev.area} · ${_toTitle(ev.colaboradorPuesto)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Evaluó: ${ev.gerenteNombre||'—'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:28px;font-weight:700;color:var(--primary)">${(ev.puntajeTotal||0).toFixed(1)}<span style="font-size:12px;color:var(--text3)">/40</span></div>
          ${_clasifBadge(ev.clasificacion || ev.estado)}
        </div>
      </div>
      ${ev.alertaD ? `<div style="margin-top:8px;padding:6px 10px;background:var(--error-lite);border-radius:var(--radius-sm);font-size:11px;color:var(--error);font-weight:600">⚠️ Alerta D activa — requiere revisión de RH antes de proceder</div>` : ''}
    </div>

    <!-- Contexto cruzado -->
    ${Session.isAdmin() ? `
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Contexto del período</div>
      <div style="display:flex;gap:16px">
        <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:${incsCount>0?'var(--warning)':'var(--text3)'}">${incsCount}</div><div style="font-size:10px;color:var(--text3)">Inc. activas</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:${actasCount>0?'var(--error)':'var(--text3)'}">${actasCount}</div><div style="font-size:10px;color:var(--text3)">Actas</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:${compsCount>0?'var(--warning)':'var(--text3)'}">${compsCount}</div><div style="font-size:10px;color:var(--text3)">Compromisos</div></div>
      </div>
    </div>` : ''}

    <!-- Calificaciones -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px">Detalle de calificaciones</div>
      ${todos.map(ind => {
        const val = ev[ind.id];
        const color = val ? ESCALA_COLORS[val] : 'var(--text3)';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text2);flex:1">${ind.label}</div>
          <div style="font-size:13px;font-weight:700;color:${color};min-width:80px;text-align:right">${val ? `${val} — ${ESCALA_LABELS[val]}` : '—'}</div>
        </div>`;
      }).join('')}
    </div>

    ${ev.comentariosGerente ? `
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Comentarios del gerente</div>
      <div style="font-size:13px;color:var(--text1)">${ev.comentariosGerente}</div>
    </div>` : ''}

    ${Session.isAdmin() && (ev.estado === 'completada' || ev.estado === 'bloqueada') ? `
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Validación — Admin</div>
      <div class="field-group">
        <label class="field-label">Acuerdo del colaborador</label>
        <select id="eval-acuerdo" class="field-input field-select">
          <option value="">— Seleccionar —</option>
          <option value="si" ${ev.acuerdoColaborador==='si'?'selected':''}>✓ De acuerdo</option>
          <option value="parcialmente" ${ev.acuerdoColaborador==='parcialmente'?'selected':''}>~ Parcialmente de acuerdo</option>
          <option value="no" ${ev.acuerdoColaborador==='no'?'selected':''}>✗ No de acuerdo</option>
        </select>
      </div>
      <div class="field-group" id="grupo-desacuerdo" style="${ev.acuerdoColaborador!=='si'&&ev.acuerdoColaborador?'':'display:none'}">
        <label class="field-label">Detalle del desacuerdo</label>
        <textarea id="eval-desacuerdo" class="field-input field-textarea" style="min-height:60px">${ev.desacuerdoDetalle||''}</textarea>
      </div>
      <div class="field-group">
        <label class="field-label">¿Qué necesita para mejorar?</label>
        <textarea id="eval-necesidad" class="field-input field-textarea" style="min-height:60px">${ev.necesidadColaborador||''}</textarea>
      </div>
      <div class="field-group">
        <label class="field-label">Comentarios del colaborador</label>
        <textarea id="eval-com-colab" class="field-input field-textarea" style="min-height:60px">${ev.comentariosColaborador||''}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary btn-full" id="btn-validar-eval">✓ Validar y registrar firma</button>
        ${ev.estado==='bloqueada'?`<button class="btn-ghost" id="btn-desbloquear" style="color:var(--warning)">🔓 Desbloquear</button>`:''}
      </div>
    </div>` : ''}

    ${ev.estado === 'validada' ? `
    <div class="alert-banner alert-ok" style="margin-bottom:12px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Validada el ${_fmt(ev.firmadaEn)} — Acción: ${ev.accionRecomendada}</span>
    </div>` : ''}

    <button class="btn-ghost btn-full" id="btn-pdf-eval">🖨 Exportar PDF</button>
  `;

  document.getElementById('btn-back-lista2')?.addEventListener('click', () => { _s.vista='lista'; _renderLista(); });
  document.getElementById('btn-reasignar')?.addEventListener('click', async () => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `<div style="background:var(--surface);padding:20px;border-radius:var(--radius);width:90%;max-width:360px">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px">Reasignar evaluador — ${_toTitle(ev.colaboradorNombre)}</div>
      ${['admin','ventas','servicio'].map(u=>`<button data-ev-usr="${u}" style="display:block;width:100%;padding:10px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:${ev.gerenteUsuario===u?'var(--primary-lite)':'var(--surface2)'};cursor:pointer;font-size:13px;text-align:left">${_nombreEvaluador(u)}</button>`).join('')}
      <button id="btn-cancel-reasig" style="width:100%;padding:8px;border:none;background:none;cursor:pointer;font-size:12px;color:var(--text3)">Cancelar</button>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#btn-cancel-reasig').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('[data-ev-usr]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const usr = btn.dataset.evUsr;
        await DB_Evaluaciones.update(ev.id, { gerenteUsuario: usr, gerenteNombre: _nombreEvaluador(usr) });
        toastOk('Evaluador reasignado');
        modal.remove();
        const evAct = await DB_Evaluaciones.getById(ev.id);
        _renderDetalle(evAct);
      });
    });
  });

  document.getElementById('eval-acuerdo')?.addEventListener('change', e => {
    const grupo = document.getElementById('grupo-desacuerdo');
    if (grupo) grupo.style.display = e.target.value !== 'si' ? '' : 'none';
  });

  document.getElementById('btn-validar-eval')?.addEventListener('click', async () => {
    const acuerdo    = document.getElementById('eval-acuerdo')?.value;
    if (!acuerdo) { toastError('Selecciona el acuerdo del colaborador'); return; }
    const desacuerdo = document.getElementById('eval-desacuerdo')?.value?.trim() || '';
    const necesidad  = document.getElementById('eval-necesidad')?.value?.trim() || '';
    const comColab   = document.getElementById('eval-com-colab')?.value?.trim() || '';
    await DB_Evaluaciones.update(ev.id, {
      acuerdoColaborador: acuerdo,
      desacuerdoDetalle: desacuerdo,
      necesidadColaborador: necesidad,
      comentariosColaborador: comColab,
    });
    await DB_Evaluaciones.validar(ev.id, Date.now());
    toastOk('Evaluación validada ✓');
    _s.todosEval = await DB_Evaluaciones.getByCiclo(_s.cicloActivo.id);
    _s.vista = 'lista';
    _renderLista();
  });

  document.getElementById('btn-desbloquear')?.addEventListener('click', async () => {
    await DB_Evaluaciones.update(ev.id, { estado: 'completada' });
    toastOk('Evaluación desbloqueada');
    const evActualizado = await DB_Evaluaciones.getById(ev.id);
    _renderDetalle(evActualizado);
  });

  document.getElementById('btn-pdf-eval')?.addEventListener('click', () => _generarPDF(ev));
}

// ── Reporte del ciclo ─────────────────────────────────────
function _renderReporte() {
  const lista    = _s.todosEval;
  const validadas = lista.filter(e => e.estado === 'validada');
  const areas    = [...new Set(lista.map(e => e.area))].sort();

  const wrap = document.getElementById('eval-content');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button class="btn-ghost" id="btn-back-rep" style="font-size:12px;padding:5px 10px">← Volver</button>
      <div style="font-size:14px;font-weight:700">Reporte del ciclo</div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:12px">${_s.cicloActivo?.nombre||'—'}</div>

    <!-- KPIs globales -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
      ${['excelente','bueno','regular','critico'].map(k => {
        const count = validadas.filter(e=>e.clasificacion===k).length;
        const cfg   = EVAL_CLASIFICACIONES[k];
        return `<div class="card" style="text-align:center">
          <div style="font-size:22px;font-weight:700;color:${cfg.color}">${count}</div>
          <div style="font-size:11px;color:var(--text3)">${cfg.label}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Por área -->
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px">Promedio por área</div>
      ${areas.map(area => {
        const ev = validadas.filter(e=>e.area===area);
        if (!ev.length) return '';
        const avg = ev.reduce((s,e)=>s+(e.puntajeTotal||0),0)/ev.length;
        const pct = (avg/40)*100;
        let color = avg>=34?'#059669':avg>=26?'#0284C7':avg>=18?'#D97706':'#DC2626';
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="font-weight:600">${area}</span>
            <span style="font-weight:700;color:${color}">${avg.toFixed(1)}/40</span>
          </div>
          <div style="height:8px;background:var(--surface3);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .5s"></div>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${ev.length} evaluados</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Alertas activas -->
    ${lista.filter(e=>e.alertaD||e.estado==='bloqueada').length > 0 ? `
    <div class="card" style="margin-bottom:12px;border:1px solid var(--error)">
      <div style="font-size:11px;font-weight:700;color:var(--error);text-transform:uppercase;margin-bottom:8px">⚠️ Alertas activas</div>
      ${lista.filter(e=>e.alertaD||e.estado==='bloqueada').map(e=>`
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;font-weight:600">${_toTitle(e.colaboradorNombre)}</div>
          <div style="font-size:11px;color:var(--error)">${e.estado}</div>
        </div>`).join('')}
    </div>` : ''}
  `;

  document.getElementById('btn-back-rep')?.addEventListener('click', () => { _s.vista='dashboard'; _renderDashboard(); });
}

// ── Modal nuevo ciclo ─────────────────────────────────────
async function _abrirModalCiclo() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-end;justify-content:center';
  const hoy = new Date().toISOString().split('T')[0];
  modal.innerHTML = `
    <div style="background:var(--surface);width:100%;max-width:600px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:20px;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700">Nuevo ciclo de evaluación</div>
        <button id="btn-close-ciclo" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
      </div>
      <div class="field-group">
        <label class="field-label">Nombre del ciclo *</label>
        <input type="text" id="ciclo-nombre" class="field-input" placeholder="Ej: Evaluación Semestral Junio 2026"/>
      </div>
      <div class="field-group">
        <label class="field-label">Período</label>
        <select id="ciclo-periodo" class="field-input field-select">
          <option value="enero-junio-2026">Enero–Junio 2026</option>
          <option value="julio-diciembre-2026">Julio–Diciembre 2026</option>
          <option value="enero-junio-2027">Enero–Junio 2027</option>
          <option value="julio-diciembre-2027">Julio–Diciembre 2027</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <div class="field-group" style="flex:1">
          <label class="field-label">Fecha inicio *</label>
          <input type="date" id="ciclo-inicio" class="field-input" value="${hoy}"/>
        </div>
        <div class="field-group" style="flex:1">
          <label class="field-label">Fecha fin *</label>
          <input type="date" id="ciclo-fin" class="field-input"/>
        </div>
      </div>
      <button class="btn-primary btn-full" id="btn-crear-ciclo" style="margin-top:8px">✓ Crear ciclo y generar evaluaciones</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#btn-close-ciclo').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#btn-crear-ciclo').addEventListener('click', async () => {
    const nombre = document.getElementById('ciclo-nombre').value.trim();
    const periodo = document.getElementById('ciclo-periodo').value;
    const inicio = document.getElementById('ciclo-inicio').value;
    const fin    = document.getElementById('ciclo-fin').value;
    if (!nombre || !inicio || !fin) { toastError('Completa todos los campos'); return; }

    // Cerrar ciclo anterior si existe
    if (_s.cicloActivo) {
      await DB_EvalCiclos.cerrar(_s.cicloActivo.id);
    }

    // Crear nuevo ciclo
    const ciclo = await DB_EvalCiclos.create({
      nombre, periodo, fechaInicio: inicio, fechaFin: fin,
      creadoPor: Session.get().id,
    });

    // Generar evaluaciones para todos los activos incluyendo gerentes
    const empleados = await DB_Empleados.getAll();
    const activos   = empleados.filter(e => e.activo !== false);
    let creadas = 0;
    for (const emp of activos) {
      const esGer = !!emp.usuario && emp.usuario !== 'direccion';
      const evalUsr = _evaluadorDefault(emp.area, esGer);
      await DB_Evaluaciones.create({
        cicloId:           ciclo.id,
        colaboradorId:     emp.id,
        colaboradorNombre: emp.nombre,
        colaboradorPuesto: emp.puesto,
        area:              emp.area,
        gerenteUsuario:    evalUsr,
        gerenteNombre:     _nombreEvaluador(evalUsr),
      });
      creadas++;
    }

    toastOk(`Ciclo creado — ${creadas} evaluaciones generadas`);
    modal.remove();
    await render();
  });
}

async function _cerrarCiclo() {
  if (!_s.cicloActivo) return;
  const pendientes = _s.todosEval.filter(e => e.estado !== 'validada').length;
  const msg = pendientes > 0
    ? `Hay ${pendientes} evaluaciones sin validar. ¿Cerrar el ciclo de todas formas?`
    : '¿Cerrar el ciclo de evaluación?';
  if (!confirm(msg)) return;
  await DB_EvalCiclos.cerrar(_s.cicloActivo.id);
  toastOk('Ciclo cerrado');
  await render();
}

// ── PDF individual ────────────────────────────────────────
function _generarPDF(ev) {
  const tipo  = _tipoPuesto(ev.colaboradorPuesto);
  const indB  = INDICADORES_B[tipo] || INDICADORES_B.operativo;
  const todos = [...indB, ...INDICADORES_C, ...INDICADORES_D];
  const calc  = _calcPuntaje(ev);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:15mm}
    .header{background:#1B3FAB;padding:16px 20px;border-radius:6px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
    .header-title{font-size:16px;font-weight:900;color:white} .header-sub{font-size:10px;color:rgba(255,255,255,.7);margin-top:2px}
    .emp-box{border:1px solid #E2E8F0;border-radius:6px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between}
    .puntaje-box{text-align:right} .puntaje-num{font-size:28px;font-weight:900;color:#1B3FAB}
    .sec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#1B3FAB;border-bottom:2px solid #1B3FAB;padding-bottom:4px;margin-bottom:8px;margin-top:12px}
    .ind-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F0F0F0;font-size:10px}
    .val-badge{font-weight:700;padding:1px 6px;border-radius:10px;font-size:10px}
    .firmas{display:flex;justify-content:space-around;margin-top:30px}
    .firma{text-align:center;flex:1} .firma-linea{border-top:1px solid #000;margin:0 15px} .firma-nombre{font-size:9px;color:#666;margin-top:3px}
  </style></head><body>
  <div class="header">
    <div><div class="header-title">Evaluación de Desempeño</div><div class="header-sub">Índice Automotriz S.A. de C.V. · ${_fmt(ev.firmadaEn||Date.now())}</div></div>
    <div style="color:white;text-align:right"><div style="font-size:11px">Ciclo: ${_s.cicloActivo?.nombre||'—'}</div></div>
  </div>
  <div class="emp-box">
    <div>
      <div style="font-size:14px;font-weight:700">${_toTitle(ev.colaboradorNombre)}</div>
      <div style="font-size:11px;color:#666">${_toTitle(ev.colaboradorPuesto)} — ${ev.area}</div>
      <div style="font-size:10px;color:#666;margin-top:4px">Evaluó: ${ev.gerenteNombre||Session.get().nombre}</div>
    </div>
    <div class="puntaje-box">
      <div class="puntaje-num">${(ev.puntajeTotal||calc.puntajeTotal).toFixed(1)}<span style="font-size:12px;color:#666">/40</span></div>
      <div style="font-size:11px;font-weight:700;color:${EVAL_CLASIFICACIONES[ev.clasificacion||calc.clasificacion]?.color||'#666'}">${EVAL_CLASIFICACIONES[ev.clasificacion||calc.clasificacion]?.label||'—'}</div>
    </div>
  </div>
  <div style="font-size:10px;background:#F4F6FB;padding:8px 10px;border-radius:4px;margin-bottom:12px">
    <strong>Acción recomendada:</strong> ${ev.accionRecomendada||EVAL_ACCIONES[ev.clasificacion||calc.clasificacion]||'—'}
  </div>
  <div class="sec-title">Sección B — Indicadores de desempeño (${_toTitle(tipo)})</div>
  ${indB.map(i=>`<div class="ind-row"><span>${i.label}</span><span class="val-badge" style="background:${ESCALA_COLORS[ev[i.id]||0]}22;color:${ESCALA_COLORS[ev[i.id]||0]||'#666'}">${ev[i.id]?`${ev[i.id]} — ${ESCALA_LABELS[ev[i.id]]}`:'—'}</span></div>`).join('')}
  <div style="text-align:right;font-size:10px;color:#666;margin-top:4px">Subtotal B: <strong>${(ev.subtotalB||calc.subtotalB)}/20</strong></div>
  <div class="sec-title">Sección C — Comportamiento y actitud</div>
  ${INDICADORES_C.map(i=>`<div class="ind-row"><span>${i.label}</span><span class="val-badge" style="background:${ESCALA_COLORS[ev[i.id]||0]}22;color:${ESCALA_COLORS[ev[i.id]||0]||'#666'}">${ev[i.id]?`${ev[i.id]} — ${ESCALA_LABELS[ev[i.id]]}`:'—'}</span></div>`).join('')}
  <div style="text-align:right;font-size:10px;color:#666;margin-top:4px">Subtotal C (norm): <strong>${(ev.subtotalCNorm||calc.subtotalCNorm).toFixed(1)}/12</strong></div>
  <div class="sec-title" style="color:#DC2626;border-color:#DC2626">Sección D — Indicadores de riesgo</div>
  ${INDICADORES_D.map(i=>`<div class="ind-row"><span>${i.label}</span><span class="val-badge" style="background:${ESCALA_COLORS[ev[i.id]||0]}22;color:${ESCALA_COLORS[ev[i.id]||0]||'#666'}">${ev[i.id]?`${ev[i.id]} — ${ESCALA_LABELS[ev[i.id]]}`:'—'}</span></div>`).join('')}
  <div style="text-align:right;font-size:10px;color:#666;margin-top:4px">Subtotal D (norm): <strong>${(ev.subtotalDNorm||calc.subtotalDNorm).toFixed(1)}/8</strong></div>
  ${ev.comentariosGerente?`<div class="sec-title">Comentarios del gerente</div><div style="font-size:10px;line-height:1.5">${ev.comentariosGerente}</div>`:''}
  ${ev.acuerdoColaborador?`<div class="sec-title">Sesión presencial</div>
    <div style="font-size:10px;line-height:1.7">
      <strong>Acuerdo del colaborador:</strong> ${ev.acuerdoColaborador==='si'?'De acuerdo':ev.acuerdoColaborador==='parcialmente'?'Parcialmente de acuerdo':'No de acuerdo'}<br/>
      ${ev.desacuerdoDetalle?`<strong>Detalle:</strong> ${ev.desacuerdoDetalle}<br/>`:''}
      ${ev.necesidadColaborador?`<strong>¿Qué necesita para mejorar?:</strong> ${ev.necesidadColaborador}<br/>`:''}
      ${ev.comentariosColaborador?`<strong>Comentarios del colaborador:</strong> ${ev.comentariosColaborador}`:''}
    </div>`:''}
  <div class="firmas">
    <div class="firma"><div style="height:40px"></div><div class="firma-linea"></div><div class="firma-nombre">Colaborador<br><strong>${_toTitle(ev.colaboradorNombre)}</strong></div></div>
    <div class="firma"><div style="height:40px"></div><div class="firma-linea"></div><div class="firma-nombre">Gerente<br><strong>${ev.gerenteNombre||'—'}</strong></div></div>
    <div class="firma"><div style="height:40px"></div><div class="firma-linea"></div><div class="firma-nombre">Recursos Humanos<br><strong>Alejandra González</strong></div></div>
  </div>
  </body></html>`;

  const win = window.open('','_blank','width=900,height=700');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ── Validación rápida ─────────────────────────────────────
function _renderValidacion(ev) { _renderDetalle(ev); }

// ── Init ─────────────────────────────────────────────────
registerInit('evaluacion', async (params = {}) => {
  if (!Session.isActive()) { go('login'); return; }
  if (!Session.isAdmin() && !Session.isGerente() && !Session.isDireccion()) {
    go('dashboard'); return;
  }
  await render(params);
});
