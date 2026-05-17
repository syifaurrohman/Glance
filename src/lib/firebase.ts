import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "glance-app-65267.firebaseapp.com",
  projectId: "glance-app-65267",
  storageBucket: "glance-app-65267.firebasestorage.app",
  messagingSenderId: "417130758217",
  appId: "1:417130758217:web:3902df4710ca14fb6fbf98"
};

// Guard: hanya init jika apiKey tersedia
const app = firebaseConfig.apiKey
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const APP_ID = 'glance-v2-ultimate';