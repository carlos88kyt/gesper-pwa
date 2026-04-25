// ============================================================
// core/db.js — GesPer PWA Multi-tenant
// Paths dinámicos: empresas_data/{empresaId}/{coleccion}
// Misma API que antes — módulos no cambian
// ============================================================

import { TIPOS_INCIDENCIA,
         UMBRAL_REINCIDENCIA_DIAS, UMBRAL_REINCIDENCIA_COUNT } from './config.js';
import { db, collection, doc, getDoc, getDocs, setDoc,
         updateDoc, query, where, orderBy, Timestamp } from './firebase.js';
import { Session } from './auth.js';

// ── Vigencias semáforo ────────────────────────────────────
const VIGENCIA_INC_DIAS  = 90;
const VIGENCIA_ACTA_DIAS = 365;

function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// ── Colecciones (nombres cortos, se prefijan dinámicamente) ──
const COL_EMP      = 'empleados';
const COL_INC      = 'incidencias';
const COL_ACTAS    = 'actas';
const COL_PERMISOS = 'permisos';
const COL_COM      = 'compromisos';
const COL_EVAL_CICLOS = 'evaluaciones_ciclos';
const COL_EVAL        = 'evaluaciones';

// ──────────────────────────────────────────────────────────
// MULTI-TENANT: construcción de paths
// empresas_data/{empresaId}/{coleccion}
// ──────────────────────────────────────────────────────────
function _tenantPath(col) {
  const empresaId = Session.getEmpresaId();
  if (!empresaId) {
    throw new Error('[DB] Sin sesión: no se puede acceder a ' + col);
  }
  return `empresas_data/${empresaId}/${col}`;
}

