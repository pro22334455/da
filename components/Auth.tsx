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
    
    try {
      const snapshot = await get(ref(db, 'users'));
      const allUsers = snapshot.val() || {};

      if (isLogin) {
        const foundId = Object.keys(allUsers).find(
          id => allUsers[id].username === username && allUsers[id].password === password
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
          alert("خطأ في بيانات الدخول");
        }
      } else {
        const exists = Object.values(allUsers).some((u: any) => u.username === username);
        if (exists) {
          alert("اسم المستخدم موجود مسبقاً");
          setIsLoading(false);
          return;
        }
        
        const userId = Math.random().toString(36).substr(2, 9);
        const newUser = {
          username,
          password,
          points: 0,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        };
        
        await set(ref(db, `users/${userId}`), newUser);
        onLogin({ id: userId, ...newUser });
      }
    } catch (error) {
      console.error("Auth Error:", error);
      alert("فشل الاتصال: تأكد من إعدادات Firebase أو جرب الدخول (وضع التجربة)");
      
      // وضع احتياطي (Fallback) في حالة عدم وجود انترنت أو Firebase غير مهيأ
      if (!isLogin) {
        onLogin({ 
          id: 'temp_user', 
          username, 
          points: 0, 
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 p-6 w-full">
      <div className="w-full max-w-md glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
           <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Ibra Dama Server</span>
           </div>
        </div>

        <div className="text-center mb-10">
          <div className="inline-flex p-4 rounded-3xl bg-indigo-600/20 mb-4 shadow-inner">
            <h1 className="text-4xl font-black text-indigo-500 tracking-tighter italic">ID</h1>
          </div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-1">
            Ibra Dama
          </h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em] opacity-60">
            {isLogin ? 'سجل دخولك لبدء المنافسة' : 'انضم إلى أساطير الدامة'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest mr-1">الاسم المستعار</label>
            <input
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all font-bold"
              placeholder="Nickname"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest mr-1">كلمة السر</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all font-bold"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-600/20 transition-all flex flex-col items-center justify-center gap-1 transform active:scale-95 group"
          >
            {isLoading ? (
               <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
              <>
                <span>{isLogin ? 'دخول اللعبة' : 'ابدأ التحدي'}</span>
                <span className="text-[9px] font-normal opacity-50 group-hover:opacity-100">سيتم تفعيل الميكروفون تلقائياً</span>
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-8 text-xs text-slate-500 hover:text-white transition-colors font-bold tracking-tight"
        >
          {isLogin ? 'لا تملك حساب؟ انضم إلينا الآن' : 'تملك حساب بالفعل؟ سجل دخولك'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
