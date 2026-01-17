
import React, { useState, useEffect, useCallback } from 'react';
import { User, Room } from '../types';
import { db, ref, onValue, set, push, remove } from '../firebaseService';

interface LobbyProps {
  currentUser: User;
  onJoinRoom: (room: Room) => void;
  onRoomsUpdate: (rooms: Room[]) => void;
  rooms: Room[];
}

const Lobby: React.FC<LobbyProps> = ({ currentUser, onJoinRoom, rooms, onRoomsUpdate }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isPlayerListOpen, setIsPlayerListOpen] = useState(false);
  const [customTime, setCustomTime] = useState(5);
  const [allPlayers, setAllPlayers] = useState<(User & { rank: number })[]>([]);

  const timeOptions = [1, 2, 3, 5, 7];

  useEffect(() => {
    // Sync Rooms from Firebase
    const roomsRef = ref(db, 'rooms');
    const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomList = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        })).filter(r => r.status === 'waiting');
        onRoomsUpdate(roomList);
      } else {
        onRoomsUpdate([]);
      }
    });

    // Sync Players/Leaderboard from Firebase
    const usersRef = ref(db, 'users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sorted = Object.entries(data)
          .map(([id, u]: [string, any]) => ({ id, ...u }))
          .sort((a, b) => (b.points || 0) - (a.points || 0))
          .map((u, index) => ({ ...u, rank: index + 1 }));
        setAllPlayers(sorted);
      }
    });

    return () => {
      unsubscribeRooms();
      unsubscribeUsers();
    };
  }, [onRoomsUpdate]);

  const handleCreateRoom = async (time: number) => {
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    // Fixed: Added 'as const' to status to satisfy Room interface status: 'waiting' | 'playing'
    const roomData = {
      creator: currentUser,
      timeLimit: time,
      createdAt: Date.now(),
      status: 'waiting' as const
    };
    
    await set(newRoomRef, roomData);
    onJoinRoom({ id: newRoomRef.key!, ...roomData });
    setIsCreating(false);
  };

  const handleJoin = async (room: Room) => {
    if (room.creator.id === currentUser.id) {
       onJoinRoom(room);
       return;
    }
    
    // Update room status in Firebase to lock it
    await set(ref(db, `rooms/${room.id}/status`), 'playing');
    await set(ref(db, `rooms/${room.id}/opponent`), currentUser);
    onJoinRoom(room);
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto max-w-5xl mx-auto w-full animate-in fade-in duration-500">
      {/* User Status Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 bg-white/5 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl relative">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-lg">
          Global Player Profile
        </div>
        
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-slate-800 border-2 border-indigo-500/50 p-1 overflow-hidden shadow-2xl">
              <img src={currentUser.avatar || ''} className="w-full h-full object-cover rounded-2xl" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-4 border-slate-900 rounded-full shadow-lg"></div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white leading-tight">{currentUser.username}</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-amber-400 font-black text-2xl">{currentUser.points}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">نقاطك العالمية</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setIsPlayerListOpen(true)}
            className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold border border-white/5 transition-all flex items-center gap-2 group shadow-xl"
          >
            <svg className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            المتصدرون
          </button>
          
          <button 
            onClick={() => setIsCreating(true)}
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-2xl shadow-indigo-600/30 transition-all flex items-center gap-2 transform active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            إنشاء تحدي
          </button>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-400 mb-8 flex items-center gap-4">
        <span className="w-12 h-[2px] bg-indigo-500/50"></span>
        تحديات مباشرة حول العالم
        <span className="bg-rose-500/20 text-rose-500 text-[10px] font-black px-2 py-0.5 rounded-md animate-pulse">LIVE</span>
      </h2>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
        {rooms.map(room => (
          <div key={room.id} className="glass p-7 rounded-[2rem] border border-white/5 hover:border-indigo-500/40 transition-all group relative overflow-hidden flex flex-col justify-between h-56 shadow-2xl bg-gradient-to-br from-slate-900/50 to-transparent">
             <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/10 shadow-inner bg-slate-800">
                  <img src={room.creator.avatar || ''} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-black text-slate-100 text-lg">{room.creator.username}</h4>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">انتظار خصم...</span>
                  </div>
                </div>
             </div>

             <div className="flex items-center justify-between border-t border-white/5 pt-5 mt-auto">
                <div className="flex flex-col">
                   <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Time Limit</span>
                   <span className="text-2xl font-black text-indigo-400">{room.timeLimit} <span className="text-xs font-normal opacity-50">Min</span></span>
                </div>
                <button 
                  onClick={() => handleJoin(room)}
                  className="px-8 py-3 bg-white text-slate-950 rounded-2xl font-black hover:bg-amber-400 transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-white/5"
                >
                  انضـمام
                </button>
             </div>
          </div>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-24 text-center flex flex-col items-center justify-center gap-6 bg-white/5 rounded-[3rem] border-2 border-dashed border-slate-800 shadow-inner">
            <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center">
               <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
            </div>
            <div>
               <p className="text-white text-xl font-bold">لا يوجد تحديات متاحة الآن</p>
               <p className="text-slate-500 text-sm mt-1 font-medium">كن أول من يفتتح حلبة اليوم عبر زر "إنشاء تحدي"</p>
            </div>
          </div>
        )}
      </div>

      {/* Global Player List Modal */}
      {isPlayerListOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-500">
          <div className="glass w-full max-w-2xl p-10 rounded-[4rem] border border-white/10 shadow-[0_0_200px_rgba(99,102,241,0.3)] max-h-[85vh] flex flex-col relative">
            <div className="absolute top-8 right-10">
               <button onClick={() => setIsPlayerListOpen(false)} className="p-4 hover:bg-white/10 rounded-3xl transition-all text-slate-400 hover:text-white transform hover:rotate-90 duration-300">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>

            <div className="flex items-center gap-6 mb-12">
               <div className="p-5 bg-indigo-600/30 rounded-[2rem] shadow-2xl shadow-indigo-500/20">
                 <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                 </svg>
               </div>
               <div>
                  <h3 className="text-4xl font-black text-white tracking-tight">أساطير Lumina</h3>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mt-1">Global Top {allPlayers.length}</p>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-4">
              {allPlayers.map((player) => (
                <div 
                  key={player.id} 
                  className={`flex items-center justify-between p-6 rounded-[2.5rem] border transition-all transform hover:translate-x-2 ${
                    player.id === currentUser.id ? 'bg-indigo-600/30 border-indigo-500/50 shadow-2xl' : 'bg-slate-900/40 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 flex items-center justify-center rounded-2xl font-black text-2xl shadow-xl ${
                      player.rank === 1 ? 'bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 text-black shadow-amber-500/50 animate-pulse scale-110' :
                      player.rank === 2 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-black shadow-slate-500/20' :
                      player.rank === 3 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white shadow-amber-900/20' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {player.rank}
                    </div>
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/10 bg-slate-800 shadow-inner">
                      <img src={player.avatar || ''} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <span className="font-black text-xl text-slate-100 block leading-tight">{player.username}</span>
                      <div className="flex items-center gap-2 mt-1">
                         {player.id === currentUser.id && <span className="text-[9px] text-white font-black uppercase tracking-widest bg-indigo-500 px-2 py-0.5 rounded shadow-lg">ME</span>}
                         <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                         <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Active Now</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-amber-400">{player.points}</span>
                      <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Global Points</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md p-12 rounded-[4rem] border border-white/10 shadow-3xl">
            <h3 className="text-4xl font-black mb-10 text-center bg-gradient-to-br from-white to-slate-600 bg-clip-text text-transparent">تحدي سحابي</h3>
            <div className="space-y-10">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-5 ml-1">اختر وقت المباراة</label>
                <div className="grid grid-cols-3 gap-4">
                  {timeOptions.map(t => (
                    <button 
                      key={t}
                      onClick={() => handleCreateRoom(t)}
                      className="px-4 py-6 bg-slate-900/50 hover:bg-indigo-600 rounded-3xl font-black transition-all border border-white/5 hover:scale-105 active:scale-95 shadow-2xl text-xl"
                    >
                      {t} <span className="text-xs font-normal opacity-50">د</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 ml-1">وقت مخصص</label>
                <div className="flex gap-4">
                  <input 
                    type="number"
                    value={customTime}
                    onChange={(e) => setCustomTime(Number(e.target.value))}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-3xl px-6 py-5 text-white outline-none focus:border-indigo-500 transition-colors font-black text-xl shadow-inner"
                    min="1"
                    max="60"
                  />
                  <button 
                    onClick={() => handleCreateRoom(customTime)}
                    className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-3xl font-black transition-all shadow-xl active:scale-95"
                  >
                    تأكيد
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setIsCreating(false)}
                className="w-full py-5 text-slate-500 hover:text-white transition-colors font-bold uppercase tracking-widest text-xs"
              >
                إلغاء العملية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Lobby;
