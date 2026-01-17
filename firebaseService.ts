// @ts-nocheck
import * as firebaseApp from "firebase/app";
import * as firebaseDatabase from "firebase/database";

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

const isConfigValid = firebaseConfig.apiKey !== "ضع_هنا_API_KEY_الخاص_بك" && firebaseConfig.apiKey.startsWith("AIza");

let app: any = null;
let realDb: any = null;

const initializeAppInternal = (firebaseApp as any).initializeApp;
const getDatabaseInternal = (firebaseDatabase as any).getDatabase;
const refInternal = (firebaseDatabase as any).ref;
const setInternal = (firebaseDatabase as any).set;
const onValueInternal = (firebaseDatabase as any).onValue;
const pushInternal = (firebaseDatabase as any).push;
const updateInternal = (firebaseDatabase as any).update;
const removeInternal = (firebaseDatabase as any).remove;
const getInternal = (firebaseDatabase as any).get;
const onDisconnectInternal = (firebaseDatabase as any).onDisconnect;

if (isConfigValid) {
  try {
    app = initializeAppInternal(firebaseConfig);
    realDb = getDatabaseInternal(app);
    console.log("✅ تم الاتصال بقاعدة بيانات Firebase بنجاح (مشروع Ibra Dama)");
  } catch (error) {
    console.error("❌ فشل الاتصال بـ Firebase:", error);
  }
} else {
  console.warn("⚠️ وضع التجربة: مفاتيح Firebase غير مكتملة.");
}

export const db = (isConfigValid && realDb) ? realDb : { isMock: true };

const isMock = (target: any) => !isConfigValid || (target && target.isMock);

export const ref = (database: any, path?: string) => isMock(database) ? { isMock: true, path, key: 'mock_' + Math.random().toString(36).substr(2, 5) } : refInternal(database, path);
export const set = (dbRef: any, value: any) => isMock(dbRef) ? Promise.resolve() : setInternal(dbRef, value);
export const onValue = (dbRef: any, callback: (snapshot: any) => void) => isMock(dbRef) ? (() => { callback({ val: () => null, exists: () => false }); return () => {}; })() : onValueInternal(dbRef, callback);
export const push = (dbRef: any, value?: any) => isMock(dbRef) ? { isMock: true, key: 'push_' + Date.now() } : pushInternal(dbRef, value);
export const update = (dbRef: any, values: any) => isMock(dbRef) ? Promise.resolve() : updateInternal(dbRef, values);
export const remove = (dbRef: any) => isMock(dbRef) ? Promise.resolve() : removeInternal(dbRef);
export const get = (dbRef: any) => isMock(dbRef) ? Promise.resolve({ exists: () => false, val: () => null }) : getInternal(dbRef);
export const onDisconnect = (dbRef: any) => isMock(dbRef) ? { remove: () => Promise.resolve(), set: () => Promise.resolve(), update: () => Promise.resolve() } : onDisconnectInternal(dbRef);
