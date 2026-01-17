
import React, { useState, useEffect } from 'react';
import { User } from './types';
import DamaView from './components/DamaView';
import Auth from './components/Auth';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('ibra_dama_current_user');
    if (saved) {
      setCurrentUser(JSON.parse(saved));
    }
  }, []);

  const handleLogin = async (user: User) => {
    setCurrentUser(user);
    sessionStorage.setItem('ibra_dama_current_user', JSON.stringify(user));
  };

  const handleUpdatePoints = (p: number) => {
    if (currentUser) {
      const updated = { ...currentUser, points: currentUser.points + p };
      setCurrentUser(updated);
      sessionStorage.setItem('ibra_dama_current_user', JSON.stringify(updated));
    }
  };

  if (!currentUser) {
    return (
      <div className="h-screen w-full bg-[#020617] flex items-center justify-center font-inter" dir="rtl">
        <Auth onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-[#020617] text-slate-100 font-inter select-none" dir="rtl">
      <DamaView currentUser={currentUser} onUpdatePoints={handleUpdatePoints} />
    </div>
  );
};

export default App;
