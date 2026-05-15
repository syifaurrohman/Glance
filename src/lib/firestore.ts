import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';

// --- TYPES ---
export type FirestoreDataType = 'transactions' | 'categories' | 'budgets';

// --- FIRESTORE STATUS ---
let _firestoreAvailable = true;
export function isFirestoreAvailable(): boolean {
  return _firestoreAvailable;
}

// --- PATH HELPERS ---
function getDocPath(uid: string, type: FirestoreDataType): string {
  return `artifacts/${APP_ID}/users/${uid}/data/${type}`;
}

// --- LOCALSTORAGE HELPERS ---
function lsKey(uid: string, type: FirestoreDataType): string {
  return `glance_v2_${uid}_${type}`;
}

function saveToLocalStorage<T>(uid: string, type: FirestoreDataType, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(lsKey(uid, type), JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${type} to localStorage:`, e);
  }
}

function loadFromLocalStorage<T>(uid: string, type: FirestoreDataType, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(lsKey(uid, type));
    if (raw) return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Failed to load ${type} from localStorage:`, e);
  }
  return fallback;
}

// --- LOAD DATA ---
export async function loadFromFirestore<T>(uid: string, type: FirestoreDataType, fallback: T): Promise<T> {
  try {
    const ref = doc(db, getDocPath(uid, type));
    const snap = await getDoc(ref);
    _firestoreAvailable = true;
    if (snap.exists()) {
      const data = snap.data();
      return (data?.items as T) ?? fallback;
    }
    return fallback;
  } catch (e) {
    console.error(`Failed to load ${type} from Firestore:`, e);
    _firestoreAvailable = false;
    // Fallback to localStorage
    return loadFromLocalStorage(uid, type, fallback);
  }
}

// --- SAVE DATA (with localStorage fallback) ---
export async function saveToFirestore<T>(uid: string, type: FirestoreDataType, data: T): Promise<void> {
  // Always save to localStorage as backup
  saveToLocalStorage(uid, type, data);

  try {
    const ref = doc(db, getDocPath(uid, type));
    await setDoc(ref, { items: data, updatedAt: new Date().toISOString() });
    _firestoreAvailable = true;
  } catch (e) {
    console.error(`Failed to save ${type} to Firestore (saved to localStorage instead):`, e);
    _firestoreAvailable = false;
    // Don't throw - data is safe in localStorage
    // We'll retry Firestore sync later
  }
}

// --- REAL-TIME SUBSCRIPTION (with localStorage fallback) ---
export function subscribeToFirestore<T>(
  uid: string,
  type: FirestoreDataType,
  fallback: T,
  callback: (data: T) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const ref = doc(db, getDocPath(uid, type));

  let subscriptionActive = true;

  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      if (!subscriptionActive) return;
      _firestoreAvailable = true;
      if (snap.exists()) {
        const data = snap.data();
        const items = (data?.items as T) ?? fallback;
        // Sync to localStorage whenever we get Firestore data
        saveToLocalStorage(uid, type, items);
        callback(items);
      } else {
        callback(fallback);
      }
    },
    (error) => {
      if (!subscriptionActive) return;
      console.error(`Firestore subscription error for ${type}:`, error);
      _firestoreAvailable = false;
      // Fallback: load from localStorage
      const localData = loadFromLocalStorage(uid, type, fallback);
      callback(localData);
      onError?.(error);
    }
  );

  return () => {
    subscriptionActive = false;
    unsubscribe();
  };
}

// --- MIGRATE FROM LOCALSTORAGE ---
export async function migrateFromLocalStorage(uid: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const migrationKey = `glance_v2_${uid}_migrated`;
  if (localStorage.getItem(migrationKey)) return false; // Already migrated

  let migrated = false;

  const types: FirestoreDataType[] = ['transactions', 'categories', 'budgets'];

  for (const type of types) {
    const lsKey = `glance_v2_${uid}_${type}`;
    const raw = localStorage.getItem(lsKey);

    if (raw) {
      try {
        const data = JSON.parse(raw);
        // Only migrate if Firestore doesn't have data yet
        const existing = await loadFromFirestore(uid, type, null);
        if (!existing || (Array.isArray(existing) && existing.length === 0)) {
          await saveToFirestore(uid, type, data);
          migrated = true;
        }
      } catch {
        // Skip if parse fails
      }
    }
  }

  // Mark as migrated
  localStorage.setItem(migrationKey, 'true');
  return migrated;
}
