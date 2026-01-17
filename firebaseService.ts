import { initializeApp, FirebaseApp } from "firebase/app";
import { 
  getDatabase, 
  ref as firebaseRef, 
  set as firebaseSet, 
  onValue as firebaseOnValue, 
  push as firebasePush, 
  update as firebaseUpdate, 
  remove as firebaseRemove, 
  onDisconnect as firebaseOnDisconnect, 
  get as firebaseGet,
  Database
} from "firebase/database";

/**
 * إعدادات Firebase
 * ملاحظة: إذا كانت القيم افتراضية، سيعمل التطبيق في "الوضع التجريبي" (Mock Mode)
 */
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY_HERE",
  authDomain: "dama-ibra.firebaseapp.com",
  databaseURL: "https://dama-ibra-default-rtdb.firebaseio.com",
  projectId: "dama-ibra",
  storageBucket: "dama-ibra.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const isConfigValid = firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY_HERE" && firebaseConfig.apiKey.length > 10;

let app: FirebaseApp | null = null;
let realDb: Database | null = null;

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    realDb = getDatabase(app);
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
  }
}

// كائن قاعدة البيانات المصدر
export const db = isConfigValid ? realDb : { isMock: true };

// دالة التحقق من أن المرجع حقيقي أم وهمي
const isMockRef = (dbRef: any) => !dbRef || dbRef.isMock === true;

export const ref = (database: any, path?: string) => {
  if (!isConfigValid || !realDb) {
    return { isMock: true, path, key: 'mock_ref' };
  }
  return firebaseRef(realDb, path);
};

export const set = (dbRef: any, value: any) => {
  if (isMockRef(dbRef)) return Promise.resolve();
  return firebaseSet(dbRef, value);
};

export const onValue = (dbRef: any, callback: (snapshot: any) => void) => {
  if (isMockRef(dbRef)) return () => {};
  return firebaseOnValue(dbRef, callback);
};

export const push = (dbRef: any, value?: any) => {
  if (isMockRef(dbRef)) {
    return { isMock: true, key: 'mock_push_' + Date.now() };
  }
  return firebasePush(dbRef, value);
};

export const update = (dbRef: any, values: any) => {
  if (isMockRef(dbRef)) return Promise.resolve();
  return firebaseUpdate(dbRef, values);
};

export const remove = (dbRef: any) => {
  if (isMockRef(dbRef)) return Promise.resolve();
  return firebaseRemove(dbRef);
};

export const get = (dbRef: any) => {
  if (isMockRef(dbRef)) {
    return Promise.resolve({
      exists: () => false,
      val: () => null
    });
  }
  return firebaseGet(dbRef);
};

export const onDisconnect = (dbRef: any) => {
  if (isMockRef(dbRef)) {
    return {
      remove: () => Promise.resolve(),
      set: () => Promise.resolve(),
      update: () => Promise.resolve()
    };
  }
  return firebaseOnDisconnect(dbRef);
};

export const updateGlobalUserPoints = async (userId: string, pointsToAdd: number) => {
  if (!isConfigValid) return;
  const userRef = ref(db, `users/${userId}`);
  try {
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      const currentPoints = snapshot.val().points || 0;
      await update(userRef, { points: currentPoints + pointsToAdd });
    }
  } catch (error) {
    console.error("Error updating points:", error);
  }
};
