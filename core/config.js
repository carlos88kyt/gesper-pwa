// ============================================================
// core/config.js — GesPer PWA Multi-tenant
// Ya no hay DEMO_USERS ni DEMO_EMPLEADOS: vienen de Firestore
// ============================================================

export const APP_NAME  = 'GesPer';
export const VERSION   = 'v2.0.0';

// ── Compatibilidad con módulos legacy ─────────────────────
// Los módulos actas/reportes/permisos importan AGENCIA, CIUDAD,
// SUCURSAL como constantes. En multi-tenant estos valores vienen
// de la sesión activa. Las exponemos como "constantes" que se
// evalúan dinámicamente vía toString() en template literals.
function _readSession() {
  try { return JSON.parse(localStorage.getItem('gesper_session')) || {}; }
  catch { return {}; }
}

function _sucursalNombre() {
  const s = _readSession();
  if (!s.sucursales || !s.sucursalId) return '';
  if (s.sucursalId === 'todas') return 'Todas las sucursales';
  const suc = s.sucursales.find(x => x.id === s.sucursalId);
  return suc?.nombre || '';
}

// Estos objetos heredan de String y reescriben toString() para
// que los template literals (`${AGENCIA}`) los evalúen al vuelo.
function _dyn(getter) {
  const obj = Object.create(String.prototype);
  obj.toString = getter;
  obj.valueOf  = getter;
  return obj;
}

export const AGENCIA  = _dyn(() => _readSession().empresa?.nombre || 'GesPer');
export const CIUDAD   = _dyn(() => _readSession().empresa?.ciudad || '');
export const SUCURSAL = _dyn(_sucursalNombre);

// ── Defaults globales (sobrescritos por config empresa) ───
export const DEFAULT_BRANDING = {
  nombre: 'GesPer',
  logo_url: '',
  colores: { primary: '#0F766E', secondary: '#14B8A6' },
};

// ── Umbrales (constantes globales, no dependen de empresa) ─
export const UMBRAL_REINCIDENCIA_DIAS  = 30;
export const UMBRAL_REINCIDENCIA_COUNT = 3;
export const UMBRAL_INACTIVIDAD_DIAS   = 7;

// ── Roles del sistema ─────────────────────────────────────
export const ROLES = {
  ADMIN:     'admin_rh',
  DIRECCION: 'director',
  GERENTE:   'gerente',
};
// ── Áreas / Departamentos del sistema ──────────────────────
// Estas son las áreas estándar para Índice Automotriz.
// En v2.1 se podrán customizar por empresa en config.
export const AREAS = [
  'Ventas',
  'Servicio',
  'Administrativo',
  'Refacciones',
  'Marketing',
  'Seminuevos',
];

// ── Estados ───────────────────────────────────────────────
export const ESTADOS = { ACTIVA: 'activa', CANCELADA: 'cancelada' };

