import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDt05uBSSjSBZgLWC1v_r__H7Tr8wPV3zc",
  authDomain: "glance-app-65267.firebaseapp.com",
  projectId: "glance-app-65267",
  storageBucket: "glance-app-65267.firebasestorage.app",
  messagingSenderId: "417130758217",
  appId: "1:417130758217:web:3902df4710ca14fb6fbf98"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const APP_ID = 'glance-v2-ultimate';
