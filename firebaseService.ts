
// @ts-nocheck
import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getDatabase, 
  ref as firebaseRef, 
  set as firebaseSet, 
  onValue as firebaseOnValue, 
  push as firebasePush, 
  update as firebaseUpdate, 
  remove as firebaseRemove, 
  get as firebaseGet, 
  onDisconnect as firebaseOnDisconnect 
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDNvvuO8tPWotui48H3A4YF5PWVKAnelf8",
  authDomain: "dama-ibra.firebaseapp.com",
  databaseURL: "https://dama-ibra-default-rtdb.firebaseio.com", 
  projectId: "dama-ibra",
  storageBucket: "dama-ibra.firebasestorage.app",
  messagingSenderId: "448856002691",
  appId: "1:448856002691:web:6148b81fa0ee665e5b8bb6",
  measurementId: "G-7Q81T7582J"
};

let app;
let realDb;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  // التأكد من تمرير رابط قاعدة البيانات مباشرة لحل مشكلة "Service not available"
  realDb = getDatabase(app, firebaseConfig.databaseURL);
  console.log("🚀 Ibra Dama Engine: Firebase Connected Successfully");
} catch (error) {
  console.error("❌ Firebase Initialization Failed:", error);
}

export const db = realDb || { isMock: true };

const isMock = (target: any) => !target || target.isMock;

export const ref = (database: any, path?: string) => isMock(database) ? { isMock: true, path } : firebaseRef(database, path);
export const set = (dbRef: any, value: any) => isMock(dbRef) ? Promise.resolve() : firebaseSet(dbRef, value);
export const onValue = (dbRef: any, callback: (snapshot: any) => void) => {
  if (isMock(dbRef)) {
     callback({ val: () => null, exists: () => false });
     return () => {};
  }
  return firebaseOnValue(dbRef, callback);
};
export const push = (dbRef: any, value?: any) => isMock(dbRef) ? { isMock: true, key: 'mock' } : firebasePush(dbRef, value);
export const update = (dbRef: any, values: any) => isMock(dbRef) ? Promise.resolve() : firebaseUpdate(dbRef, values);
export const remove = (dbRef: any) => isMock(dbRef) ? Promise.resolve() : firebaseRemove(dbRef);
export const get = (dbRef: any) => isMock(dbRef) ? Promise.resolve({ exists: () => false, val: () => null }) : firebaseGet(dbRef);
export const onDisconnect = (dbRef: any) => isMock(dbRef) ? { remove: () => Promise.resolve(), set: () => Promise.resolve() } : firebaseOnDisconnect(dbRef);
