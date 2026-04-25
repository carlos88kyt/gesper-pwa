// ============================================================
// modules/actas/index.js — v12
// Selector de falta con catálogo RIT, sanción progresiva,
// aviso causal de rescisión, sin encabezado en PDF
// ============================================================

import { registerInit, go } from '../../core/router.js';
import { Session } from '../../core/auth.js';
import { DB_Empleados, DB_Incidencias, DB_Actas } from '../../core/db.js';
import { TIPOS_INCIDENCIA, AGENCIA, CIUDAD, SUCURSAL } from '../../core/config.js';
import { toastOk, toastError } from '../../core/toast.js';

const _s = { tab: 'nueva', empId: null, empData: null };

// Faltas causales de rescisión (Art. 47 LFT / Art. 70 RIT)
const CAUSALES_RESCISION = ['conflicto','uso_indebido','confidencialidad','mala_atencion'];

// Progresión de sanciones según historial de actas
async function _getSancionSugerida (numActasPrevias, isAdmin) {
  const sanciones = [
    { valor: 'ninguna',    label: 'Sin sanción adicional — registro formal', restringida: false },
    { valor: 'suspension1', label: 'Suspensión 1 día sin goce de sueldo',   restringida: false },
    { valor: 'suspension3', label: 'Suspensión 3 días sin goce de sueldo',  restringida: false },
    { valor: 'suspension7', label: 'Suspensión 1 semana sin goce de sueldo',restringida: true  },
    { valor: 'rescision',   label: 'Rescisión de contrato (Art. 47 LFT)',   restringida: true  },
  ];
  // Sugerida según número de actas previas
  const idx = Math.min(numActasPrevias, sanciones.length - 1);
  return { sanciones, sugerida: sanciones[idx].valor, isAdmin };
}