// ── Helpers Firestore (ahora multi-tenant) ────────────────
async function _getAll(col) {
  try {
    const snap = await getDocs(collection(db, _tenantPath(col)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error('[DB]', col, e); return []; }
}

async function _getById(col, id) {
  try {
    const snap = await getDoc(doc(db, _tenantPath(col), id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch(e) { return null; }
}

async function _set(col, id, data) {
  await setDoc(doc(db, _tenantPath(col), id), data);
}

async function _update(col, id, changes) {
  await updateDoc(doc(db, _tenantPath(col), id), changes);
}

// ──────────────────────────────────────────────────────────
// EMPLEADOS
// ──────────────────────────────────────────────────────────
export const DB_Empleados = {
  async getAll()    { return _getAll(COL_EMP); },
  async getById(id) { return _getById(COL_EMP, id); },

  async search(q) {
    const all = await this.getAll();
    if (!q) return all;
    const lq = q.toLowerCase();
    return all.filter(e =>
      (e.nombre || '').toLowerCase().includes(lq) ||
      (e.area   || '').toLowerCase().includes(lq)
    );
  },

  async add(emp) {
    const nuevo = { ...emp, id: _uid() };
    await _set(COL_EMP, nuevo.id, nuevo);
    return nuevo;
  },

  async update(id, cambios) {
    await _update(COL_EMP, id, cambios);
    return true;
  },

  async remove(id) {
    await _update(COL_EMP, id, { activo: false });
  },
};

// ──────────────────────────────────────────────────────────
// INCIDENCIAS
// ──────────────────────────────────────────────────────────
export const DB_Incidencias = {
  async getAll() { return _getAll(COL_INC); },

  async getByEmpleado(empId) {
    const all = await this.getAll();
    return all.filter(i => i.empleadoId === empId)
              .sort((a,b) => b.timestamp - a.timestamp);
  },

  async getByArea(area) {
    const all = await this.getAll();
    return all.filter(i => i.area === area)
              .sort((a,b) => b.timestamp - a.timestamp);
  },

  async getRecientes(dias = 30) {
    const all   = await this.getAll();
    const desde = Date.now() - dias * 86400000;
    return all.filter(i => i.timestamp >= desde && i.estado !== 'cancelada')
              .sort((a,b) => b.timestamp - a.timestamp);
  },

  async getVigentes(empId) {
    const desde = Date.now() - VIGENCIA_INC_DIAS * 86400000;
    const all   = await this.getByEmpleado(empId);
    return all.filter(i => i.timestamp >= desde && i.estado !== 'cancelada' && i.estado !== 'resuelta');
  },

  async add(data, usuario) {
    const nueva = {
      ...data,
      id: _uid(),
      timestamp: Date.now(),
      registradoPor: usuario.userId || usuario.id,
      registradoPorNombre: usuario.nombre,
      estado: 'activa',
      bitacora: [],
    };
    await _set(COL_INC, nueva.id, nueva);
    return nueva;
  },

  async agregarNota(id, nota, usuario) {
    const inc = await _getById(COL_INC, id);
    if (!inc) return false;
    const bitacora = inc.bitacora || [];
    bitacora.push({ texto: nota, autor: usuario.nombre, ts: Date.now() });
    const estado = inc.estado === 'activa' ? 'en_seguimiento' : inc.estado;
    await _update(COL_INC, id, { bitacora, estado });
    return true;
  },

  async resolver(id, notaCierre, usuario) {
    const inc = await _getById(COL_INC, id);
    if (!inc) return false;
    const bitacora = inc.bitacora || [];
    bitacora.push({ texto: '✅ CIERRE: ' + notaCierre, autor: usuario.nombre, ts: Date.now() });
    await _update(COL_INC, id, { bitacora, estado: 'resuelta', resueltoTs: Date.now() });
    return true;
  },

  async escalar(id, usuario) {
    const inc = await _getById(COL_INC, id);
    if (!inc) return false;
    const bitacora = inc.bitacora || [];
    bitacora.push({ texto: '📄 Escalada a Acta Administrativa', autor: usuario.nombre, ts: Date.now() });
    await _update(COL_INC, id, { bitacora, estado: 'escalada' });
    return true;
  },

  async cancelar(id, motivo, usuario) {
    await _update(COL_INC, id, {
      estado: 'cancelada',
      canceladoMotivo: motivo,
      canceladoPor: usuario.nombre,
      canceladoTs: Date.now(),
    });
    return true;
  },

  async detectarReincidencias() {
    const umbralMs = UMBRAL_REINCIDENCIA_DIAS * 86400000;
    const desde    = Date.now() - umbralMs;
    const all      = await this.getAll();
    const activas  = all.filter(i =>
      (i.estado === 'activa' || i.estado === 'en_seguimiento') && i.timestamp >= desde
    );
    const grupos = {};
    activas.forEach(i => {
      const key = `${i.empleadoId}::${i.tipoId}`;
      if (!grupos[key]) grupos[key] = {
        empId: i.empleadoId, nombre: i.empleadoNombre,
        tipoNombre: i.tipoNombre, count: 0, area: i.area
      };
      grupos[key].count++;
    });
    return Object.values(grupos)
      .filter(g => g.count >= UMBRAL_REINCIDENCIA_COUNT)
      .sort((a,b) => b.count - a.count);
  },

  async getKPIs(areaFiltro = null) {
    const all      = await this.getAll();
    const filtrado = areaFiltro ? all.filter(i => i.area === areaFiltro) : all;
    const hoy   = Date.now();
    const mes30 = hoy - 30 * 86400000;
    const mes60 = hoy - 60 * 86400000;
    const activas = ['activa','en_seguimiento','escalada'];
    const esteMes   = filtrado.filter(i => i.timestamp >= mes30 && activas.includes(i.estado));
    const mesPasado = filtrado.filter(i => i.timestamp >= mes60 && i.timestamp < mes30 && activas.includes(i.estado));
    const altas     = esteMes.filter(i => i.gravedad === 'alta' || i.gravedad === 'critica');
    const porEmp = {};
    esteMes.forEach(i => {
      porEmp[i.empleadoId] = porEmp[i.empleadoId] || { empId: i.empleadoId, nombre: i.empleadoNombre, area: i.area, count: 0 };
      porEmp[i.empleadoId].count++;
    });
    const rankingEmp = Object.values(porEmp).sort((a,b) => b.count - a.count).slice(0,5);
    const porArea = {};
    esteMes.forEach(i => { porArea[i.area] = (porArea[i.area] || 0) + 1; });
    const delta = mesPasado.length > 0
      ? Math.round(((esteMes.length - mesPasado.length) / mesPasado.length) * 100) : null;
    const reincidencias = await this.detectarReincidencias();
    return { total: esteMes.length, altas: altas.length, rankingEmp, porArea, delta, reincidencias };
  },
};

// ──────────────────────────────────────────────────────────
// ACTAS
// ──────────────────────────────────────────────────────────
async function _generarFolio() {
  const anio  = new Date().getFullYear();
  const all   = await DB_Actas.getAll();
  const count = all.filter(a => {
    const d = new Date(a.timestamp);
    return d.getFullYear() === anio && !a.cancelada;
  }).length + 1;
  return `ACT-${anio}-${String(count).padStart(3,'0')}`;
}

export const DB_Actas = {
  async getAll()    { return _getAll(COL_ACTAS); },
  async getById(id) { return _getById(COL_ACTAS, id); },

  async getByEmpleado(empId) {
    const all = await this.getAll();
    return all.filter(a => a.empleadoId === empId)
              .sort((a,b) => b.timestamp - a.timestamp);
  },

  async getVigentes(empId) {
    const desde = Date.now() - VIGENCIA_ACTA_DIAS * 86400000;
    const all   = await this.getByEmpleado(empId);
    return all.filter(a => a.timestamp >= desde && !a.cancelada);
  },

  async add(data) {
    const folio = await _generarFolio();
    const nueva = { ...data, id: _uid(), folio, timestamp: Date.now() };
    await _set(COL_ACTAS, nueva.id, nueva);
    return nueva;
  },

  async update(id, cambios) {
    await _update(COL_ACTAS, id, cambios);
  },

  async cancelar(id, motivo, usuario) {
    await _update(COL_ACTAS, id, {
      cancelada: true,
      canceladoMotivo: motivo,
      canceladoPor: usuario.nombre,
      canceladoTs: Date.now(),
    });
    return true;
  },
};

// ──────────────────────────────────────────────────────────
// SEMÁFORO
// ──────────────────────────────────────────────────────────
export async function calcularSemaforo(empId) {
  const incs  = await DB_Incidencias.getVigentes(empId);
  const actas = await DB_Actas.getVigentes(empId);
  if (actas.length >= 2 || incs.length >= 4) return { color: 'rojo',     emoji: '🔴', label: 'Alerta' };
  if (actas.length >= 1 || incs.length >= 2) return { color: 'amarillo', emoji: '🟡', label: 'Seguimiento' };
  return { color: 'verde', emoji: '🟢', label: 'Sin incidencias' };
}

// ──────────────────────────────────────────────────────────
// PERMISOS
// ──────────────────────────────────────────────────────────
export const DB_Permisos = {
  async getAll() { return _getAll(COL_PERMISOS); },

  async getByEmpleado(empId) {
    const all = await this.getAll();
    return all.filter(p => p.empleadoId === empId).sort((a,b) => b.timestamp - a.timestamp);
  },

  async getByArea(area) {
    const all = await this.getAll();
    return all.filter(p => p.empleadoArea === area).sort((a,b) => b.timestamp - a.timestamp);
  },

  async add(data, usuario) {
    const nuevo = {
      ...data, id: _uid(),
      timestamp: Date.now(),
      registradoPor: usuario.userId || usuario.id,
      registradoPorNombre: usuario.nombre,
    };
    await _set(COL_PERMISOS, nuevo.id, nuevo);
    return nuevo;
  },
};

// ──────────────────────────────────────────────────────────
// CONFIG (umbrales constantes)
// ──────────────────────────────────────────────────────────
export const DB_Config = {
  get()    { return { umbralDias: UMBRAL_REINCIDENCIA_DIAS, umbralCount: UMBRAL_REINCIDENCIA_COUNT }; },
  set(val) { console.log('[DB_Config] set:', val); },
};

// ──────────────────────────────────────────────────────────
// COMPROMISOS
// ──────────────────────────────────────────────────────────
async function _generarFolioCompromiso() {
  const anio  = new Date().getFullYear();
  const all   = await DB_Compromisos.getAll();
  const count = all.filter(c => {
    const d = new Date(c.timestamp);
    return d.getFullYear() === anio;
  }).length + 1;
  return `COM-${anio}-${String(count).padStart(3,'0')}`;
}

export const DB_Compromisos = {
  async getAll()    { return _getAll(COL_COM); },
  async getById(id) { return _getById(COL_COM, id); },

  async getByEmpleado(empId) {
    const all = await this.getAll();
    return all.filter(c => c.empleadoId === empId).sort((a,b) => b.timestamp - a.timestamp);
  },

  async getByArea(area) {
    const all = await this.getAll();
    return all.filter(c => (c.empleadoArea||'').toLowerCase() === area.toLowerCase())
              .sort((a,b) => b.timestamp - a.timestamp);
  },

  async getVencidas() {
    const all = await this.getAll();
    const hoy = new Date().toISOString().split('T')[0];
    return all.filter(c => c.estado === 'en_seguimiento' && c.fechaLimite < hoy);
  },

  async add(data, usuario) {
    const folio = await _generarFolioCompromiso();
    const nuevo = {
      ...data, id: _uid(), folio,
      estado: 'en_seguimiento',
      seguimiento: [],
      timestamp: Date.now(),
      creadoPor: usuario.userId || usuario.id,
      creadoPorNombre: usuario.nombre,
    };
    await _set(COL_COM, nuevo.id, nuevo);
    return nuevo;
  },

  async agregarNota(id, texto, usuario) {
    const c = await _getById(COL_COM, id);
    const seg = c.seguimiento || [];
    seg.push({ texto, autor: usuario.nombre, ts: Date.now() });
    await _update(COL_COM, id, { seguimiento: seg });
  },

  async cerrar(id, estado, nota, usuario) {
    await _update(COL_COM, id, {
      estado,
      cierreNota: nota,
      cierrePor:  usuario.nombre,
      cierreTs:   Date.now(),
    });
  },

  async update(id, cambios) { await _update(COL_COM, id, cambios); },
};

// ──────────────────────────────────────────────────────────
// EVALUACIÓN DE DESEMPEÑO
// ──────────────────────────────────────────────────────────
export const DB_EvalCiclos = {
  async getAll()    { return _getAll(COL_EVAL_CICLOS); },
  async getActivo() {
    const all = await this.getAll();
    return all.find(c => c.estado === 'activo') || null;
  },
  async create(data) {
    const nuevo = { ...data, id: _uid(), estado: 'activo', creadoEn: Date.now() };
    await _set(COL_EVAL_CICLOS, nuevo.id, nuevo);
    return nuevo;
  },
  async update(id, cambios) { await _update(COL_EVAL_CICLOS, id, cambios); },
  async cerrar(id) { await _update(COL_EVAL_CICLOS, id, { estado: 'cerrado', cerradoEn: Date.now() }); },
};

export const DB_Evaluaciones = {
  async getAll()    { return _getAll(COL_EVAL); },
  async getById(id) { return _getById(COL_EVAL, id); },

  async getByCiclo(cicloId) {
    const all = await this.getAll();
    return all.filter(e => e.cicloId === cicloId);
  },

  async getByGerente(gerenteUsuario, cicloId) {
    const all = await this.getAll();
    return all.filter(e => e.cicloId === cicloId && e.gerenteUsuario === gerenteUsuario);
  },

  async getByArea(area, cicloId) {
    const all = await this.getAll();
    return all.filter(e => e.cicloId === cicloId && e.area === area);
  },

  async create(data) {
    const nuevo = { ...data, id: _uid(), estado: 'borrador', creadoEn: Date.now() };
    await _set(COL_EVAL, nuevo.id, nuevo);
    return nuevo;
  },

  async update(id, cambios) {
    await _update(COL_EVAL, id, { ...cambios, actualizadoEn: Date.now() });
  },

  async validar(id, firmadaEn) {
    await _update(COL_EVAL, id, { estado: 'validada', firmadaEn, actualizadoEn: Date.now() });
  },

  async bloquear(id, motivo) {
    await _update(COL_EVAL, id, { estado: 'bloqueada', bloqueoMotivo: motivo, actualizadoEn: Date.now() });
  },
};
