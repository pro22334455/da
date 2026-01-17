import { initializeApp, FirebaseApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, update, remove, onDisconnect, get, Database } from "firebase/database";
import { getAnalytics, Analytics } from "firebase/analytics";

/**
 * إعدادات Firebase
 * ملاحظة هامة: يجب استبدال هذه القيم بقيم حقيقية من وحدة تحكم Firebase (Console).
 * تم استخدام ASCII فقط هنا لتجنب خطأ Headers constructor.
 */
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY_HERE",
  authDomain: "dama-ibra.firebaseapp.com",
  databaseURL: "https://dama-ibra-default-rtdb.firebaseio.com",
  projectId: "dama-ibra",
  storageBucket: "dama-ibra.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID_HERE",
  appId: "YOUR_APP_ID_HERE",
  measurementId: "G-7Q81T7582J"
};

// فحص ما إذا كانت الإعدادات مفعلة أم لا تزال افتراضية
const isConfigValid = firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY_HERE" && 
                     firebaseConfig.apiKey.length > 10;

let app: FirebaseApp | null = null;
let db: Database | any = null;
let analytics: Analytics | null = null;

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    if (typeof window !== 'undefined') {
      analytics = getAnalytics(app);
    }
  } catch (error) {
    console.warn("Firebase initialization failed. Check your config.", error);
  }
} else {
  console.warn("Lumina Dama is running in 'Offline/Mock Mode'. Setup Firebase keys for multiplayer.");
  // نظام وهمي (Mock) للسماح بتشغيل التطبيق دون توقف
  db = {
    ref: () => ({}),
    onValue: () => () => {},
    set: async () => {},
    push: () => ({ key: 'mock_' + Date.now() }),
    update: async () => {},
    remove: async () => {},
    onDisconnect: () => ({}),
    get: async () => ({ exists: () => false, val: () => null })
  };
}

export { db, analytics, ref, set, onValue, push, update, remove, onDisconnect, get };

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