function _toTitle (str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function _formatFechaLarga (dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} del ${y}`;
}

function _getArticulo (tipoId) {
  return TIPOS_INCIDENCIA.find(t => t.id === tipoId)?.articulo || 'Reglamento Interior de Trabajo de Índice Automotriz S.A. de C.V.';
}

function _getSancion (tipoId) {
  return TIPOS_INCIDENCIA.find(t => t.id === tipoId)?.sancion || '';
}

async function render () {
  document.getElementById('sec-actas').innerHTML = `
    <div class="sec-wrap">
      <div class="sec-header">
        <h1>Acta Administrativa</h1>
        <p>Generación y seguimiento de actas</p>
      </div>
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="nueva">📝 Nueva acta</button>
        <button class="tab-btn" data-tab="historial">📋 Historial</button>
      </div>

      <!-- NUEVA ACTA -->
      <div id="tab-acta-nueva">

        <!-- Colaborador -->
        <div class="field-group" style="margin-bottom:14px;position:relative">
          <label class="field-label">Colaborador *</label>
          <input type="text" id="acta-emp-input" class="field-input" placeholder="Buscar nombre..." autocomplete="off"/>
          <div id="acta-emp-list" class="autocomplete-list hidden"></div>
          <input type="hidden" id="acta-emp-id"/>
        </div>

        <!-- Info empleado -->
        <div id="acta-emp-info" class="hidden" style="margin-bottom:14px">
          <div class="card" style="padding:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="emp-avatar" id="acta-emp-avatar" style="width:36px;height:36px;font-size:14px">??</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text1)" id="acta-emp-nombre-disp">—</div>
                  <div style="font-size:12px;color:var(--text3)" id="acta-emp-puesto-disp">—</div>
                </div>
              </div>
              <div id="acta-emp-historial-badge" style="text-align:right"></div>
            </div>
          </div>
        </div>

        <!-- Fecha y hora -->
        <div class="fields-grid">
          <div class="field-group">
            <label class="field-label">Fecha del acta *</label>
            <input type="date" id="acta-fecha" class="field-input"/>
          </div>
          <div class="field-group">
            <label class="field-label">Hora</label>
            <input type="time" id="acta-hora" class="field-input"/>
          </div>
        </div>

        <!-- TIPO DE FALTA — selector principal -->
        <div class="field-group" style="margin-bottom:8px">
          <label class="field-label">Tipo de falta *</label>
          <select id="acta-tipo-falta" class="field-input field-select">
            <option value="">— Seleccionar tipo de falta —</option>
            ${TIPOS_INCIDENCIA.filter(t=>t.activo).map(t =>
              `<option value="${t.id}" data-art="${t.articulo}" data-sancion="${t.sancion || ''}" data-rescision="${CAUSALES_RESCISION.includes(t.id) ? '1' : '0'}">${t.nombre}</option>`
            ).join('')}
          </select>
        </div>

        <!-- Fundamento legal (autocompletado) -->
        <div class="field-group" style="margin-bottom:8px">
          <label class="field-label">Fundamento legal <span style="color:var(--text3)">(autocompletado, editable)</span></label>
          <input type="text" id="acta-articulo" class="field-input" placeholder="Se autocompleta al seleccionar el tipo de falta..."/>
        </div>

        <!-- Sanción del RIT (informativo, no aparece en PDF) -->
        <div id="acta-sancion-rit" class="hidden" style="margin-bottom:8px">
          <div class="alert-banner alert-info" style="font-size:11px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="acta-sancion-rit-texto"></span>
          </div>
        </div>

        <!-- AVISO CAUSAL DE RESCISIÓN -->
        <div id="acta-aviso-rescision" class="hidden" style="margin-bottom:8px">
          <div class="alert-banner alert-error" style="font-size:12px;font-weight:600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>⚠ Esta falta es causal de rescisión sin responsabilidad para el patrón (Art. 47 LFT y Art. 70 RIT). El acta queda como evidencia formal en el expediente del colaborador.</span>
          </div>
        </div>

        <!-- Vincular incidencias previas (múltiple) -->
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Vincular incidencias previas <span style="color:var(--text3)">(opcional — selecciona una o varias)</span></label>
          <div id="acta-inc-lista" style="background:var(--surface3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:10px;max-height:160px;overflow-y:auto">
            <div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">— Selecciona primero un colaborador —</div>
          </div>
        </div>

        <!-- Descripción -->
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Descripción de la falta *</label>
          <textarea id="acta-falta" class="field-input field-textarea" style="min-height:90px"
            placeholder="Describe con precisión la falta cometida, fecha en que ocurrió y circunstancias..."></textarea>
        </div>

        <!-- SANCIÓN APLICADA -->
        <div class="field-group" style="margin-bottom:8px">
          <label class="field-label">Sanción aplicada</label>
          <select id="acta-sancion" class="field-input field-select">
            <option value="ninguna">Sin sanción adicional — registro formal</option>
            <option value="suspension1">Suspensión 1 día sin goce de sueldo</option>
            <option value="suspension3">Suspensión 3 días sin goce de sueldo</option>
            <option value="suspension7" class="sancion-restringida">Suspensión 1 semana sin goce de sueldo</option>
            <option value="rescision" class="sancion-restringida">Rescisión de contrato (Art. 47 LFT)</option>
          </select>
        </div>

        <!-- Aviso sanción restringida -->
        <div id="acta-aviso-sancion" class="hidden" style="margin-bottom:8px">
          <div class="alert-banner alert-warn" style="font-size:11px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <span id="acta-aviso-sancion-texto"></span>
          </div>
        </div>

        <!-- Resolución / Justificación (obligatoria si no hay sanción) -->
        <div class="field-group" style="margin-bottom:14px" id="acta-resolucion-wrap">
          <label class="field-label">
            Justificación de la decisión
            <span id="acta-resolucion-req" style="color:var(--error);margin-left:4px">*</span>
            <span style="color:var(--text3);font-weight:400"> (obligatoria cuando no hay sanción)</span>
          </label>
          <textarea id="acta-resolucion" class="field-input field-textarea" style="min-height:64px"
            placeholder="Explica el criterio para la sanción aplicada o justifica por qué no se aplica sanción..."></textarea>
        </div>

        <!-- Réplica -->
        <div class="field-group" style="margin-bottom:14px">
          <label class="field-label">Réplica del trabajador <span style="color:var(--text3)">(si aplica)</span></label>
          <textarea id="acta-replica" class="field-input field-textarea" style="min-height:72px"
            placeholder="Versión de los hechos manifestada por el colaborador bajo protesta de decir verdad..."></textarea>
        </div>

        <!-- Testigos -->
        <div class="fields-grid" style="margin-bottom:20px">
          <div class="field-group">
            <label class="field-label">Testigo 1</label>
            <input type="text" id="acta-testigo1" class="field-input" placeholder="Nombre completo"/>
          </div>
          <div class="field-group">
            <label class="field-label">Testigo 2</label>
            <input type="text" id="acta-testigo2" class="field-input" placeholder="Nombre completo"/>
          </div>
          <div class="field-group">
            <label class="field-label">Testigo 3</label>
            <input type="text" id="acta-testigo3" class="field-input" placeholder="Nombre completo"/>
          </div>
        </div>

        <button class="btn-primary btn-full" id="btn-guardar-acta">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/></svg>
          Guardar y generar PDF
        </button>
      </div>

      <!-- HISTORIAL -->
      <div id="tab-acta-historial" class="hidden">
        <div class="field-group" style="margin-bottom:14px">
          <input type="text" id="acta-hist-search" class="field-input" placeholder="🔍 Buscar colaborador..."/>
        </div>
        <div id="acta-hist-contenido"></div>
      </div>
    </div>
  `;

  const now = new Date();
  document.getElementById('acta-fecha').value = now.toISOString().split('T')[0];
  document.getElementById('acta-hora').value  = now.toTimeString().slice(0,5);

  // Ocultar opciones restringidas para gerentes
  if (!Session.isAdmin()) {
    document.querySelectorAll('.sancion-restringida').forEach(opt => opt.remove());
  }

  _attachEvents();
}

async function _cargarIncidencias (empId) {
  const lista = document.getElementById('acta-inc-lista');
  if (!lista) return;
  const incs = (await DB_Incidencias.getByEmpleado(empId)).filter(i => i.estado === 'activa');
  if (!incs.length) {
    lista.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Sin incidencias activas para vincular</div>';
    return;
  }
  lista.innerHTML = incs.map(i => {
    const fecha = new Date(i.timestamp).toLocaleDateString('es-MX');
    const art   = _getArticulo(i.tipoId);
    const descSafe = (i.descripcion || '').replace(/["'`]/g, ' ');
    return `
      <label style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" data-inc-id="${i.id}" data-desc="${descSafe}" data-art="${art}" data-tipo="${i.tipoNombre}"
          style="margin-top:2px;flex-shrink:0;accent-color:var(--primary)"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text1)">${i.tipoNombre}</div>
          <div style="font-size:11px;color:var(--text3)">${fecha} — ${i.descripcion?.slice(0,60)||''}${(i.descripcion?.length||0)>60?'...':''}</div>
        </div>
      </label>`;
  }).join('');

  // Al seleccionar incidencias — autocompletar descripción y artículos
  lista.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', _actualizarDesdeIncidencias);
  });
}

