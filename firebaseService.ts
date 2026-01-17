// @ts-nocheck
import * as firebaseApp from "firebase/app";
import * as firebaseDatabase from "firebase/database";

/**
 * إعدادات Firebase الخاصة بمشروع Ibra Dama
 */
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

// فحص ما إذا كان المستخدم قد قام بتغيير القيم الافتراضية
const isConfigValid = firebaseConfig.apiKey !== "ضع_هنا_API_KEY_الخاص_بك" && firebaseConfig.apiKey.startsWith("AIza");

let app: any = null;
let realDb: any = null;

// استخراج الوظائف يدوياً لتجنب مشاكل التصدير في البيئات المختلفة
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
  console.warn("⚠️ تطبيق Ibra Dama يعمل في (وضع التجربة) لأن مفاتيح Firebase غير مكتملة.");
}

// تصدير كائن قاعدة البيانات (حقيقي أو وهمي)
export const db = (isConfigValid && realDb) ? realDb : { isMock: true };

const isMock = (target: any) => !isConfigValid || (target && target.isMock);

/**
 * وظائف مساعدة تتعامل مع الوضع الحقيقي والوهمي تلقائياً
 */
export const ref = (database: any, path?: string) => {
  if (isMock(database)) {
    return { isMock: true, path, key: 'mock_' + Math.random().toString(36).substr(2, 5) };
  }
  return refInternal(database, path);
};

export const set = (dbRef: any, value: any) => {
  if (isMock(dbRef)) return Promise.resolve();
  return setInternal(dbRef, value);
};

export const onValue = (dbRef: any, callback: (snapshot: any) => void) => {
  if (isMock(dbRef)) {
     callback({ val: () => null, exists: () => false });
     return () => {};
  }
  return onValueInternal(dbRef, callback);
};

export const push = (dbRef: any, value?: any) => {
  if (isMock(dbRef)) {
    return { isMock: true, key: 'push_' + Date.now() };
  }
  return pushInternal(dbRef, value);
};

export const update = (dbRef: any, values: any) => {
  if (isMock(dbRef)) return Promise.resolve();
  return updateInternal(dbRef, values);
};

export const remove = (dbRef: any) => {
  if (isMock(dbRef)) return Promise.resolve();
  return removeInternal(dbRef);
};

export const get = (dbRef: any) => {
  if (isMock(dbRef)) {
    return Promise.resolve({
      exists: () => false,
      val: () => null
    });
  }
  return getInternal(dbRef);
};

export const onDisconnect = (dbRef: any) => {
  if (isMock(dbRef)) {
    return {
      remove: () => Promise.resolve(),
      set: () => Promise.resolve(),
      update: () => Promise.resolve()
    };
  }
  return onDisconnectInternal(dbRef);
};