// ── Catálogo de tipos de incidencia (reglamento LFT genérico) ─
// NOTA: Los artículos son del reglamento Índice Automotriz.
// En v2.1 se podrá customizar por empresa (config.reglamento_id)
export const TIPOS_INCIDENCIA = [
  {
    id: 'retardo',
    nombre: 'Retardo',
    gravedad: 'baja',
    activo: true,
    sancion: 'Por 2 retardos en 30 días: 1 día de suspensión sin goce de sueldo. Por 3 retardos: 2 días. Por 4 retardos: 6 días.',
    articulo: 'Art. 134 Fracc. V de la Ley Federal del Trabajo.',
  },
  {
    id: 'falta',
    nombre: 'Falta injustificada',
    gravedad: 'media',
    activo: true,
    sancion: 'Por 1 falta: 1 día de suspensión sin goce de sueldo. Por 2 faltas en 30 días: 2 días. Por 3 faltas: 6 días. Más de 3 faltas en 30 días: posible rescisión.',
    articulo: 'Art. 47 Fracc. X de la Ley Federal del Trabajo.',
  },
  {
    id: 'incumplimiento',
    nombre: 'Incumplimiento de proceso',
    gravedad: 'media',
    activo: true,
    sancion: 'Por 1 ocasión en 30 días: 2 días de suspensión sin goce de sueldo. Por 2 ocasiones: 3 días. Por 3 ocasiones: 6 días.',
    articulo: 'Art. 134 Fracc. I de la Ley Federal del Trabajo.',
  },
  {
    id: 'mala_atencion',
    nombre: 'Mala atención a cliente',
    gravedad: 'alta',
    activo: true,
    sancion: 'Amonestación por escrito o suspensión según gravedad y reincidencia. Puede derivar en rescisión.',
    articulo: 'Art. 47 Fracc. II de la Ley Federal del Trabajo.',
  },
  {
    id: 'conflicto',
    nombre: 'Conflicto interno',
    gravedad: 'alta',
    activo: true,
    sancion: 'Suspensión o rescisión según gravedad del acto.',
    articulo: 'Art. 47 Fracc. II y III de la Ley Federal del Trabajo.',
  },
  {
    id: 'uso_indebido',
    nombre: 'Uso indebido de recursos / vehículos',
    gravedad: 'alta',
    activo: true,
    sancion: 'Por 1 ocasión en 30 días: 5 días de suspensión. Por 2 ocasiones: 6 días. Por 3 ocasiones: 8 días. Sin perjuicio de rescisión.',
    articulo: 'Art. 47 Fracc. V de la Ley Federal del Trabajo.',
  },
  {
    id: 'bajo_desempeno',
    nombre: 'Bajo desempeño',
    gravedad: 'media',
    activo: true,
    sancion: 'Amonestación verbal o escrita. Suspensión en caso de reincidencia.',
    articulo: 'Art. 134 Fracc. II de la Ley Federal del Trabajo.',
  },
  {
    id: 'uniforme',
    nombre: 'No portar uniforme completo',
    gravedad: 'baja',
    activo: true,
    sancion: 'Por 1 día: amonestación por escrito. Por 2 días en 30 días: 1 día de suspensión. Por 3 días: 3 días de suspensión.',
    articulo: 'Reglamento Interior de Trabajo aplicable.',
  },
  {
    id: 'celular',
    nombre: 'Uso indebido de celular / dispositivos',
    gravedad: 'baja',
    activo: true,
    sancion: 'Por 1 ocasión: amonestación. Por 2 en 30 días: 1 día de suspensión. Por 3: 3 días.',
    articulo: 'Reglamento Interior de Trabajo aplicable.',
  },
  {
    id: 'abandono_area',
    nombre: 'Abandono de área sin autorización',
    gravedad: 'media',
    activo: true,
    sancion: 'Por 1 ocasión en 30 días: 2 días de suspensión. Por 2: 3 días. Por 3: 6 días.',
    articulo: 'Reglamento Interior de Trabajo aplicable.',
  },
  {
    id: 'confidencialidad',
    nombre: 'Violación a confidencialidad',
    gravedad: 'critica',
    activo: true,
    sancion: 'Por 1 ocasión: 5 a 8 días de suspensión. Puede derivar en rescisión sin responsabilidad para la empresa.',
    articulo: 'Art. 47 Fracc. IX de la Ley Federal del Trabajo.',
  },
  {
    id: 'hostigamiento_sexual',
    nombre: 'Hostigamiento sexual',
    gravedad: 'critica',
    activo: true,
    sancion: 'Causa de rescisión sin responsabilidad para la empresa. Requiere investigación formal.',
    articulo: 'Art. 3 Bis y Art. 47 Fracc. VIII de la Ley Federal del Trabajo.',
  },
  {
    id: 'acoso_sexual',
    nombre: 'Acoso sexual',
    gravedad: 'critica',
    activo: true,
    sancion: 'Causa de rescisión sin responsabilidad para la empresa. Requiere investigación formal.',
    articulo: 'Art. 3 Bis de la Ley Federal del Trabajo.',
  },
  {
    id: 'acoso_laboral',
    nombre: 'Acoso laboral / Bullying / Mobbing',
    gravedad: 'alta',
    activo: true,
    sancion: 'Suspensión o rescisión según gravedad y reincidencia.',
    articulo: 'Art. 3 Bis y Art. 51 Fracc. II de la Ley Federal del Trabajo.',
  },
  {
    id: 'violencia_amenazas',
    nombre: 'Violencia o amenazas graves',
    gravedad: 'critica',
    activo: true,
    sancion: 'Causa de rescisión sin responsabilidad para la empresa.',
    articulo: 'Art. 47 Fracc. II y III de la Ley Federal del Trabajo.',
  },
  {
    id: 'alcohol_drogas',
    nombre: 'Presentarse bajo influencia de alcohol o drogas',
    gravedad: 'critica',
    activo: true,
    sancion: 'Causa de rescisión sin responsabilidad para la empresa, salvo prescripción médica.',
    articulo: 'Art. 47 Fracc. VII de la Ley Federal del Trabajo.',
  },
  {
    id: 'fumar_area_prohibida',
    nombre: 'Fumar en área prohibida',
    gravedad: 'baja',
    activo: true,
    sancion: 'Por 1 ocasión: amonestación. Por 2 en 30 días: 1 día de suspensión. Por 3: 3 días.',
    articulo: 'Reglamento Interior de Trabajo aplicable.',
  },
  {
    id: 'dano_vehiculo_instalaciones',
    nombre: 'Daño a vehículo o instalaciones',
    gravedad: 'alta',
    activo: true,
    sancion: 'Por 1 ocasión: 5 días de suspensión. Por 2: 6 días. Por 3: 8 días. Sin perjuicio de rescisión.',
    articulo: 'Art. 47 Fracc. V y VI de la Ley Federal del Trabajo.',
  },
  {
    id: 'otro',
    nombre: 'Otro (especificar en descripción)',
    gravedad: 'media',
    activo: true,
    sancion: 'A criterio de la empresa, según gravedad y antecedentes del trabajador.',
    articulo: 'Disposiciones aplicables de la Ley Federal del Trabajo.',
  },
];

