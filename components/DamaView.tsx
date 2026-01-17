
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, update, remove, push } from '../firebaseService';

interface DamaViewProps {
  currentUser: User;
  onUpdatePoints: (p: number) => void;
}

const DamaView: React.FC<DamaViewProps> = ({ currentUser, onUpdatePoints }) => {
  const [board, setBoard] = useState<DamaBoard>([]);
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
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  const [chatMessages, setChatMessages] = useState<{sender: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [isMicOn, setIsMicOn] = useState(false);
  const [isOpponentSpeaking, setIsOpponentSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!activeRoom) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      if (data.status === 'playing' && data.opponent && !gameStarted) {
        setOpponent(data.opponent.id === currentUser.id ? data.creator : data.opponent);
        setGameStarted(true);
        if (playerRole === 1 && !data.board) {
          const initialBoard = initBoard();
          update(gameRef, { 
            board: initialBoard, 
            turn: 1, 
            p1Time: activeRoom.timeLimit * 60, 
            p2Time: activeRoom.timeLimit * 60,
            status: 'playing' 
          });
        }
      }
      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.p1Time !== undefined) setP1Time(data.p1Time);
      if (data.p2Time !== undefined) setP2Time(data.p2Time);
      if (data.chat) setChatMessages(Object.values(data.chat));
      if (data.voiceActivity) {
        const oppId = playerRole === 1 ? 'p2' : 'p1';
        setIsOpponentSpeaking(!!data.voiceActivity[oppId]);
      }
      if (data.status === 'closed') resetState();
    });
    return () => unsubscribe();
  }, [activeRoom, playerRole, gameStarted, currentUser, turn]);

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
      } catch (err) { alert("يرجى تفعيل إذن المايكروفون من إعدادات المتصفح"); }
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
    setBoard([]);
    setPlayerRole(null);
    setChatMessages([]);
    setIsMicOn(false);
  };

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
      if (playerRole === 1 && !gameStarted) await remove(ref(db, `rooms/${activeRoom.id}`));
    }
    resetState();
  };

  useEffect(() => {
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

  const handleJoinOrCreate = (room: Room) => {
    setActiveRoom(room);
    setPlayerRole(room.creator.id === currentUser.id ? 1 : 2);
  };

  const playMoveSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }, []);

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
    if (!gameStarted || turn !== playerRole || !activeRoom) return;
    if (selected === null) {
      if (board[r][c]?.player === turn) {
        setSelected([r, c]); setHighlights(computeHighlights(r, c));
        const { allMoves } = getLongestJumps(turn, board);
        if (allMoves[`${r},${c}`]) setPendingSequences(allMoves[`${r},${c}`]);
      }
    } else {
      const [sr, sc] = selected;
      if (highlights.some(h => h[0] === r && h[1] === c)) {
        playMoveSound(); const newB = board.map(row => [...row]); const p = { ...newB[sr][sc]! };
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
    <div className="flex flex-col lg:flex-row h-full bg-[#020617] relative">
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 overflow-y-auto">
        
        {/* Top bar */}
        <div className="w-full max-w-[620px] flex items-center justify-between">
           <button onClick={() => setShowRules(true)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-400 border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </button>
           <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">مباشر</span>
           </div>
           <button onClick={handleLeaveRoom} className="p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl text-rose-500 border border-rose-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           </button>
        </div>

        {/* Opponent Card */}
        <div className="w-full max-w-[620px] flex items-center justify-between glass p-4 rounded-3xl border border-white/5">
           <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl overflow-hidden border-2 bg-slate-800 transition-all ${isOpponentSpeaking ? 'border-emerald-500 scale-105 shadow-emerald-500/20' : 'border-white/10'}`}>
                <img src={opponent?.avatar || ''} className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-black text-slate-400 text-sm">{opponent?.username || "انتظار الخصم..."}</h4>
                <div className={`text-xl font-mono font-black ${turn === (playerRole === 1 ? 2 : 1) ? 'text-amber-500 animate-pulse' : 'text-slate-700'}`}>
                  {formatTime(playerRole === 1 ? p2Time : p1Time)}
                </div>
              </div>
           </div>
           {isOpponentSpeaking && <div className="flex gap-1 items-center px-3 py-1 bg-emerald-500/10 rounded-full"><span className="w-1 h-3 bg-emerald-500 animate-bounce"></span><span className="w-1 h-5 bg-emerald-500 animate-bounce [animation-delay:-0.2s]"></span><span className="w-1 h-3 bg-emerald-500 animate-bounce [animation-delay:-0.4s]"></span></div>}
        </div>

        {/* The Board */}
        <div className="relative aspect-square w-full max-w-[500px] bg-[#1a120b] p-2 md:p-4 rounded-[2rem] shadow-2xl border-[10px] border-[#2c1e14]">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 === 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isHighlight = highlights.some(h => h[0] === r && h[1] === c);
              return (
                <div key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center cursor-pointer ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'}`}>
                  {isHighlight && <div className="absolute w-3 h-3 md:w-4 md:h-4 rounded-full bg-emerald-400 z-10 animate-pulse"></div>}
                  {isSelected && <div className="absolute inset-0 bg-amber-400/20 border-2 border-amber-400 z-20"></div>}
                  {piece && (
                    <div className={`w-[82%] h-[82%] rounded-full shadow-2xl flex items-center justify-center transition-all ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110 -translate-y-1' : 'scale-100'} border-2 border-black/20`}>
                      {piece.king && <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-8 md:h-8 text-amber-300" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>

        {/* My Card */}
        <div className="w-full max-w-[620px] flex items-center justify-between glass p-4 rounded-3xl border border-indigo-500/20">
           <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl overflow-hidden border-2 bg-slate-800 transition-all ${isMicOn ? 'border-emerald-500 shadow-emerald-500/20' : 'border-indigo-500'}`}>
                <img src={currentUser.avatar || ''} className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-black text-white text-sm">{currentUser.username}</h4>
                <div className={`text-xl font-mono font-black ${turn === playerRole ? 'text-indigo-400 animate-pulse' : 'text-slate-700'}`}>
                  {formatTime(playerRole === 1 ? p1Time : p2Time)}
                </div>
              </div>
           </div>
           <button onClick={toggleMic} className={`p-4 rounded-2xl transition-all border ${isMicOn ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-slate-800 text-slate-400 border-white/5'}`}>
             {isMicOn ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" /></svg>}
           </button>
        </div>
      </div>

      {/* Modern Desktop Chat Panel */}
      <div className="w-80 border-r border-white/5 glass flex flex-col hidden lg:flex">
         <div className="p-6 border-b border-white/5"><h3 className="font-black text-white text-xs uppercase tracking-widest">المحادثة المباشرة</h3></div>
         <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {chatMessages.map((msg, i) => (
               <div key={i} className={`flex flex-col ${msg.sender === currentUser.username ? 'items-start' : 'items-end'}`}>
                  <span className="text-[10px] text-slate-500 mb-1">{msg.sender}</span>
                  <div className={`px-4 py-2 rounded-2xl text-xs max-w-[85%] ${msg.sender === currentUser.username ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-white/5'}`}>{msg.text}</div>
               </div>
            ))}
         </div>
         <form onSubmit={sendChat} className="p-4 border-t border-white/5 bg-slate-900/30">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="أرسل رسالة للخصم..." className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-xs outline-none focus:border-indigo-500/50 text-white font-bold" />
         </form>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
           <div className="glass w-full max-w-lg p-10 rounded-[3rem] border border-white/10">
              <h2 className="text-3xl font-black mb-8 text-white">قواعد اللعبة</h2>
              <ul className="space-y-4 text-slate-300 font-medium">
                 <li className="flex gap-4"><span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-xs">1</span> القفز إلزامي عند توفر فرصة لأكل حجر الخصم.</li>
                 <li className="flex gap-4"><span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-xs">2</span> الأكل المتعدد إلزامي؛ يجب إكمال سلسلة القفزات.</li>
                 <li className="flex gap-4"><span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-xs">3</span> يتحول الحجر إلى "ملك" عند وصوله للصف الأخير للخصم.</li>
                 <li className="flex gap-4"><span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-xs">4</span> الملك يتحرك في جميع الاتجاهات وبأي مسافة.</li>
              </ul>
              <button onClick={() => setShowRules(false)} className="w-full mt-10 py-4 bg-white text-slate-950 rounded-2xl font-black uppercase text-sm">فهمت ذلك</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
