// ============================================================
// core/auth.js — GesPer PWA Multi-tenant
// Login por email → busca usuario en Firestore → carga empresa
// ============================================================

import { ROLES } from './config.js';
import {
  auth, db,
  signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail,
  collection, doc, getDoc, getDocs,
  query, where,
} from './firebase.js';

const KEY = 'gesper_session';

// ── Helpers Firestore ─────────────────────────────────────
async function _findUserByEmail(email) {
  const clean = email.toLowerCase().trim();
  const snap = await getDocs(query(
    collection(db, 'usuarios'),
    where('email', '==', clean)
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function _getEmpresa(empresaId) {
  if (!empresaId) return null;
  const snap = await getDoc(doc(db, 'empresas', empresaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function _getSucursalesDeEmpresa(empresaId) {
  const snap = await getDocs(query(
    collection(db, 'sucursales'),
    where('empresaId', '==', empresaId)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Calcula los módulos visibles para el usuario.
 *   • admin_rh / director → UNIÓN de módulos de todas las sucursales
 *   • gerente             → módulos de SU sucursal
 */
function _calcModulos(user, sucursales) {
  const set = new Set();

  if (user.rol === ROLES.GERENTE && user.sucursalId && user.sucursalId !== 'todas') {
    const s = sucursales.find(x => x.id === user.sucursalId);
    if (s?.modulos) {
      Object.entries(s.modulos).forEach(([k, v]) => { if (v) set.add(k); });
    }
  } else {
    // admin_rh / director → unión de todas
    sucursales.forEach(s => {
      if (s.modulos) {
        Object.entries(s.modulos).forEach(([k, v]) => { if (v) set.add(k); });
      }
    });
  }

  return [...set];
}

// ── API SESIÓN ────────────────────────────────────────────
export const Session = {

  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();

    try {
      // 1) Firebase Auth
      await signInWithEmailAndPassword(auth, cleanEmail, password);

      // 2) Buscar en Firestore usuarios
      const user = await _findUserByEmail(cleanEmail);
      if (!user) {
        await signOut(auth);
        throw new Error('Usuario autenticado pero no configurado en el sistema. Contacta a soporte.');
      }

      if (user.activo === false) {
        await signOut(auth);
        throw new Error('Tu usuario está inactivo. Contacta a RH.');
      }

      // 3) Cargar empresa
      const empresa = await _getEmpresa(user.empresaId);
      if (!empresa) {
        await signOut(auth);
        throw new Error('Empresa no encontrada. Contacta a soporte.');
      }

      if (empresa.activo === false) {
        await signOut(auth);
        throw new Error('Esta empresa no tiene acceso activo. Contacta a soporte.');
      }

      // 4) Cargar sucursales de la empresa
      const sucursales = await _getSucursalesDeEmpresa(user.empresaId);

      // 5) Calcular módulos visibles
      const modulos = _calcModulos(user, sucursales);

      // 6) Guardar sesión
      const session = {
        uid:         auth.currentUser?.uid || '',
        userId:      user.id,
        email:       user.email,
        nombre:      user.nombre,
        rol:         user.rol,
        empresaId:   user.empresaId,
        sucursalId:  user.sucursalId || 'todas',
        area:        user.area || null,
        authUid:     user.authUid || null,
        empresa: {
          id:           empresa.id,
          nombre:       empresa.nombre,
          logo_url:     empresa.logo_url || '',
          colores:      empresa.colores || { primary: '#0F766E', secondary: '#14B8A6' },
          tiene_rit:    !!empresa.tiene_rit,
          plan:         empresa.plan || 'starter',
        },
        sucursales,
        modulos,
        loginAt: Date.now(),
      };

      localStorage.setItem(KEY, JSON.stringify(session));
      return session;

    } catch (e) {
      console.warn('[Auth] login error:', e?.code || e?.message || e);
      throw e;
    }
  },

  async logout() {
    try { await signOut(auth); } catch (_) {}
    localStorage.removeItem(KEY);
  },

  async sendResetEmail(email) {
    const clean = (email || '').trim().toLowerCase();
    await sendPasswordResetEmail(auth, clean);
  },

  // ── Getters ─────────────────────────────────────────────
  get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; }
    catch { return null; }
  },

  isActive()       { return !!this.get(); },

  getUser()        { return this.get(); },
  getUserId()      { return this.get()?.userId || null; },
  getEmail()       { return this.get()?.email  || null; },
  getUsuario()     { return this.get()?.email  || null; }, // alias compat
  getNombre()      { return this.get()?.nombre || null; },
  getRole()        { return this.get()?.rol    || null; },
  getArea()        { return this.get()?.area   || null; },

  // Multi-tenant
  getEmpresaId()   { return this.get()?.empresaId  || null; },
  getEmpresa()     { return this.get()?.empresa    || null; },
  getSucursalId()  { return this.get()?.sucursalId || null; },
  getSucursales()  { return this.get()?.sucursales || []; },
  getModulos()     { return this.get()?.modulos    || []; },

  hasModulo(id)    { return this.getModulos().includes(id); },

  // Roles
  isAdmin()        { return this.getRole() === ROLES.ADMIN; },
  isDireccion()    { return this.getRole() === ROLES.DIRECCION; },
  isGerente()      { return this.getRole() === ROLES.GERENTE; },
  isAdminOrDir()   { return this.isAdmin() || this.isDireccion(); },
  isAllSucursales(){ return !this.getSucursalId() || this.getSucursalId() === 'todas'; },
};