async function _actualizarDesdeIncidencias () {
  const lista   = document.getElementById('acta-inc-lista');
  const checks  = [...lista.querySelectorAll('input[type=checkbox]:checked')];
  if (!checks.length) return;

  // Concatenar descripciones
  const desc = checks.map(function(c, idx){ return (idx+1) + '. ' + (c.dataset.desc || ''); }).join('\n');
  const faltaEl = document.getElementById('acta-falta');
  if (faltaEl && !faltaEl.value) faltaEl.value = desc;

  // Concatenar artículos únicos
  const arts = [...new Set(checks.map(c => c.dataset.art).filter(Boolean))];
  const artEl = document.getElementById('acta-articulo');
  if (artEl) artEl.value = arts.join(' / ');
}

function _getIncidenciasSeleccionadas () {
  const lista = document.getElementById('acta-inc-lista');
  if (!lista) return [];
  return [...lista.querySelectorAll('input[type=checkbox]:checked')].map(c => c.dataset.incId);
}

async function _actualizarHistorialBadge (empId) {
  const actas = await DB_Actas.getByEmpleado(empId);
  const incs  = (await DB_Incidencias.getByEmpleado(empId)).filter(i => i.estado === 'activa');
  const badge = document.getElementById('acta-emp-historial-badge');
  if (!badge) return;
  badge.innerHTML = `
    <div style="font-size:11px;color:var(--text3)">Historial</div>
    <div style="display:flex;gap:8px;margin-top:3px">
      <span style="font-size:12px;font-weight:700;color:${incs.length>0?'var(--warning)':'var(--text3)'}">
        ${incs.length} inc.
      </span>
      <span style="font-size:12px;font-weight:700;color:${actas.length>0?'var(--error)':'var(--text3)'}">
        ${actas.length} actas
      </span>
    </div>`;

  // Sugerir sanción según número de actas previas
  const isAdm = Session.isAdmin();
  const { sanciones, sugerida } = _getSancionSugerida(actas.length, isAdm);
  const sancionSel = document.getElementById('acta-sancion');
  if (sancionSel) sancionSel.value = sugerida;

  // Mostrar badge informativo
  if (actas.length > 0) {
    const aviso = document.getElementById('acta-aviso-sancion');
    const texto = document.getElementById('acta-aviso-sancion-texto');
    if (aviso && texto) {
      texto.textContent = `Este colaborador tiene ${actas.length} acta(s) previa(s). Sanción sugerida según progresión del RIT: ${sanciones.find(s=>s.valor===sugerida)?.label}`;
      aviso.classList.remove('hidden');
    }
  }
}

async function _registrarNegativa (actaId) {
  // Saves a record that a negativa was generated for this acta
  const acta = await DB_Actas.getById(actaId);
  if (!acta) return;
  const negativasFirma = acta.negativasFirma || [];
  negativasFirma.push({
    fecha: new Date().toLocaleDateString('es-MX'),
    hora:  new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    ts:    Date.now(),
    generadaPor: Session.get()?.nombre || '—',
  });
  await DB_Actas.update(actaId, { negativasFirma });
}

