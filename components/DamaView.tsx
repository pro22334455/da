
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DamaBoard, DamaPiece, User, Room, ChatMessage } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, set, update, remove, push } from '../firebaseService';

interface DamaViewProps {
  currentUser: User;
  onUpdatePoints: (p: number) => void;
}

const DamaView: React.FC<DamaViewProps> = ({ currentUser, onUpdatePoints }) => {
  const [board, setBoard] = useState<DamaBoard | null>(null);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<number[][][] | null>(null);
  
  // Chat & Voice States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [voiceActivity, setVoiceActivity] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const playerRole = useMemo(() => {
    if (!activeRoom) return null;
    return activeRoom.creator.id === currentUser.id ? 1 : 2;
  }, [activeRoom, currentUser.id]);

  const createInitialBoard = (): DamaBoard => {
    const b: DamaBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) {
          if (r < 3) b[r][c] = { player: 1, king: false };
          if (r > 4) b[r][c] = { player: 2, king: false };
        }
      }
    }
    return b;
  };

  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  // ==== GAME LOGIC (STRICT) ====
  const getJumps = (currentBoard: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const mr = row + dr, mc = col + dc;
        const lr = row + 2*dr, lc = col + 2*dc;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = currentBoard[mr][mc];
        if (mid && mid.player !== piece.player && !currentBoard[lr][lc] && !visited.has(`${mr},${mc}`)) {
          const newVisited = new Set(visited);
          newVisited.add(`${mr},${mc}`);
          const next = getJumps(currentBoard, piece, lr, lc, newVisited);
          if (next.length) next.forEach(seq => jumps.push([[lr,lc,mr,mc], ...seq]));
          else jumps.push([[lr,lc,mr,mc]]);
        }
      } else {
        let step = 1;
        while (true) {
          const mr = row + dr*step, mc = col + dc*step;
          const lr = row + dr*(step+1), lc = col + dc*(step+1);
          if (!inBounds(mr,mc) || !inBounds(lr,lc)) break;
          const mid = currentBoard[mr][mc];
          if (!mid) { step++; continue; }
          if (mid.player === piece.player) break;
          if (visited.has(`${mr},${mc}`)) break;
          let landStep = step+1;
          while(true){
            const lr2=row+dr*landStep, lc2=col+dc*landStep;
            if(!inBounds(lr2,lc2) || currentBoard[lr2][lc2]) break;
            const newVisited=new Set(visited); newVisited.add(`${mr},${mc}`);
            const next=getJumps(currentBoard,piece,lr2,lc2,newVisited);
            if(next.length) next.forEach(seq=>jumps.push([[lr2,lc2,mr,mc],...seq]));
            else jumps.push([[lr2,lc2,mr,mc]]);
            landStep++;
          }
          break;
        }
      }
    }
    return jumps;
  };

  const getLongestJumps = (currentBoard: DamaBoard, player: 1|2) => {
    let max=0; const moves: Record<string,number[][][]>={};
    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const piece=currentBoard[r][c];
        if(piece && piece.player===player){
          const jumps=getJumps(currentBoard,piece,r,c);
          if(jumps.length){
            const best=Math.max(...jumps.map(j=>j.length));
            if(best>=max){
              if(best>max) Object.keys(moves).forEach(k=>delete moves[k]);
              max=best;
              moves[`${r},${c}`]=jumps.filter(j=>j.length===best);
            }
          }
        }
      }
    }
    return { max, moves };
  };

  // ==== SYNC ENGINE ====
  useEffect(() => {
    if (!activeRoom) return;
    const roomRef = ref(db, `rooms/${activeRoom.id}`);
    
    const unsub = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.status === 'playing') setGameStarted(true);
      
      if (data.opponent) {
        setOpponent(data.opponent.id === currentUser.id ? data.creator : data.opponent);
      }

      // Initialize board if I am creator and it's empty
      if (playerRole === 1 && !data.board) {
        update(roomRef, { 
          board: createInitialBoard(), 
          turn: 1, 
          status: data.opponent ? 'playing' : 'waiting' 
        });
      }

      // Sync Messages
      if (data.messages) {
        const msgList = Object.values(data.messages) as ChatMessage[];
        setMessages(msgList.sort((a, b) => a.timestamp - b.timestamp));
      }

      if (data.status === 'closed') resetState();
    });

    return () => unsub();
  }, [activeRoom, playerRole]);

  useEffect(() => {
    if (isChatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Voice activity simulation
  useEffect(() => {
    if (!isMuted) {
      const interval = setInterval(() => setVoiceActivity(prev => !prev), 1000);
      return () => clearInterval(interval);
    } else {
      setVoiceActivity(false);
    }
  }, [isMuted]);

  const saveMove = (nb: DamaBoard, nt: 1 | 2) => {
    if (!activeRoom) return;
    update(ref(db, `rooms/${activeRoom.id}`), { board: nb, turn: nt });
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !activeRoom) return;
    const msgRef = push(ref(db, `rooms/${activeRoom.id}/messages`));
    const msgData: ChatMessage = {
      id: msgRef.key!,
      senderId: currentUser.id,
      senderName: currentUser.username,
      text: newMessage.trim(),
      timestamp: Date.now()
    };
    set(msgRef, msgData);
    setNewMessage('');
  };

  const handleClick = (r: number, c: number) => {
    if (!board || turn !== playerRole || !gameStarted) return;
    const cell = board[r][c];
    const { max, moves } = getLongestJumps(board, turn);

    if (!selected) {
      if (cell && cell.player === turn) {
        if (max > 0 && moves[`${r},${c}`]) {
          setSelected([r, c]);
          setPending(moves[`${r},${c}`].map(s => [...s]));
        } else if (max === 0) {
          setSelected([r, c]);
        }
      }
    } else {
      const [sr, sc] = selected;
      const piece = board[sr][sc];
      if (!piece) return;

      if (pending?.length) {
        const seq = pending.find(s => s[0][0] === r && s[0][1] === c);
        if (seq) {
          const [[lr, lc, mr, mc], ...rest] = seq;
          const newBoard = board.map(row => row.slice());
          newBoard[mr][mc] = null; newBoard[sr][sc] = null; newBoard[lr][lc] = piece;
          if ((piece.player === 1 && lr === 7) || (piece.player === 2 && lr === 0)) piece.king = true;
          
          if (rest.length > 0) {
            setBoard(newBoard);
            setSelected([lr, lc]);
            setPending([rest]);
            saveMove(newBoard, turn);
          } else {
            saveMove(newBoard, turn === 1 ? 2 : 1);
            setSelected(null); setPending(null);
          }
        } else setSelected(null);
      } else {
        const dr = r - sr, dc = c - sc;
        if (!cell && Math.abs(dr) === 1 && Math.abs(dc) === 1) {
          const can = piece.king || (piece.player === 1 && dr === 1) || (piece.player === 2 && dr === -1);
          if (can) {
            const newBoard = board.map(row => row.slice());
            newBoard[r][c] = piece; newBoard[sr][sc] = null;
            if ((piece.player === 1 && r === 7) || (piece.player === 2 && r === 0)) piece.king = true;
            saveMove(newBoard, turn === 1 ? 2 : 1);
          }
        }
        setSelected(null);
      }
    }
  };

  const resetState = () => {
    setActiveRoom(null); setGameStarted(false); setOpponent(null); setBoard(null);
    setSelected(null); setPending(null); setMessages([]);
  };

  if (!activeRoom) return <Lobby currentUser={currentUser} onJoinRoom={setActiveRoom} rooms={allRooms} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col h-full bg-[#020617] items-center justify-center p-4 gap-6 overflow-hidden relative" dir="rtl">
      
      {/* 👑 ROYAL HUD: Player Profiles */}
      <div className="w-full max-w-[480px] glass p-5 rounded-[2.5rem] flex justify-between items-center border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-10 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent rounded-[2.5rem] pointer-events-none"></div>
        
        {/* Opponent Info */}
        <div className="flex items-center gap-4">
          <div className={`relative p-1 rounded-2xl transition-all duration-700 ${gameStarted && opponent ? 'bg-indigo-600/30 ring-2 ring-indigo-500/50' : 'bg-slate-800'}`}>
            <img src={opponent?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=waiting`} className="w-12 h-12 rounded-xl bg-slate-900 shadow-xl" />
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#020617] transition-colors ${gameStarted ? 'bg-green-500' : 'bg-slate-500'}`}></div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">الخصم</span>
            <span className="text-sm font-black text-white truncate max-w-[100px] drop-shadow-md">{opponent?.username || 'بانتظار...'}</span>
          </div>
        </div>

        {/* Turn Status Badge */}
        <div className="flex flex-col items-center">
          <div className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-500 ${gameStarted ? (turn === playerRole ? 'bg-indigo-600 shadow-[0_0_25px_rgba(79,70,229,0.5)] text-white scale-110' : 'bg-slate-800 text-slate-500 scale-95 opacity-60') : 'bg-rose-500/20 text-rose-500 animate-pulse'}`}>
            {gameStarted ? (turn === playerRole ? 'دورك المـلكي' : 'انتظار الخصم') : 'جاري الربط...'}
          </div>
        </div>

        {/* Current User Info */}
        <div className="flex items-center gap-4 text-left">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">أنـت</span>
            <span className="text-sm font-black text-indigo-400 drop-shadow-md">{currentUser.username}</span>
          </div>
          <div className={`relative p-1 rounded-2xl transition-all duration-700 bg-indigo-500/10 ring-2 ring-indigo-400/30 ${voiceActivity ? 'ring-4 ring-green-400/50' : ''}`}>
            <img src={currentUser.avatar || ''} className="w-12 h-12 rounded-xl bg-slate-800 shadow-xl" />
            {voiceActivity && <div className="absolute -top-1 -left-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>}
          </div>
        </div>
      </div>

      {/* ♟️ ROYAL BOARD: The Battlefield */}
      <div className="relative w-full max-w-[460px] aspect-square bg-[#2c1e14] p-3 rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.9)] border-[10px] border-[#3e2723] overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-40 pointer-events-none"></div>
        
        {board ? (
          <div className="w-full h-full rounded-2xl overflow-hidden grid grid-cols-8 grid-rows-8 bg-[#1a0f08] relative z-10 shadow-2xl">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 === 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isTarget = pending?.some(s => s[0][0] === r && s[0][1] === c);

              return (
                <div 
                  key={`${r}-${c}`} 
                  onClick={() => handleClick(r, c)}
                  className={`w-full h-full flex items-center justify-center relative cursor-pointer transition-all duration-500 ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'shadow-[inset_0_0_20px_rgba(251,191,36,0.5)]' : ''}`}
                >
                  {piece && (
                    <div className={`w-[82%] h-[82%] rounded-full piece-shadow transition-all duration-700 transform ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 via-rose-700 to-red-950 border-b-4 border-red-950/80' : 'bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-950 border-b-4 border-indigo-950/80'} ${isSelected ? 'scale-110 shadow-[0_0_30px_rgba(251,191,36,0.8)] -translate-y-2' : 'hover:scale-105'}`}>
                      {piece.king && (
                         <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-7 h-7 text-amber-300 drop-shadow-[0_2px_10px_rgba(251,191,36,0.6)]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                         </div>
                      )}
                    </div>
                  )}
                  {isTarget && (
                    <div className="absolute inset-0 bg-emerald-500/20 animate-pulse border-4 border-emerald-400/40 m-2 rounded-2xl flex items-center justify-center">
                       <div className="w-2.5 h-2.5 bg-emerald-300 rounded-full blur-[2px] shadow-[0_0_10px_white]"></div>
                    </div>
                  )}
                </div>
              );
            }))}
            
            {!gameStarted && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-white/5">
                 <div className="w-20 h-20 border-[6px] border-indigo-500 border-t-transparent rounded-full animate-spin mb-10 shadow-[0_0_40px_rgba(99,102,241,0.4)]"></div>
                 <h3 className="text-3xl font-black text-white mb-4 tracking-tighter italic">Ibra Dama Sync...</h3>
                 <p className="text-slate-500 text-[11px] font-black leading-relaxed uppercase tracking-[0.3em] max-w-[240px]">جاري مزامنة بيانات الغرفة والبحث عن إشارة الخصم عبر السحاب</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-8 bg-slate-900 rounded-[2rem] text-indigo-400">
             <div className="w-16 h-16 border-[6px] border-current border-t-transparent rounded-full animate-spin opacity-40"></div>
             <p className="font-black text-xs tracking-[0.5em] uppercase animate-pulse">Initializing Board...</p>
          </div>
        )}
      </div>

      {/* 🛠️ ROYAL TOOLS: Controls & Chat */}
      <div className="flex gap-5 w-full max-w-[460px] z-10 px-2">
          <button 
            onClick={() => setIsChatOpen(true)}
            className="p-6 bg-indigo-600/10 text-indigo-400 rounded-[2rem] border border-indigo-500/20 hover:bg-indigo-600/20 active:scale-90 transition-all relative group shadow-lg"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            {messages.length > 0 && <span className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 text-white text-[11px] font-black flex items-center justify-center rounded-full border-2 border-[#020617] animate-bounce shadow-xl">{messages.length}</span>}
          </button>

          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-6 rounded-[2rem] border transition-all active:scale-90 shadow-lg ${isMuted ? 'bg-slate-800/80 text-slate-500 border-white/5' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'}`}
          >
            {isMuted ? (
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            ) : (
              <div className="flex items-center gap-1">
                 <div className="w-1 h-4 bg-emerald-500 rounded-full animate-[bounce_0.5s_infinite_0s]"></div>
                 <div className="w-1 h-6 bg-emerald-500 rounded-full animate-[bounce_0.5s_infinite_0.1s]"></div>
                 <div className="w-1 h-3 bg-emerald-500 rounded-full animate-[bounce_0.5s_infinite_0.2s]"></div>
              </div>
            )}
          </button>

          <button 
            onClick={async () => {
              if (activeRoom) await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
              resetState();
            }}
            className="flex-1 py-6 bg-rose-500/10 text-rose-500 rounded-[2rem] font-black text-[11px] tracking-[0.2em] uppercase border border-rose-500/20 active:scale-95 transition-all shadow-xl shadow-rose-950/20 hover:bg-rose-500/20"
          >
            انسحـاب ملـكي
          </button>
      </div>

      {/* 💬 CHAT MODAL: Modern Social */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[100] flex items-end justify-center animate-in slide-in-from-bottom duration-500">
           <div className="w-full max-w-xl bg-slate-900/90 rounded-t-[4rem] border-t border-white/10 flex flex-col h-[75vh] shadow-[0_-30px_100px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="p-10 flex justify-between items-center border-b border-white/5 bg-slate-900">
                 <div className="flex items-center gap-5">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.8)]"></div>
                    <h3 className="text-2xl font-black text-white tracking-tighter">دردشة القمة</h3>
                 </div>
                 <button onClick={() => setIsChatOpen(false)} className="p-4 hover:bg-white/5 rounded-full text-slate-500 transition-colors transform hover:rotate-90 duration-300">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-950/30">
                 {messages.map(m => (
                   <div key={m.id} className={`flex flex-col ${m.senderId === currentUser.id ? 'items-start' : 'items-end'}`}>
                      <span className="text-[10px] font-black text-slate-600 mb-1.5 px-3 uppercase tracking-widest">{m.senderName}</span>
                      <div className={`max-w-[85%] p-5 rounded-[2rem] text-[13px] font-bold shadow-2xl transition-all hover:scale-[1.02] ${m.senderId === currentUser.id ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none border border-white/5 shadow-black'}`}>
                         {m.text}
                      </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
              </div>

              <div className="p-10 border-t border-white/5 flex gap-4 bg-slate-900">
                 <input 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="وجه رسالتك للخصم..."
                    className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl px-8 py-5 text-white outline-none focus:border-indigo-500 font-bold transition-all shadow-inner placeholder:text-slate-600 placeholder:font-black placeholder:text-[10px] placeholder:uppercase"
                 />
                 <button onClick={sendMessage} className="p-6 bg-indigo-600 text-white rounded-2xl shadow-[0_10px_30px_rgba(79,70,229,0.4)] active:scale-90 transition-transform hover:bg-indigo-500">
                    <svg className="w-7 h-7 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* 🎭 AMBIENCE: Moving Fog */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_50%_50%,#1e1b4b_0%,transparent_70%)]"></div>
    </div>
  );
};

export default DamaView;
