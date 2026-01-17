import React, { useState, useEffect } from 'react';
import { ViewType, User } from './types';
import Sidebar from './Sidebar';
import ChatView from './components/ChatView';
import ImageGenView from './components/ImageGenView';
import VoiceView from './components/VoiceView';
import DamaView from './components/DamaView';
import Auth from './components/Auth';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>(ViewType.CHAT);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('lumina_current_user');
    if (saved) {
      setCurrentUser(JSON.parse(saved));
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    sessionStorage.setItem('lumina_current_user', JSON.stringify(user));
  };

  const handleUpdatePoints = (p: number) => {
    if (currentUser) {
      const updated = { ...currentUser, points: currentUser.points + p };
      setCurrentUser(updated);
      sessionStorage.setItem('lumina_current_user', JSON.stringify(updated));

      const users = JSON.parse(localStorage.getItem('lumina_users') || '[]');
      const userIndex = users.findIndex((u: any) => u.id === currentUser.id);
      if (userIndex !== -1) {
        users[userIndex].points += p;
        localStorage.setItem('lumina_users', JSON.stringify(users));
      }
    }
  };

  const renderView = () => {
    if (activeView === ViewType.DAMA) {
      if (!currentUser) return <Auth onLogin={handleLogin} />;
      return <DamaView currentUser={currentUser} onUpdatePoints={handleUpdatePoints} />;
    }

    switch (activeView) {
      case ViewType.CHAT: return <ChatView />;
      case ViewType.IMAGE: return <ImageGenView />;
      case ViewType.VOICE: return <VoiceView />;
      default: return <ChatView />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100 font-inter">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {renderView()}
      </main>
    </div>
  );
};

export default App;