async function _generarConstanciaNegativa (acta) {
  async function tt (s) { return s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : ''; }
  async function fmtFechaLarga (d) {
    if (!d) return '—';
    const [y,m,dd] = d.split('-');
    const mm = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return parseInt(dd) + ' de ' + mm[parseInt(m)-1] + ' del ' + y;
  }
  const ahora = new Date().toLocaleString('es-MX', { dateStyle:'long', timeStyle:'short' });
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Constancia de Negativa</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 40px 50px; color: #000; }
  .header { text-align: center; border-bottom: 2px solid #1B3FAB; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 15px; color: #1B3FAB; margin: 0 0 4px; }
  .header p  { font-size: 10px; color: #555; margin: 2px 0; }
  .titulo { text-align: center; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 16px 0; letter-spacing: 1px; }
  .cuerpo { line-height: 1.8; text-align: justify; margin-bottom: 14px; }
  .ref { background: #f0f4ff; border: 1px solid #1B3FAB; border-radius: 4px; padding: 8px 12px; margin: 12px 0; font-size: 11px; }
  .firma-row { display: flex; justify-content: space-around; margin-top: 48px; }
  .firma-item { text-align: center; flex: 1; padding: 0 10px; }
  .firma-line { border-top: 1px solid #000; margin-bottom: 4px; }
  .firma-nombre { font-size: 10px; }
  @page { size: letter; margin: 0; }
  @media print { body { padding: 20mm 25mm; } }
</style></head><body>
<div class="header">
  <h1>Índice Automotriz S.A. de C.V. — Suc. Piedras Negras PN 0509</h1>
  <p>Libramiento Manuel Pérez Treviño #400, Col. San Luis, Piedras Negras, Coahuila</p>
</div>
<div class="titulo">Constancia de Negativa de Firma</div>
<div class="cuerpo">
  En la ciudad de <strong>Piedras Negras, Coahuila</strong>, siendo las <strong>${ahora}</strong>, 
  quienes suscriben como testigos hacemos constar que:
</div>
<div class="cuerpo">
  El(la) C. <strong>${tt(acta.empleadoNombre)}</strong>, quien ocupa el puesto de 
  <strong>${tt(acta.empleadoPuesto)}</strong> en el área de <strong>${acta.empleadoArea}</strong>, 
  fue notificado(a) del contenido del Acta Administrativa que a continuación se referencia, 
  y se <strong>negó a firmar de recibido</strong> sin manifestar causa justificada para ello.
</div>
<div class="ref">
  <strong>Referencia del Acta Administrativa:</strong><br/>
  ${acta.folio ? 'Folio: ' + acta.folio + ' — ' : ''}Fecha: ${fmtFechaLarga(acta.fecha)} · ${acta.hora} hrs<br/>
  Tipo de falta: ${acta.tipoFaltaNombre || '—'}<br/>
  Levantó el acta: ${acta.levantaActa}
</div>
<div class="cuerpo">
  La negativa a firmar el acta <strong>no invalida</strong> el contenido ni los efectos legales 
  de la misma, en términos del <strong>Art. 423 de la Ley Federal del Trabajo</strong> y del 
  Reglamento Interior de Trabajo de Índice Automotriz S.A. de C.V.
</div>
<div class="cuerpo">
  Se extiende la presente constancia a los <strong>${new Date().getDate()} días del mes de 
  ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][new Date().getMonth()]} 
  de ${new Date().getFullYear()}</strong>, para los efectos legales a que haya lugar.
</div>
<div class="firma-row">
  <div class="firma-item">
    <div style="height:48px"></div>
    <div class="firma-line"></div>
    <div class="firma-nombre"><strong>Testigo 1</strong><br/>Nombre y firma</div>
  </div>
  <div class="firma-item">
    <div style="height:48px"></div>
    <div class="firma-line"></div>
    <div class="firma-nombre"><strong>Testigo 2</strong><br/>Nombre y firma</div>
  </div>
  <div class="firma-item">
    <div style="height:48px"></div>
    <div class="firma-line"></div>
    <div class="firma-nombre"><strong>${acta.levantaActa}</strong><br/>Administración / Gerente</div>
  </div>
</div>
<div style="margin-top:30px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px">
  Índice Automotriz S.A. de C.V. — Piedras Negras, Coahuila — Documento generado por Sistema VW Índice RH
</div>
</body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

async function _generarPDF (acta) {
  const sancionTexto = {
    'ninguna':     '',
    'suspension1': 'Suspensión de 1 (un) día laborable sin goce de sueldo.',
    'suspension3': 'Suspensión de 3 (tres) días laborables sin goce de sueldo.',
    'suspension7': 'Suspensión de 1 (una) semana laborable sin goce de sueldo.',
    'rescision':   'Rescisión de la relación laboral sin responsabilidad para la empresa, con fundamento en el Art. 47 de la Ley Federal del Trabajo.',
  }[acta.sancion] || '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Acta Administrativa</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 30px 40px; color: #000; }
  .header { text-align: center; border-bottom: 2px solid #1B3FAB; padding-bottom: 10px; margin-bottom: 18px; }
  .header h1 { font-size: 15px; margin: 0 0 3px; color: #1B3FAB; font-weight: bold; }
  .header p  { margin: 2px 0; font-size: 10px; color: #555; }
  .titulo-acta { text-align: center; font-size: 14px; font-weight: bold; margin: 14px 0; text-transform: uppercase; letter-spacing: 1px; }
  .cuerpo { line-height: 1.7; text-align: justify; margin-bottom: 12px; font-size: 11.5px; }
  .seccion { font-weight: bold; margin: 14px 0 5px; text-transform: uppercase; font-size: 10px; color: #1B3FAB; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .replica-box { border: 1px solid #ccc; padding: 8px; min-height: 55px; border-radius: 3px; background: #fafafa; font-size: 11px; }
  .sancion-box { border: 1px solid #1B3FAB; background: #f0f4ff; padding: 8px 12px; border-radius: 3px; font-size: 11.5px; margin-top: 4px; }
  .firma-row { display: flex; justify-content: space-between; margin-top: 28px; }
  .firma-item { text-align: center; flex: 1; padding: 0 6px; }
  .firma-space { height: 44px; }
  .firma-line { border-top: 1px solid #000; margin-bottom: 3px; }
  .firma-nombre { font-size: 10px; }
  .footer { margin-top: 24px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 6px; }
  @page { size: letter; margin: 0; }
  @media print {
    body { padding: 20mm 25mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Índice Automotriz S.A. de C.V. — Suc. Piedras Negras ${acta.sucursal || 'PN 0509'}</h1>
  <p>Libramiento Manuel Pérez Treviño #400, Col. San Luis, Piedras Negras, Coahuila</p>
</div>

<div class="titulo-acta">Acta Administrativa</div>
${acta.folio ? '<div style="text-align:center;font-size:11px;font-weight:bold;color:#1B3FAB;font-family:monospace;margin-bottom:8px">' + acta.folio + '</div>' : ''}

<div class="cuerpo">
  En la ciudad de <strong>Piedras Negras, Coahuila</strong>, siendo las <strong>${acta.hora} hrs. del día ${_formatFechaLarga(acta.fecha)}</strong>.
</div>
<div class="cuerpo">
  Se encuentra reunido(a) <strong>${acta.levantaActa}</strong>, en las instalaciones de Índice Automotriz, Libramiento Manuel Pérez Treviño #400, Col. San Luis, Piedras Negras, Coahuila, y que de manera voluntaria constatan los hechos que se describen en la presente acta administrativa.
</div>
<div class="cuerpo">
  Que el(la) C. <strong>${_toTitle(acta.empleadoNombre)}</strong>, quien hasta la fecha ocupa el puesto de <strong>${_toTitle(acta.empleadoPuesto)}</strong>, en el área de <strong>${acta.empleadoArea}</strong>:
</div>

<div class="seccion">Descripción de la falta</div>
<div class="cuerpo">${acta.falta}</div>
<div class="cuerpo">
  Lo anterior infringe lo establecido en el <strong>${acta.articulo}</strong>.
</div>
<div class="cuerpo">
  Por lo que se extiende la presente acta administrativa a fin de registrar las causas y consecuencias del hecho antes señalado.
</div>

${sancionTexto ? `
<div class="seccion">Sanción aplicada</div>
<div class="sancion-box"><strong>${sancionTexto}</strong></div>
` : ''}

<div class="seccion">Réplica del trabajador</div>
<div class="cuerpo">Por lo anterior, se solicita al(la) C. <strong>${_toTitle(acta.empleadoNombre)}</strong> que proporcione su versión de los hechos, bajo protesta de que manifiesta solo la verdad:</div>
<div class="replica-box">${acta.replica || '&nbsp;'}</div>

<div class="cuerpo" style="margin-top:12px">
  Una vez recogidos los testimonios y datos necesarios, se da por terminada la presente acta administrativa a las <strong>${acta.hora} hrs. del día ${_formatFechaLarga(acta.fecha)}</strong>, con la firma de los testigos y el resto de las personas que intervinieron, ratificando cada una de sus partes.
</div>

<div class="seccion">Firmas</div>
<div class="firma-row">
  <div class="firma-item">
    <div class="firma-space"></div>
    <div class="firma-line"></div>
    <div class="firma-nombre"><strong>Firma de Enterado</strong><br>${_toTitle(acta.empleadoNombre)}</div>
  </div>
  <div class="firma-item">
    <div class="firma-space"></div>
    <div class="firma-line"></div>
    <div class="firma-nombre"><strong>${acta.levantaActa}</strong><br>Administración</div>
  </div>
</div>
${[acta.testigo1,acta.testigo2,acta.testigo3].filter(Boolean).length > 0 ? `
<div class="firma-row">
  ${[acta.testigo1,acta.testigo2,acta.testigo3].filter(Boolean).map(t=>`
    <div class="firma-item">
      <div class="firma-space"></div>
      <div class="firma-line"></div>
      <div class="firma-nombre">Testigo<br>${t}</div>
    </div>`).join('')}
</div>` : ''}

<div class="footer">Índice Automotriz S.A. de C.V. — Piedras Negras, Coahuila — ${new Date().toLocaleDateString('es-MX')} — Documento generado por sistema interno RH</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

async function _renderHistorial (filtro = '') {
  const wrap = document.getElementById('acta-hist-contenido');
  if (!wrap) return;
  const isAdm = Session.isAdmin();
  let actas = await DB_Actas.getAll();
  if (!isAdm) actas = actas.filter(a => a.empleadoArea === Session.getArea());
  if (filtro) actas = actas.filter(a => a.empleadoNombre.toLowerCase().includes(filtro.toLowerCase()));
  actas = actas.sort((a,b) => b.timestamp - a.timestamp);

  if (!actas.length) {
    wrap.innerHTML = `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg><p>Sin actas registradas</p></div>`;
    return;
  }

  const sancionLabel = {
    'ninguna': '', 'suspension1': '1 día suspensión',
    'suspension3': '3 días suspensión', 'suspension7': '1 semana suspensión',
    'rescision': 'Rescisión'
  };

  wrap.innerHTML = actas.map(a => `
    <div class="inc-card" style="margin-bottom:10px">
      <div class="inc-card-top">
        <div>
          <div class="inc-card-name">${_toTitle(a.empleadoNombre)}</div>
          <div class="inc-card-meta">
            <span>${a.empleadoArea}</span>
            <span>${new Date(a.timestamp).toLocaleDateString('es-MX')}</span>
            ${a.tipoFaltaNombre ? `<span>${a.tipoFaltaNombre}</span>` : ''}
          </div>
          ${a.folio ? `<div style="font-size:11px;font-weight:700;color:var(--primary);font-family:var(--font-mono)">${a.folio}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="gravedad-badge grav-alta" style="${a.cancelada?'opacity:.5':''}">Acta</span>
          ${a.cancelada ? `<span style="font-size:10px;color:var(--text3);font-weight:600">Cancelada</span>` : ''}
          ${!a.cancelada && a.sancion && a.sancion !== 'ninguna' ? `<span style="font-size:10px;color:var(--warning);font-weight:600">${sancionLabel[a.sancion] || ''}</span>` : ''}
        </div>
      </div>
      <div class="inc-card-desc">${a.falta?.slice(0,100)}${a.falta?.length > 100 ? '...' : ''}</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <button class="btn-ghost" data-reimp="${a.id}" style="font-size:12px;padding:5px 10px">🖨 Reimprimir</button>
        ${!a.cancelada && !Session.isDireccion() ? `<button class="btn-ghost" data-gen-compromiso="${a.id}" data-acta-folio="${a.folio}" data-emp-id="${a.empleadoId}" style="font-size:12px;padding:5px 10px;color:var(--primary)">📋 Carta compromiso</button>` : ''}
        ${!a.recibidaConfirmada && !a.cancelada ? `<button class="btn-ghost" data-constancia="${a.id}" style="font-size:12px;padding:5px 10px">✋ Negativa</button>` : ''}
        ${Session.isAdmin() && !a.cancelada ? `<button class="btn-danger" data-cancelar-acta="${a.id}" style="font-size:12px;padding:5px 10px">Cancelar</button>` : ''}
      </div>
      <div style="margin-top:4px">
        ${a.cancelada ? `<span style="font-size:11px;color:var(--text3)">⊘ Cancelada — ${a.canceladoMotivo || ''} · Por: ${a.canceladoPor || ''}</span>` :
          a.recibidaConfirmada ?
          `<span style="font-size:12px;color:var(--success);display:flex;align-items:center;gap:4px">✓ Recibida por ${a.recibidaPor} — ${new Date(a.recibidaTs).toLocaleDateString('es-MX')}</span>` :
          Session.isAdmin() ? `<button class="btn-ghost" data-confirmar="${a.id}" style="font-size:12px;padding:5px 10px">✓ Confirmar recibida</button>` : ''
        }
      </div>
    </div>
  `).join('');
}

async function _attachEvents () {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-acta-nueva').classList.toggle('hidden', tab !== 'nueva');
      document.getElementById('tab-acta-historial').classList.toggle('hidden', tab !== 'historial');
      if (tab === 'historial') _renderHistorial();
    });
  });

  // Autocomplete empleado
  const input = document.getElementById('acta-emp-input');
  const list  = document.getElementById('acta-emp-list');
  input?.addEventListener('input', async () => {
    const q = input.value.trim();
    if (!q) { list.classList.add('hidden'); return; }
    let res = await DB_Empleados.search(q);
    if (!Session.isAdmin() && !Session.isDireccion()) res = res.filter(e => e.area === Session.getArea());
    res = res.slice(0,8);
    if (!res.length) { list.classList.add('hidden'); return; }
    list.innerHTML = res.map(e =>
      `<div class="autocomplete-item" data-id="${e.id}">${_toTitle(e.nombre)} <span>${e.area} — ${_toTitle(e.puesto)}</span></div>`
    ).join('');
    list.classList.remove('hidden');
  });

  list?.addEventListener('click', async e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const emp = await DB_Empleados.getById(item.dataset.id);
    if (!emp) return;
    _s.empId   = emp.id;
    _s.empData = emp;
    input.value = _toTitle(emp.nombre);
    list.classList.add('hidden');
    document.getElementById('acta-emp-info').classList.remove('hidden');
    document.getElementById('acta-emp-avatar').textContent = emp.nombre.split(' ').map(n=>n[0]).join('').slice(0,2);
    document.getElementById('acta-emp-nombre-disp').textContent = _toTitle(emp.nombre);
    document.getElementById('acta-emp-puesto-disp').textContent = `${_toTitle(emp.puesto)} — ${emp.area}`;
    _cargarIncidencias(emp.id);
    _actualizarHistorialBadge(emp.id);
  });

  if (window._actaClickHandler) document.removeEventListener('click', window._actaClickHandler);
  window._actaClickHandler = e => {
    if (!e.target.closest('#acta-emp-input') && !e.target.closest('#acta-emp-list')) {
      list?.classList.add('hidden');
    }
  };
  document.addEventListener('click', window._actaClickHandler);

  // Tipo de falta → fundamento legal + avisos
  document.getElementById('acta-tipo-falta')?.addEventListener('change', async e => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;

    // Autocompletar fundamento legal
    const artEl = document.getElementById('acta-articulo');
    if (artEl) artEl.value = opt.dataset.art || '';

    // Mostrar sanción del RIT (informativo)
    const sancionRit = document.getElementById('acta-sancion-rit');
    const sancionTxt = document.getElementById('acta-sancion-rit-texto');
    if (opt.dataset.sancion && sancionRit && sancionTxt) {
      sancionTxt.textContent = `RIT: ${opt.dataset.sancion}`;
      sancionRit.classList.remove('hidden');
    } else {
      sancionRit?.classList.add('hidden');
    }

    // Aviso causal de rescisión
    const aviso = document.getElementById('acta-aviso-rescision');
    if (opt.dataset.rescision === '1') {
      aviso?.classList.remove('hidden');
    } else {
      aviso?.classList.add('hidden');
    }
  });

  // Checkboxes de incidencias — manejados dentro de _cargarIncidencias

  // Sanción → aviso si es restringida + actualizar label resolución
  document.getElementById('acta-sancion')?.addEventListener('change', async e => {

    const val = e.target.value;
    const aviso = document.getElementById('acta-aviso-sancion');
    const texto = document.getElementById('acta-aviso-sancion-texto');
    if ((val === 'suspension7' || val === 'rescision') && aviso && texto) {
      texto.textContent = val === 'rescision'
        ? '⚠ La rescisión de contrato requiere autorización de Administración y evidencia suficiente en el expediente.'
        : '⚠ La suspensión de 1 semana requiere validación con Administración antes de notificar al colaborador.';
      aviso.classList.remove('hidden');
    } else {
      aviso?.classList.add('hidden');
    }
    // Actualizar placeholder de resolución según sanción
    const resEl = document.getElementById('acta-resolucion');
    const reqEl = document.getElementById('acta-resolucion-req');
    if (resEl) {
      if (val === 'ninguna') {
        resEl.placeholder = 'Obligatorio: explica por qué no se aplica sanción en este caso...';
        if (reqEl) reqEl.style.display = 'inline';
      } else {
        resEl.placeholder = 'Criterio aplicado para determinar la sanción...';
        if (reqEl) reqEl.style.display = 'inline';
      }
    }
  });

  // Guardar acta
  if (Session.isDireccion()) { document.getElementById('btn-guardar-acta')?.remove(); return; }
  document.getElementById('btn-guardar-acta')?.addEventListener('click', async () => {
    if (!_s.empId) { toastError('Selecciona un colaborador'); return; }
    const tipoFaltaEl = document.getElementById('acta-tipo-falta');
    if (!tipoFaltaEl?.value) { toastError('Selecciona el tipo de falta'); return; }
    const falta = document.getElementById('acta-falta').value.trim();
    if (!falta) { toastError('Describe la falta cometida'); return; }
    const sancionVal   = document.getElementById('acta-sancion').value;
    const resolucionVal = document.getElementById('acta-resolucion').value.trim();
    if (!resolucionVal) { toastError('La justificación de la decisión es obligatoria'); return; }

    const tipoFalta = TIPOS_INCIDENCIA.find(t => t.id === tipoFaltaEl.value);
    const user = Session.get();
    const acta = {
      empleadoId:      _s.empId,
      empleadoNombre:  _s.empData.nombre,
      empleadoPuesto:  _s.empData.puesto,
      empleadoArea:    _s.empData.area,
      fecha:           document.getElementById('acta-fecha').value,
      hora:            document.getElementById('acta-hora').value,
      tipoFaltaId:     tipoFaltaEl.value,
      tipoFaltaNombre: tipoFalta?.nombre || '',
      falta,
      articulo:        document.getElementById('acta-articulo').value,
      sancion:         document.getElementById('acta-sancion').value,
      replica:         document.getElementById('acta-replica').value.trim(),
      testigo1:        document.getElementById('acta-testigo1').value.trim(),
      testigo2:        document.getElementById('acta-testigo2').value.trim(),
      testigo3:        document.getElementById('acta-testigo3').value.trim(),
      levantaActa:     user.nombre,
      sucursal:        'PN 0509',
      direccion:       'Libramiento Manuel Pérez Treviño #400, Col. San Luis',
      registradoPor:   user.id,
      incidenciaIds:   _getIncidenciasSeleccionadas(),
      resolucion:      resolucionVal,
    };

    await DB_Actas.add(acta);
    toastOk('Acta guardada — generando PDF...');
    setTimeout(() => _generarPDF(acta), 300);
  });

  // Historial búsqueda
  document.getElementById('acta-hist-search')?.addEventListener('input', async e => {
    _renderHistorial(e.target.value);
  });

  // Eventos desde historial (reimprimir / negativa)
  document.addEventListener('reimprimir-acta', async function handler (e) {
    document.removeEventListener('reimprimir-acta', handler);
    _generarPDF(e.detail);
  });
  document.addEventListener('negativa-acta', async function handler (e) {
    document.removeEventListener('negativa-acta', handler);
    _generarConstanciaNegativa(e.detail);
  });

  // Reimprimir + confirmar recibida
  document.getElementById('tab-acta-historial')?.addEventListener('click', async e => {
    const reimp = e.target.closest('[data-reimp]');
    if (reimp) {
      const acta = await DB_Actas.getById(reimp.dataset.reimp);
      if (acta) _generarPDF(acta);
    }
    // Generar carta compromiso
    const genComp = e.target.closest('[data-gen-compromiso]');
    if (genComp) {
      const actaId    = genComp.dataset.genCompromiso;
      const actaFolio = genComp.dataset.actaFolio;
      const empId     = genComp.dataset.empId;
      const emp       = await DB_Empleados.getById(empId);
      go('compromisos', { actaId, actaFolio, empId, empData: emp });
      return;
    }
    const confirmar = e.target.closest('[data-confirmar]');
    if (confirmar) {
      const id = confirmar.dataset.confirmar;
      await DB_Actas.update(id, {
        recibidaConfirmada: true,
        recibidaPor: Session.get().nombre,
        recibidaTs:  Date.now(),
      });
      toastOk('Acta confirmada como recibida');
      _renderHistorial();
    }

    const cancelarActa = e.target.closest('[data-cancelar-acta]');
    if (cancelarActa && Session.isAdmin()) {
      const motivo = prompt('Motivo de cancelación del acta (obligatorio):');
      if (!motivo?.trim()) return;
      await DB_Actas.cancelar(cancelarActa.dataset.cancelarActa, motivo.trim(), Session.get());
      toastOk('Acta cancelada');
      _renderHistorial();
    }

    const constancia = e.target.closest('[data-constancia]');
    if (constancia) {
      const acta = await DB_Actas.getById(constancia.dataset.constancia);
      if (acta) _generarConstanciaNegativa(acta);
    }
  });
}

registerInit('actas', async () => {
  if (!Session.isActive()) { go('login'); return; }
  render();
  if (window._actaDesdeIncidencia) {
    const inc = window._actaDesdeIncidencia;
    window._actaDesdeIncidencia = null;
    setTimeout(async () => {
      const empInput = document.getElementById('acta-emp-input');
      if (!empInput) return;
      empInput.value = _toTitle(inc.empleadoNombre);
      document.getElementById('acta-emp-id').value = inc.empleadoId;
      const emp = await DB_Empleados.getById(inc.empleadoId);
      if (emp) {
        _s.empId   = emp.id;
        _s.empData = emp;
        document.getElementById('acta-emp-info')?.classList.remove('hidden');
        document.getElementById('acta-emp-avatar').textContent = emp.nombre.split(' ').map(n=>n[0]).join('').slice(0,2);
        document.getElementById('acta-emp-nombre-disp').textContent = _toTitle(emp.nombre);
        document.getElementById('acta-emp-puesto-disp').textContent = `${_toTitle(emp.puesto)} — ${emp.area}`;
        _cargarIncidencias(emp.id);
        _actualizarHistorialBadge(emp.id);
      }
      // Prellenar tipo de falta si viene de incidencia
      const tipoSel = document.getElementById('acta-tipo-falta');
      if (tipoSel && inc.tipoId) {
        tipoSel.value = inc.tipoId;
        tipoSel.dispatchEvent(new Event('change'));
      }
      const faltaEl = document.getElementById('acta-falta');
      if (faltaEl) faltaEl.value = inc.descripcion || '';
    }, 250);
  }
});
