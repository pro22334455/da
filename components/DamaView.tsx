import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, set, update, remove, push } from '../firebaseService';

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
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  const [chatMessages, setChatMessages] = useState<{sender: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const audioCtxRef = useRef<AudioContext | null>(null);

  const calculatePoints = (time: number) => {
    return Math.max(1, 10 - Math.floor(time / 2));
  };

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
            p2Time: activeRoom.timeLimit * 60 
          });
        }
      }

      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.p1Time !== undefined) setP1Time(data.p1Time);
      if (data.p2Time !== undefined) setP2Time(data.p2Time);
      
      if (data.chat) {
        setChatMessages(Object.values(data.chat));
      }

      if (data.status === 'closed') {
        resetState();
      }
    });

    return () => unsubscribe();
  }, [activeRoom, playerRole, gameStarted, currentUser]);

  const resetState = () => {
    setActiveRoom(null);
    setGameStarted(false);
    setOpponent(null);
    setBoard([]);
    setPlayerRole(null);
    setChatMessages([]);
  };

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
      if (playerRole === 1 && !gameStarted) {
        await remove(ref(db, `rooms/${activeRoom.id}`));
      }
    }
    resetState();
  };

  useEffect(() => {
    if (!gameStarted || playerRole !== 1 || !activeRoom) return;
    const interval = setInterval(() => {
      const gameRef = ref(db, `rooms/${activeRoom.id}`);
      if (turn === 1) {
        const next = Math.max(0, p1Time - 1);
        update(gameRef, { p1Time: next });
      } else {
        const next = Math.max(0, p2Time - 1);
        update(gameRef, { p2Time: next });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, turn, p1Time, p2Time, playerRole, activeRoom]);

  const initBoard = () => {
    const newBoard: DamaBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) {
          if (r < 3) newBoard[r][c] = { player: 1, king: false };
          else if (r > 4) newBoard[r][c] = { player: 2, king: false };
        }
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
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
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
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const midR = row + dr, midC = col + dc;
        const landR = row + 2 * dr, landC = col + 2 * dc;
        if (inBounds(midR, midC) && inBounds(landR, landC)) {
          const midPiece = currentBoard[midR][midC], landPiece = currentBoard[landR][landC];
          if (midPiece && midPiece.player !== piece.player && landPiece === null && !visitedCaptures.has(`${midR},${midC}`)) {
            const nextVisited = new Set(visitedCaptures);
            nextVisited.add(`${midR},${midC}`);
            const further = getJumps(piece, landR, landC, currentBoard, nextVisited);
            if (further.length > 0) further.forEach(seq => jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }, ...seq]));
            else jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }]);
          }
        }
      } else {
        let step = 1;
        while (true) {
          const midR = row + dr * step, midC = col + dc * step;
          const landStartR = row + dr * (step + 1), landStartC = col + dc * (step + 1);
          if (!inBounds(midR, midC) || !inBounds(landStartR, landStartC)) break;
          const midPiece = currentBoard[midR][midC];
          if (midPiece === null) { step++; continue; }
          if (midPiece.player === piece.player || visitedCaptures.has(`${midR},${midC}`)) break;
          let landStep = step + 1;
          while (true) {
            const landR = row + dr * landStep, landC = col + dc * landStep;
            if (!inBounds(landR, landC) || currentBoard[landR][landC] !== null) break;
            const nextVisited = new Set(visitedCaptures);
            nextVisited.add(`${midR},${midC}`);
            const further = getJumps(piece, landR, landC, currentBoard, nextVisited);
            if (further.length > 0) further.forEach(seq => jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }, ...seq]));
            else jumps.push([{ from: [row, col], to: [landR, landC], cap: [midR, midC] }]);
            landStep++;
          }
          break;
        }
      }
    }
    return jumps;
  }, []);

  const getLongestJumps = useCallback((player: 1 | 2, currentBoard: DamaBoard) => {
    let maxCount = 0;
    const moves: Record<string, any[]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece.player === player) {
          const jumps = getJumps(piece, r, c, currentBoard);
          if (jumps.length > 0) {
            const bestLen = Math.max(...jumps.map(j => j.length));
            if (bestLen > maxCount) maxCount = bestLen;
            moves[`${r},${c}`] = jumps.filter(j => j.length === (bestLen || 1));
          }
        }
      }
    }
    const filtered: Record<string, any[]> = {};
    if (maxCount > 0) {
      Object.entries(moves).forEach(([k, v]) => { if (v[0].length === maxCount) filtered[k] = v; });
    }
    return { maxCount, allMoves: filtered };
  }, [getJumps]);

  const computeHighlights = (r: number, c: number) => {
    const hl: [number, number][] = [];
    const piece = board[r][c];
    if (!piece) return hl;
    const { maxCount, allMoves } = getLongestJumps(turn, board);
    if (maxCount > 0) {
      if (allMoves[`${r},${c}`]) allMoves[`${r},${c}`].forEach(seq => hl.push(seq[0].to));
      return hl;
    }
    const steps: [number, number][] = piece.king ? [[-1,-1], [-1,1], [1,-1], [1,1]] : (piece.player === 1 ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]]);
    steps.forEach(([dr, dc]) => {
      let step = 1;
      while (true) {
        const nr = r + dr * step, nc = c + dc * step;
        if (inBounds(nr, nc) && board[nr][nc] === null) {
          hl.push([nr, nc]);
          if (!piece.king) break;
          step++;
        } else break;
      }
    });
    return hl;
  };

  const handleCellClick = (r: number, c: number) => {
    if (!gameStarted || turn !== playerRole || !activeRoom) return;
    const pieceClicked = board[r][c];
    if (selected === null) {
      if (pieceClicked && pieceClicked.player === turn) {
        setSelected([r, c]);
        setHighlights(computeHighlights(r, c));
        const { allMoves } = getLongestJumps(turn, board);
        if (allMoves[`${r},${c}`]) setPendingSequences(allMoves[`${r},${c}`]);
      }
    } else {
      const [sr, sc] = selected;
      if (highlights.some(h => h[0] === r && h[1] === c)) {
        playMoveSound();
        const newBoard = board.map(row => [...row]);
        const piece = newBoard[sr][sc]!;
        if (pendingSequences) {
           const seq = pendingSequences.find(s => s[0].to[0] === r && s[0].to[1] === c);
           newBoard[seq[0].cap[0]][seq[0].cap[1]] = null;
           newBoard[sr][sc] = null;
           newBoard[r][c] = piece;
           const remaining = seq.slice(1);
           if (remaining.length > 0) {
              setBoard(newBoard);
              setSelected([r, c]);
              setPendingSequences([remaining]);
              setHighlights([[remaining[0].to[0], remaining[0].to[1]]]);
              update(ref(db, `rooms/${activeRoom.id}`), { board: newBoard });
              return;
           }
        } else {
          newBoard[sr][sc] = null;
          newBoard[r][c] = piece;
        }
        if ((piece.player === 1 && r === 7) || (piece.player === 2 && r === 0)) piece.king = true;
        const nextTurn = turn === 1 ? 2 : 1;
        update(ref(db, `rooms/${activeRoom.id}`), { board: newBoard, turn: nextTurn });
        setSelected(null);
        setHighlights([]);
        setPendingSequences(null);
      } else {
        setSelected(null);
        setHighlights([]);
      }
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRoom) return;
    const chatRef = ref(db, `rooms/${activeRoom.id}/chat`);
    await push(chatRef, { sender: currentUser.username, text: chatInput, time: Date.now() });
    setChatInput('');
  };

  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  if (!activeRoom) {
    return <Lobby currentUser={currentUser} onJoinRoom={handleJoinOrCreate} rooms={allRooms} onRoomsUpdate={setAllRooms} />;
  }

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden relative">
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 gap-6 md:gap-8">
        <div className="w-full max-w-[620px] flex items-center justify-between glass p-4 md:p-5 rounded-3xl border border-white/5 shadow-2xl">
           <div className="flex items-center gap-4 md:gap-5">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl overflow-hidden border border-white/10 bg-slate-800 shadow-xl">
                <img src={opponent?.avatar || ''} className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-black text-slate-400 text-base md:text-lg">{opponent?.username || "في انتظار الخصم..."}</h4>
                <div className={`text-xl md:text-2xl font-mono font-black ${turn === (playerRole === 1 ? 2 : 1) ? 'text-amber-500 animate-pulse' : 'text-slate-700'}`}>
                  {formatTime(playerRole === 1 ? p2Time : p1Time)}
                </div>
              </div>
           </div>
           <button onClick={handleLeaveRoom} className="p-3 md:p-4 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-transparent hover:border-rose-500/30">
             <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           </button>
        </div>

        <div className="relative aspect-square w-full max-w-[540px] bg-[#2a1d15] p-2 md:p-4 rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.9)] border-[8px] md:border-[16px] border-[#3d2b1f] overflow-hidden">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full shadow-2xl">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 === 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isHighlight = highlights.some(h => h[0] === r && h[1] === c);
              return (
                <div key={`${r}-${c}`} onClick={() => handleCellClick(r, c)} className={`relative flex items-center justify-center cursor-pointer ${isDark ? 'bg-[#5d4037]' : 'bg-[#d7ccc8]'}`}>
                  {isHighlight && <div className="absolute w-3 h-3 md:w-5 md:h-5 rounded-full bg-emerald-400 z-10 shadow-[0_0_20px_rgba(52,211,153,1)] animate-pulse"></div>}
                  {isSelected && <div className="absolute inset-0 bg-amber-400/20 border-[2px] md:border-[4px] border-amber-400 z-20"></div>}
                  {piece && (
                    <div className={`w-[85%] h-[85%] rounded-full shadow-[0_5px_10px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110 -translate-y-1' : 'scale-100'} border-[2px] md:border-[3px] border-black/30`}>
                      {piece.king && <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-10 md:h-10 text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" /></svg>}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
        </div>

        <div className="w-full max-w-[620px] flex items-center justify-between glass p-4 md:p-5 rounded-3xl border border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
           <div className="flex items-center gap-4 md:gap-5">
              <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 md:border-4 border-indigo-500 bg-slate-800 shadow-2xl">
                <img src={currentUser.avatar || ''} className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-black text-white text-lg md:text-xl">{currentUser.username}</h4>
                <div className={`text-2xl md:text-3xl font-mono font-black ${turn === playerRole ? 'text-indigo-400 animate-pulse' : 'text-slate-700'}`}>
                  {formatTime(playerRole === 1 ? p1Time : p2Time)}
                </div>
              </div>
           </div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest font-black">جائزة الفوز</span>
              <span className="text-2xl md:text-3xl font-black text-emerald-400">+{calculatePoints(activeRoom.timeLimit)}</span>
           </div>
        </div>
      </div>

      <div className="w-80 border-l border-white/5 glass flex flex-col hidden lg:flex">
         <div className="p-6 border-b border-white/5 bg-white/5">
            <h3 className="font-black flex items-center gap-3 text-lg uppercase tracking-tighter text-white">دردشة الغرفة</h3>
         </div>
         <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {chatMessages.map((msg, i) => (
               <div key={i} className={`flex flex-col ${msg.sender === currentUser.username ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-slate-500 mb-1 font-black uppercase tracking-widest">{msg.sender}</span>
                  <div className={`px-4 py-2 rounded-2xl text-sm max-w-[90%] ${msg.sender === currentUser.username ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100 border border-white/5'}`}>
                     {msg.text}
                  </div>
               </div>
            ))}
         </div>
         <form onSubmit={sendChat} className="p-6 border-t border-white/5 bg-slate-900/50">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="ارسل رسالة للخصم..."
              className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-white font-bold"
            />
         </form>
      </div>
    </div>
  );
};

export default DamaView;