export const GRAVEDADES = {
  baja:    { label: 'Baja',    cls: 'grav-baja'    },
  media:   { label: 'Media',   cls: 'grav-media'   },
  alta:    { label: 'Alta',    cls: 'grav-alta'    },
  critica: { label: 'Crítica', cls: 'grav-critica' },
};

// ── Evaluación de Desempeño (constantes globales) ─────────
export const EVAL_TIPO_PUESTO_MAP = {
  'EJECUTIVO DE VENTAS':           'ventas',
  'EJECUTIVO DE VENTAS SEMINUEVOS':'ventas',
  'EJECUTIVO FLOTILLA':            'ventas',
  'EJECUTIVO SEMINUEVOS':          'ventas',
  'ENCARGADO DE SEGUROS':          'ventas',
  'GERENTE DE VENTAS':             'ventas',
  'HOSTESS':                       'ventas',
  'VENTAS MOSTRADOR':              'ventas',
  'GTE DE MARKETING / CRM':        'ventas',
  'AUXILIAR ADMINISTRATIVO':       'administrativo',
  'CAJA':                          'administrativo',
  'COMMUNITY MANAGER':             'administrativo',
  'CONSULTOR DE EXPERIENCIA':      'administrativo',
  'ENCARGADO DE OBRA':             'administrativo',
  'GERENTE DE REFACCIONES':        'administrativo',
  'GERENTE DE SERVICIOS FINANCIEROS':'administrativo',
  'MENSAJERIA':                    'administrativo',
  'SERVICIOS GENERALES':           'administrativo',
  'ASISTENTE DE SERVICIO':         'administrativo',
  'GERENTE DE POST VENTA':         'administrativo',
  'ADMINISTRADOR DE GARANTIAS':    'operativo',
  'ASESOR DE SERVICIO':            'operativo',
  'GUARDIA DE SEGURIDAD':          'operativo',
  'JEFE DE TALLER':                'operativo',
  'LAVADOR':                       'operativo',
  'TECNICO MECANICO':              'operativo',
  'TECNICO PREPARADOR':            'operativo',
};

export const EVAL_CLASIFICACIONES = {
  excelente: { min: 34, max: 40, label: '⭐ Excelente', color: '#059669' },
  bueno:     { min: 26, max: 33, label: '✅ Bueno',     color: '#0284C7' },
  regular:   { min: 18, max: 25, label: '⚠️ Regular',  color: '#D97706' },
  critico:   { min: 0,  max: 17, label: '🔴 Crítico',  color: '#DC2626' },
};

export const EVAL_ACCIONES = {
  excelente: 'Reconocimiento formal. Considerar para plan de desarrollo o incremento salarial.',
  bueno:     'Seguimiento normal. Retroalimentación positiva en sesión con el colaborador.',
  regular:   'Plan de mejora 60 días. Reunión RH + gerente + colaborador. Seguimiento mensual.',
  critico:   'Acta administrativa. Carta compromiso. Si es segunda evaluación crítica: iniciar proceso de baja.',
  en_revision: 'Admin investiga indicador D antes de proceder. Puede derivar en cualquier clasificación.',
};

// ── Módulos disponibles del sistema ───────────────────────
// Solo se renderizan si están en empresa.modulos_habilitados
export const MODULOS = {
  dashboard:     { id: 'dashboard',     nombre: 'Dashboard',     siempre: true  },
  personal:      { id: 'personal',      nombre: 'Personal',      siempre: false },
  incidencias:   { id: 'incidencias',   nombre: 'Incidencias',   siempre: false },
  actas:         { id: 'actas',         nombre: 'Actas',         siempre: false },
  permisos:      { id: 'permisos',      nombre: 'Permisos',      siempre: false },
  historial:     { id: 'historial',     nombre: 'Historial',     siempre: false },
  reportes:      { id: 'reportes',      nombre: 'Reportes',      siempre: false },
  documentos:    { id: 'documentos',    nombre: 'Documentos',    siempre: false },
  compromisos:   { id: 'compromisos',   nombre: 'Compromisos',   siempre: false },
  clima:         { id: 'clima',         nombre: 'Clima laboral', siempre: false },
  evaluacion:    { id: 'evaluacion',    nombre: 'Evaluación',    siempre: false },
};
