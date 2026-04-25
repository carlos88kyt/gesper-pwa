// ============================================================
// core/firebase.js — GesPer PWA Multi-tenant
// Proyecto: gesper-maestro (compartido con Panel Maestro)
// ============================================================

import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged,
         updatePassword, EmailAuthProvider,
         sendPasswordResetEmail,
         reauthenticateWithCredential }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc,
         getDoc, getDocs, setDoc, updateDoc, addDoc,
         deleteDoc, query, where, orderBy,
         onSnapshot, Timestamp }                  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyBXHU386CCjLrelqJLq2MxM_LyHtWzARfs",
  authDomain:        "gesper-maestro.firebaseapp.com",
  projectId:         "gesper-maestro",
  storageBucket:     "gesper-maestro.firebasestorage.app",
  messagingSenderId: "642999286814",
  appId:             "1:642999286814:web:162be896b8737dadfa020f"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  deleteDoc, query, where, orderBy, onSnapshot, Timestamp
};
