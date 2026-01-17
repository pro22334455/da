
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, update, remove, push } from '../firebaseService';

interface DamaViewProps {
  currentUser: User;
  onUpdatePoints: (p: number) => void;
}

const DamaView: React.FC<DamaViewProps> = ({ currentUser, onUpdatePoints }) => {
  const [board, setBoard] = useState<DamaBoard | null>(null);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [highlights, setHighlights] = useState<[number, number][]>([]);
  
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerRole, setPlayerRole] = useState<1 | 2 | null>(null);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [showRules, setShowRules] = useState(false);
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  // دالة تهيئة اللوحة (النسخة السليمة)
  const initBoard = () => {
    const newBoard: DamaBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    // لاعب 1 (أحمر) في الصفوف 0, 1, 2
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 0) newBoard[r][c] = { player: 1, king: false };
      }
    }
    // لاعب 2 (أزرق) في الصفوف 5, 6, 7
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 0) newBoard[r][c] = { player: 2, king: false };
      }
    }
    return newBoard;
  };

  useEffect(() => {
    if (!activeRoom) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      // فحص إذا كانت اللوحة من "غرفة قديمة" تالفة
      if (playerRole === 1) {
        let needsReset = false;
        if (!data.board) {
          needsReset = true;
        } else if (Array.isArray(data.board)) {
          // فحص عينة: إذا وجدنا قطعة لاعب 2 (أزرق) في الصف الأول (0)، فهذه لوحة قديمة تالفة
          const firstRow = data.board[0];
          if (firstRow && firstRow.some((p: any) => p && p.player === 2)) {
            needsReset = true;
          }
        }

        if (needsReset) {
          console.log("Detected corrupted board from old version. Resetting...");
          const freshBoard = initBoard();
          update(gameRef, { 
            board: freshBoard, 
            turn: 1,
            p1Time: data.p1Time || (activeRoom.timeLimit * 60),
            p2Time: data.p2Time || (activeRoom.timeLimit * 60)
          });
          return; 
        }
      }

      if (data.status === 'playing' && data.opponent) {
        setOpponent(data.opponent.id === currentUser.id ? data.creator : data.opponent);
        setGameStarted(true);
      } else {
        setGameStarted(false);
        if (data.opponent) setOpponent(data.opponent);
      }
      
      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.p1Time !== undefined) setP1Time(data.p1Time);
      if (data.p2Time !== undefined) setP2Time(data.p2Time);
      
      if (data.status === 'closed') resetState();
    });
    return () => unsubscribe();
  }, [activeRoom, playerRole, currentUser]);

  const resetState = () => {
    setActiveRoom(null);
    setGameStarted(false);
    setOpponent(null);
    setBoard(null);
    setPlayerRole(null);
  };

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      if (playerRole === 1 && !gameStarted) await remove(ref(db, `rooms/${activeRoom.id}`));
      else await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
    }
    resetState();
  };

  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  if (!activeRoom) return <Lobby currentUser={currentUser} onJoinRoom={setActiveRoom} rooms={allRooms} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col h-full bg-[#020617] items-center justify-center p-4 gap-6 overflow-hidden" dir="rtl">
      
      {/* Header Info */}
      <div className="w-full max-w-[480px] glass p-4 rounded-[2rem] flex justify-between items-center shadow-2xl border border-white/10">
        <div className="flex items-center gap-3">
          <img src={opponent?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=waiting`} className="w-10 h-10 rounded-xl bg-slate-800 border border-white/5" />
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 font-black uppercase">المنافس</span>
            <span className="text-sm font-bold text-slate-200 truncate max-w-[70px] leading-tight">{opponent?.username || "..."}</span>
            <span className="text-base font-black font-mono text-amber-500">{formatTime(playerRole === 1 ? p2Time : p1Time)}</span>
          </div>
        </div>

        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${!gameStarted ? 'bg-rose-500/20 text-rose-500 animate-pulse' : 'bg-emerald-500/20 text-emerald-400'}`}>
           {!gameStarted ? 'انتظار الخصم' : (turn === playerRole ? 'دورك' : 'خصمك')}
        </div>

        <div className="flex items-center gap-3 text-left">
          <div className="flex flex-col items-end text-right">
            <span className="text-[9px] text-slate-500 font-black uppercase">أنت</span>
            <span className="text-sm font-bold text-slate-100 truncate max-w-[70px] leading-tight">{currentUser.username}</span>
            <span className="text-base font-black font-mono text-indigo-400">{formatTime(playerRole === 1 ? p1Time : p2Time)}</span>
          </div>
          <img src={currentUser.avatar || ''} className="w-10 h-10 rounded-xl bg-slate-800 border border-indigo-500/40" />
        </div>
      </div>

      {/* Grid Fix: Using explicit 12.5% for each cell to prevent bunching */}
      <div className="relative aspect-square w-full max-w-[440px] bg-[#1a120b] p-2 rounded-[2.2rem] shadow-[0_40px_80px_rgba(0,0,0,0.7)] border-[8px] border-[#2c1e14]">
        {board ? (
          <div 
            className="grid w-full h-full rounded-xl overflow-hidden shadow-inner" 
            style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 12.5%)', 
              gridTemplateRows: 'repeat(8, 12.5%)' 
            }}
          >
            {!gameStarted && (
               <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-[2px] flex items-center justify-center rounded-[1.8rem] pointer-events-none px-6 text-center">
                  <div className="bg-slate-900/90 p-6 rounded-[2rem] border border-white/10 shadow-3xl">
                     <p className="text-xs font-black text-white uppercase tracking-widest mb-2">المنافس غير متصل حالياً</p>
                     <p className="text-[10px] text-slate-400 font-medium italic">سيبدأ اللعب فور دخوله</p>
                  </div>
               </div>
            )}

            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 !== 0;
              return (
                <div 
                  key={`${r}-${c}`} 
                  className={`relative flex items-center justify-center ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'}`}
                >
                  {piece && (
                    <div className={`w-[80%] h-[80%] rounded-full piece-shadow transition-all duration-300 ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900 shadow-[0_4px_0_#7f1d1d]' : 'bg-gradient-to-br from-cyan-400 to-indigo-900 shadow-[0_4px_0_#1e1b4b]'}`}>
                      {piece.king && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-300 drop-shadow-lg" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
             <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="font-black text-[10px] text-amber-500 tracking-[0.3em]">REBUILDING BOARD</p>
          </div>
        )}
      </div>

      <div className="flex gap-4 w-full max-w-[440px]">
          <button onClick={() => setShowRules(true)} className="p-4 bg-slate-900 rounded-2xl text-slate-500 border border-white/5 active:scale-90 transition-transform">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button onClick={handleLeaveRoom} className="flex-1 py-4 bg-rose-500/10 text-rose-500 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-rose-500/20 active:scale-95 transition-all">
             خروج / انسـحاب
          </button>
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-8" onClick={() => setShowRules(false)}>
           <div className="glass w-full max-w-xs p-8 rounded-[2.5rem] border border-white/10" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black mb-6 text-indigo-400">📜 نظام اللعب</h2>
              <div className="space-y-4 text-slate-400 text-xs font-bold">
                 <p className="flex gap-2"><span>•</span> <span>الأحمر يبدأ اللعب دائماً.</span></p>
                 <p className="flex gap-2"><span>•</span> <span>يجب القفز فوق قطعة الخصم إذا أتيحت الفرصة.</span></p>
                 <p className="flex gap-2"><span>•</span> <span>القطع المكدسة في الأعلى هي خطأ في غرف قديمة ويتم إصلاحها تلقائياً الآن.</span></p>
              </div>
              <button onClick={() => setShowRules(false)} className="w-full mt-10 py-4 bg-white text-black rounded-xl font-black text-xs uppercase tracking-widest">فهمت</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
