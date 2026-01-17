
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
  const [pendingSequences, setPendingSequences] = useState<any[] | null>(null);
  
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerRole, setPlayerRole] = useState<1 | 2 | null>(null);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showChatMobile, setShowChatMobile] = useState(false);
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  const [chatMessages, setChatMessages] = useState<{sender: string, text: string, time: number}[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [isMicOn, setIsMicOn] = useState(false);
  const [isOpponentSpeaking, setIsOpponentSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const initBoard = () => {
    const newBoard: DamaBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) newBoard[r][c] = { player: 1, king: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) newBoard[r][c] = { player: 2, king: false };
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
      
      // 1. تهيئة اللوحة فوراً للمنشئ إذا لم تكن موجودة
      if (playerRole === 1 && !data.board) {
        const initialBoard = initBoard();
        update(gameRef, { 
          board: initialBoard, 
          turn: 1, 
          p1Time: activeRoom.timeLimit * 60, 
          p2Time: activeRoom.timeLimit * 60 
        });
      }

      // 2. تفعيل حالة اللعب فقط عند وجود خصم وحالة playing
      if (data.status === 'playing' && data.opponent) {
        if (!gameStarted) {
          setOpponent(data.opponent.id === currentUser.id ? data.creator : data.opponent);
          setGameStarted(true);
        }
      } else {
        setGameStarted(false);
        setOpponent(data.opponent || null);
      }
      
      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.p1Time !== undefined) setP1Time(data.p1Time);
      if (data.p2Time !== undefined) setP2Time(data.p2Time);
      
      if (data.chat) {
        const msgs = Object.values(data.chat) as any[];
        setChatMessages(msgs.sort((a,b) => a.time - b.time));
      }
      
      if (data.voiceActivity) {
        const oppId = playerRole === 1 ? 'p2' : 'p1';
        setIsOpponentSpeaking(!!data.voiceActivity[oppId]);
      }
      
      if (data.status === 'closed') resetState();
    });
    return () => unsubscribe();
  }, [activeRoom, playerRole, gameStarted, currentUser]);

  const toggleMic = async () => {
    if (!isMicOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setIsMicOn(true);
        if (activeRoom) {
          const roleKey = playerRole === 1 ? 'p1' : 'p2';
          update(ref(db, `rooms/${activeRoom.id}/voiceActivity`), { [roleKey]: true });
        }
      } catch (err) { alert("يرجى تفعيل الميكروفون"); }
    } else {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsMicOn(false);
      if (activeRoom) {
        const roleKey = playerRole === 1 ? 'p1' : 'p2';
        update(ref(db, `rooms/${activeRoom.id}/voiceActivity`), { [roleKey]: false });
      }
    }
  };

  const resetState = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setActiveRoom(null);
    setGameStarted(false);
    setOpponent(null);
    setBoard(null);
    setPlayerRole(null);
    setChatMessages([]);
    setIsMicOn(false);
  };

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      if (playerRole === 1 && !gameStarted) {
         await remove(ref(db, `rooms/${activeRoom.id}`));
      } else {
         await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
      }
    }
    resetState();
  };

  useEffect(() => {
    // الوقت يبدأ الاحتساب فقط إذا بدأت اللعبة (كلا اللاعبين موجودين)
    if (!gameStarted || !activeRoom) return;
    const interval = setInterval(() => {
      const gameRef = ref(db, `rooms/${activeRoom.id}`);
      if (turn === 1) {
        if (p1Time > 0) update(gameRef, { p1Time: p1Time - 1 });
      } else {
        if (p2Time > 0) update(gameRef, { p2Time: p2Time - 1 });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, turn, p1Time, p2Time, activeRoom]);

  const handleJoinOrCreate = (room: Room) => {
    setActiveRoom(room);
    setPlayerRole(room.creator.id === currentUser.id ? 1 : 2);
  };

  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getJumps = useCallback((piece: DamaPiece, row: number, col: number, currentBoard: DamaBoard, visitedCaptures: Set<string> = new Set()): any[] => {
    const jumps: any[] = [];
    const directions: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of directions) {
      const midR = row + dr, midC = col + dc, landR = row + 2 * dr, landC = col + 2 * dc;
      if (inBounds(midR, midC) && inBounds(landR, landC)) {
        const midP = currentBoard[midR][midC], landP = currentBoard[landR][landC];
        if (midP && midP.player !== piece.player && landP === null && !visitedCaptures.has(`${midR},${midC}`)) {
          const nextV = new Set(visitedCaptures); nextV.add(`${midR},${midC}`);
          const further = getJumps(piece, landR, landC, currentBoard, nextV);
          if (further.length > 0) further.forEach(seq => jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }, ...seq]));
          else jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }]);
        }
      }
    }
    return jumps;
  }, []);

  const getLongestJumps = useCallback((player: 1 | 2, currentBoard: DamaBoard) => {
    let max = 0; const moves: Record<string, any[]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = currentBoard[r][c];
        if (p && p.player === player) {
          const jumps = getJumps(p, r, c, currentBoard);
          if (jumps.length > 0) {
            const best = Math.max(...jumps.map(j => j.length));
            if (best > max) max = best;
            moves[`${r},${c}`] = jumps.filter(j => j.length === best);
          }
        }
      }
    }
    const filtered: Record<string, any[]> = {};
    if (max > 0) Object.entries(moves).forEach(([k, v]) => { if (v[0].length === max) filtered[k] = v; });
    return { maxCount: max, allMoves: filtered };
  }, [getJumps]);

  const computeHighlights = (r: number, c: number) => {
    if (!board) return [];
    const hl: [number, number][] = []; const p = board[r][c]; if (!p) return hl;
    const { maxCount, allMoves } = getLongestJumps(turn, board);
    if (maxCount > 0) {
      if (allMoves[`${r},${c}`]) allMoves[`${r},${c}`].forEach(seq => hl.push(seq[0].to));
      return hl;
    }
    const steps: [number, number][] = p.king ? [[-1,-1], [-1,1], [1,-1], [1,1]] : (p.player === 1 ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]]);
    steps.forEach(([dr, dc]) => {
      let step = 1;
      while (true) {
        const nr = r + dr * step, nc = c + dc * step;
        if (inBounds(nr, nc) && board[nr][nc] === null) { hl.push([nr, nc]); if (!p.king) break; step++; } else break;
      }
    });
    return hl;
  };

  const handleCellClick = (r: number, c: number) => {
    // منع الحركة إذا لم تبدأ اللعبة (بانتظار الخصم)
    if (!gameStarted) {
       console.log("بانتظار دخول الخصم لبدء اللعب...");
       return;
    }
    if (turn !== playerRole || !activeRoom || !board) return;
    
    if (selected === null) {
      if (board[r][c]?.player === turn) {
        setSelected([r, c]); setHighlights(computeHighlights(r, c));
        const { allMoves } = getLongestJumps(turn, board);
        if (allMoves[`${r},${c}`]) setPendingSequences(allMoves[`${r},${c}`]);
      }
    } else {
      const [sr, sc] = selected;
      if (highlights.some(h => h[0] === r && h[1] === c)) {
        const newB = board.map(row => [...row]); const p = { ...newB[sr][sc]! };
        if (pendingSequences) {
           const seq = pendingSequences.find(s => s[0].to[0] === r && s[0].to[1] === c);
           newB[seq[0].cap[0]][seq[0].cap[1]] = null; newB[sr][sc] = null; newB[r][c] = p;
           const rem = seq.slice(1);
           if (rem.length > 0) {
              setBoard(newB); setSelected([r, c]); setPendingSequences([rem]); setHighlights([[rem[0].to[0], rem[0].to[1]]]);
              update(ref(db, `rooms/${activeRoom.id}`), { board: newB }); return;
           }
        } else { newB[sr][sc] = null; newB[r][c] = p; }
        if ((p.player === 1 && r === 7) || (p.player === 2 && r === 0)) p.king = true;
        update(ref(db, `rooms/${activeRoom.id}`), { board: newB, turn: turn === 1 ? 2 : 1 });
        setSelected(null); setHighlights([]); setPendingSequences(null);
      } else { setSelected(null); setHighlights([]); }
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chatInput.trim() || !activeRoom) return;
    await push(ref(db, `rooms/${activeRoom.id}/chat`), { sender: currentUser.username, text: chatInput, time: Date.now() });
    setChatInput('');
  };

  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  if (!activeRoom) return <Lobby currentUser={currentUser} onJoinRoom={handleJoinOrCreate} rooms={allRooms} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col lg:flex-row h-full bg-[#020617] relative overflow-hidden" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 overflow-y-auto custom-scrollbar">
        {/* Top bar */}
        <div className="w-full max-w-[620px] flex items-center justify-between">
           <button onClick={() => setShowRules(true)} className="p-3 bg-white/5 rounded-2xl text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </button>
           <button onClick={() => setShowChatMobile(!showChatMobile)} className="lg:hidden p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
           </button>
           <button onClick={handleLeaveRoom} className="p-3 bg-rose-500/10 rounded-2xl text-rose-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           </button>
        </div>

        {/* Players Status UI */}
        <div className="w-full max-w-[620px] glass p-4 rounded-3xl border border-white/5 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <img src={opponent?.avatar || ''} className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10" />
              <div>
                <p className="text-xs text-slate-400">{opponent?.username || "انتظار..."}</p>
                <p className={`text-lg font-mono font-black ${gameStarted ? 'text-amber-500' : 'text-slate-600'}`}>{formatTime(playerRole === 1 ? p2Time : p1Time)}</p>
              </div>
           </div>
           <div className="text-center">
              <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest block">الحالة</span>
              <span className={`text-xs font-bold ${!gameStarted ? 'text-rose-500 animate-pulse' : (turn === playerRole ? 'text-emerald-500' : 'text-slate-400')}`}>
                {!gameStarted ? 'بانتظار الخصم' : (turn === playerRole ? 'دورك الآن' : 'دور الخصم')}
              </span>
           </div>
           <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-100">{currentUser.username}</p>
                <p className={`text-lg font-mono font-black ${gameStarted ? 'text-indigo-400' : 'text-slate-600'}`}>{formatTime(playerRole === 1 ? p1Time : p2Time)}</p>
              </div>
              <img src={currentUser.avatar || ''} className="w-12 h-12 rounded-xl bg-slate-800 border border-indigo-500/50" />
           </div>
        </div>

        {/* The Board Display Area */}
        <div className="relative aspect-square w-full max-w-[500px] bg-[#1a120b] p-2 rounded-[2rem] shadow-2xl border-[10px] border-[#2c1e14]">
          {board ? (
            <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden border border-black/40">
              {!gameStarted && (
                 <div className="absolute inset-0 z-30 bg-black/20 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                    <div className="bg-slate-900/90 px-6 py-3 rounded-2xl border border-white/10 shadow-2xl">
                       <p className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3">
                          <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                          بانتظار المنافس
                       </p>
                    </div>
                 </div>
              )}
              {board.map((row, r) => row.map((piece, c) => {
                const isDark = (r + c) % 2 === 0;
                const isSelected = selected?.[0] === r && selected?.[1] === c;
                const isHighlight = highlights.some(h => h[0] === r && h[1] === c);
                return (
                  <div key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center cursor-pointer ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'}`}>
                    {isHighlight && <div className="absolute w-3 h-3 rounded-full bg-emerald-400 z-10 animate-pulse"></div>}
                    {isSelected && <div className="absolute inset-0 bg-amber-400/20 border border-amber-400 z-20"></div>}
                    {piece && (
                      <div className={`w-[80%] h-[80%] rounded-full piece-shadow flex items-center justify-center transition-all ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110' : 'scale-100'} ${!gameStarted ? 'opacity-90 grayscale-[0.3]' : ''}`}>
                        {piece.king && <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-300" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-indigo-400">
               <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="font-bold text-sm animate-pulse">جاري بناء الحلبة...</p>
            </div>
          )}
        </div>
        
        <button onClick={toggleMic} className={`mt-4 px-8 py-4 rounded-2xl font-black flex items-center gap-3 transition-all ${isMicOn ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
           {isMicOn ? 'الميكروفون يعمل' : 'تشغيل الميكروفون'}
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        </button>
      </div>

      {/* Chat Panel */}
      <div className={`fixed inset-0 lg:static lg:inset-auto lg:flex flex-col w-full lg:w-80 border-r border-white/5 glass transition-transform duration-300 z-50 ${showChatMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
         <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
           <h3 className="font-black text-white text-xs uppercase tracking-widest">المحادثة</h3>
           <button onClick={() => setShowChatMobile(false)} className="lg:hidden p-2 text-slate-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
         </div>
         <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-slate-950/20">
            {chatMessages.map((msg, i) => {
              const isMe = msg.sender === currentUser.username;
              return (
                <div key={i} className={`flex flex-col ${isMe ? 'items-start' : 'items-end'}`}>
                   <span className="text-[10px] text-slate-500 mb-1 px-2 font-bold">{isMe ? 'أنت' : msg.sender}</span>
                   <div className={`px-4 py-2.5 rounded-2xl text-[13px] max-w-[85%] shadow-md ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none'}`}>
                     {msg.text}
                   </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
         </div>
         <form onSubmit={sendChat} className="p-4 border-t border-white/5 bg-slate-900/80">
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="اكتب رسالتك..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 text-white" />
              <button type="submit" className="p-3 bg-indigo-600 rounded-xl text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
            </div>
         </form>
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-6" onClick={() => setShowRules(false)}>
           <div className="glass w-full max-w-lg p-10 rounded-[3rem] border border-white/10" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black mb-6">قواعد اللعبة</h2>
              <ul className="space-y-4 text-slate-300 font-medium text-sm">
                 <li>• القفز إلزامي عند توفر فرصة لأكل حجر الخصم.</li>
                 <li>• يجب إكمال سلسلة القفزات المتعددة.</li>
                 <li>• يتحول الحجر لملك عند الوصول للصف الأخير.</li>
              </ul>
              <button onClick={() => setShowRules(false)} className="w-full mt-10 py-4 bg-white text-slate-950 rounded-2xl font-black uppercase text-sm">فهمت ذلك</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
