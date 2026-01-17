
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
    
    const usersRef = ref(db, 'users');
    
    try {
      const snapshot = await get(usersRef);
      const allUsers = snapshot.val() || {};

      if (isLogin) {
        const foundId = Object.keys(allUsers).find(id => allUsers[id].username === username && allUsers[id].password === password);
        if (foundId) {
          const u = allUsers[foundId];
          onLogin({ id: foundId, username: u.username, points: u.points || 0, avatar: u.avatar });
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
      console.error(error);
      alert("فشل الاتصال بقاعدة البيانات");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 p-6">
      <div className="w-full max-w-md glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
           <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Global Server Live</span>
           </div>
        </div>

        <div className="text-center mb-10">
          <div className="inline-flex p-4 rounded-2xl bg-indigo-600/20 mb-4">
            <svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-1.196-12.29a7.123 7.123 0 002.73 0c.996.447 1.927 1.059 2.774 1.821a7.237 7.237 0 011.742 3.536m0 0A11.201 11.201 0 0111 20.24M11 20.24a11.459 11.459 0 01-2.833-8.239V7a5 5 0 0110 0v4a11.356 11.356 0 01-1.167 5.03" />
            </svg>
          </div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            {isLogin ? 'تسجيل الدخول' : 'حساب جديد'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">اسم المستخدم</label>
            <input
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
              placeholder="Nickname"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">كلمة المرور</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
          >
            {isLoading && <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
            {isLogin ? 'دخول' : 'بدء التحدي'}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full mt-8 text-sm text-slate-500 hover:text-white transition-colors font-medium"
        >
          {isLogin ? 'لا تملك حساب؟ سجل الآن' : 'تملك حساب بالفعل؟ سجل دخولك'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
