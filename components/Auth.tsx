
import React, { useState } from 'react';
import { User } from '../types';
import { db, ref, set, get } from '../firebaseService';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      alert("يرجى إدخال اسم مستخدم صالح");
      setIsLoading(false);
      return;
    }
    
    try {
      const snapshot = await get(ref(db, 'users'));
      const allUsers = snapshot.val() || {};

      if (isLogin) {
        const foundId = Object.keys(allUsers).find(
          id => allUsers[id].username.toLowerCase() === cleanUsername.toLowerCase() && allUsers[id].password === password
        );
        
        if (foundId) {
          const u = allUsers[foundId];
          onLogin({ 
            id: foundId, 
            username: u.username, 
            points: u.points || 0, 
            avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`
          });
        } else {
          alert("خطأ في اسم المستخدم أو كلمة السر");
        }
      } else {
        // فحص تكرار الاسم
        const exists = Object.values(allUsers).some((u: any) => u.username.toLowerCase() === cleanUsername.toLowerCase());
        if (exists) {
          alert("هذا الاسم مستخدم بالفعل، يرجى اختيار اسم آخر");
          setIsLoading(false);
          return;
        }
        
        const userId = Math.random().toString(36).substr(2, 9);
        const newUser = {
          username: cleanUsername,
          password,
          points: 0,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`
        };
        
        await set(ref(db, `users/${userId}`), newUser);
        onLogin({ id: userId, ...newUser });
      }
    } catch (error) {
      console.error("Auth Error:", error);
      alert("فشل الاتصال بالخادم");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 p-6 w-full">
      <div className="w-full max-w-md glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="text-center mb-10">
          <div className="inline-flex p-4 rounded-3xl bg-indigo-600/20 mb-4 shadow-inner">
            <h1 className="text-4xl font-black text-indigo-500 tracking-tighter italic">ID</h1>
          </div>
          <h2 className="text-3xl font-black text-white mb-1">Ibra Dama</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            {isLogin ? 'سجل دخولك' : 'إنشاء حساب جديد'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">اسم المستخدم</label>
            <input
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
              placeholder="username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">كلمة السر</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg transition-all active:scale-95"
          >
            {isLoading ? "جاري التحميل..." : (isLogin ? 'دخول اللعبة' : 'إنشاء الحساب')}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-8 text-xs text-slate-500 hover:text-white transition-colors font-bold"
        >
          {isLogin ? 'لا تملك حساب؟ انضم إلينا' : 'تملك حساب؟ سجل دخولك'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
