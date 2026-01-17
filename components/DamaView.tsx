
import React, { useState, useEffect, useMemo } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, update, remove, set } from '../firebaseService';

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
  const [showRules, setShowRules] = useState(false);
  
  // التحكم في الحركة والمزامنة (بناءً على كودك)
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<number[][][] | null>(null);

  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  const playerRole = useMemo(() => {
    if (!activeRoom) return null;
    return activeRoom.creator.id === currentUser.id ? 1 : 2;
  }, [activeRoom, currentUser.id]);

  const createInitialBoard = (): DamaBoard => {
    const board: DamaBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // استخدام نفس منطق الإحداثيات الخاص بك (r+c)%2 === 0
        if ((r + c) % 2 === 0) {
          if (r < 3) board[r][c] = { player: 1, king: false };
          if (r > 4) board[r][c] = { player: 2, king: false };
        }
      }
    }
    return board;
  };

  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getJumps = (b: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const mr = row + dr, mc = col + dc;
        const lr = row + dr * 2, lc = col + dc * 2;
        if (inBounds(mr, mc) && inBounds(lr, lc)) {
          const mid = b[mr][mc];
          if (mid && mid.player !== piece.player && !b[lr][lc] && !visited.has(`${mr},${mc}`)) {
            const newVisited = new Set(visited);
            newVisited.add(`${mr},${mc}`);
            const next = getJumps(b, piece, lr, lc, newVisited);
            if (next.length) next.forEach(seq => jumps.push([[lr, lc, mr, mc], ...seq]));
            else jumps.push([[lr, lc, mr, mc]]);
          }
        }
      } else {
        let step = 1;
        while (true) {
          const mr = row + dr * step, mc = col + dc * step;
          const lr = row + dr * (step + 1), lc = col + dc * (step + 1);
          if (!inBounds(mr, mc) || !inBounds(lr, lc)) break;
          const mid = b[mr][mc];
          if (!mid) { step++; continue; }
          if (mid.player === piece.player) break;
          if (visited.has(`${mr},${mc}`)) break;
          let landStep = step + 1;
          while (true) {
            const lr2 = row + dr * landStep, lc2 = col + dc * landStep;
            if (!inBounds(lr2, lc2) || b[lr2][lc2]) break;
            const newVisited = new Set(visited); newVisited.add(`${mr},${mc}`);
            const next = getJumps(b, piece, lr2, lc2, newVisited);
            if (next.length) next.forEach(seq => jumps.push([[lr2, lc2, mr, mc], ...seq]));
            else jumps.push([[lr2, lc2, mr, mc]]);
            landStep++;
          }
          break;
        }
      }
    }
    return jumps;
  };

  const getLongestJumps = (b: DamaBoard, player: 1 | 2) => {
    let max = 0; const moves: Record<string, number[][][]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece && piece.player === player) {
          const jumps = getJumps(b, piece, r, c);
          if (jumps.length) {
            const best = Math.max(...jumps.map(j => j.length));
            if (best >= max) {
              if (best > max) Object.keys(moves).forEach(k => delete moves[k]);
              max = best;
              moves[`${r},${c}`] = jumps.filter(j => j.length === best);
            }
          }
        }
      }
    }
    return { max, moves };
  };

  // المزامنة مع Firebase لغرفة محددة
  useEffect(() => {
    if (!activeRoom || !playerRole) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      if (playerRole === 1 && !data.board) {
        update(gameRef, { 
          board: createInitialBoard(), 
          turn: 1, 
          status: data.opponent ? 'playing' : 'waiting',
          p1Time: activeRoom.timeLimit * 60,
          p2Time: activeRoom.timeLimit * 60
        });
        return;
      }

      if (data.opponent) {
        setOpponent(data.opponent.id === currentUser.id ? data.creator : data.opponent);
        if (data.status === 'playing') setGameStarted(true);
      }
      
      if (data.board) setBoard(data.board);
      if (data.turn) setTurn(data.turn);
      if (data.p1Time !== undefined) setP1Time(data.p1Time);
      if (data.p2Time !== undefined) setP2Time(data.p2Time);
      if (data.status === 'closed') resetState();
    });
    
    return () => unsubscribe();
  }, [activeRoom, playerRole]);

  const saveGame = (nb: DamaBoard, nt: 1 | 2) => {
    if (!activeRoom) return;
    update(ref(db, `rooms/${activeRoom.id}`), { board: nb, turn: nt });
  };

  const handleCellClick = (r: number, c: number) => {
    if (!board || turn !== playerRole || !gameStarted) return;
    
    const piece = board[r][c];
    const { max, moves } = getLongestJumps(board, turn);

    if (!selected) {
      if (piece && piece.player === turn) {
        if (max > 0 && moves[`${r},${c}`]) {
          setSelected([r, c]);
          setPending(moves[`${r},${c}`].map(seq => [...seq]));
        } else if (max === 0) setSelected([r, c]);
      }
    } else {
      const [sr, sc] = selected;
      const pieceNow = board[sr][sc];
      if (!pieceNow) return;

      if (pending && pending.length > 0) {
        const filtered = pending.filter(seq => seq[0][0] === r && seq[0][1] === c);
        if (!filtered.length) { setSelected(null); setPending(null); return; }
        
        const newBoard = board.map(row => row.slice());
        const [lr, lc, mr, mc] = filtered[0][0];
        newBoard[mr][mc] = null; newBoard[sr][sc] = null; newBoard[lr][lc] = pieceNow;
        
        const newPending = filtered.map(seq => seq.slice(1)).filter(seq => seq.length > 0);
        
        if (newPending.length > 0) {
          setBoard(newBoard);
          setSelected([lr, lc]);
          setPending(newPending);
          // مزامنة الخطوة الوسطية ليرى الخصم "الأكل"
          saveGame(newBoard, turn); 
        } else {
          if ((pieceNow.player === 1 && lr === 7) || (pieceNow.player === 2 && lr === 0)) pieceNow.king = true;
          const nextTurn = turn === 1 ? 2 : 1;
          saveGame(newBoard, nextTurn);
          setSelected(null); setPending(null);
        }
      } else {
        const dr = r - sr, dc = c - sc;
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1 && !board[r][c]) {
          const can = pieceNow.king || (pieceNow.player === 1 && dr === 1) || (pieceNow.player === 2 && dr === -1);
          if (can) {
            const newBoard = board.map(row => row.slice());
            newBoard[r][c] = pieceNow; newBoard[sr][sc] = null;
            if ((pieceNow.player === 1 && r === 7) || (pieceNow.player === 2 && r === 0)) pieceNow.king = true;
            saveGame(newBoard, turn === 1 ? 2 : 1);
          }
        }
        setSelected(null);
      }
    }
  };

  const resetState = () => { setActiveRoom(null); setGameStarted(false); setOpponent(null); setBoard(null); setSelected(null); setPending(null); };

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
    <div className="flex flex-col h-full bg-[#020617] items-center justify-center p-4 gap-4 overflow-hidden" dir="rtl">
      
      {/* HUD - معلومات اللاعبين */}
      <div className="w-full max-w-[440px] glass p-4 rounded-[1.5rem] flex justify-between items-center border border-white/5 shadow-2xl">
        <div className="flex items-center gap-2">
          <img src={opponent?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=wait`} className="w-10 h-10 rounded-xl bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase">المنافس</span>
            <span className="text-xs font-black text-amber-500 font-mono">{formatTime(playerRole === 1 ? p2Time : p1Time)}</span>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${gameStarted ? (turn === playerRole ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-slate-800 text-slate-500') : 'bg-rose-500/20 text-rose-500 animate-pulse'}`}>
          {gameStarted ? (turn === playerRole ? 'دورك الآن' : 'انتظر خصمك') : 'بانتظار المنافس'}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end text-left">
            <span className="text-[10px] font-black text-slate-500 uppercase">أنت</span>
            <span className="text-xs font-black text-indigo-400 font-mono">{formatTime(playerRole === 1 ? p1Time : p2Time)}</span>
          </div>
          <img src={currentUser.avatar || ''} className="w-10 h-10 rounded-xl bg-slate-800 border border-indigo-500/30" />
        </div>
      </div>

      {/* الرقعة - Grid System */}
      <div className="relative w-full max-w-[420px] aspect-square bg-[#1a120b] p-1.5 rounded-[2rem] shadow-2xl border-[6px] border-[#2c1e14]">
        {board ? (
          <div className="w-full h-full rounded-xl overflow-hidden grid grid-cols-8 grid-rows-8 bg-[#3e2723]">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 === 0; // متوافق مع منطقك
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const canJumpTo = pending?.some(s => s[0][0] === r && s[0][1] === c);

              return (
                <div 
                  key={`${r}-${c}`} 
                  onClick={() => handleCellClick(r, c)}
                  className={`w-full h-full flex items-center justify-center relative transition-all ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'ring-4 ring-inset ring-amber-400 z-10' : ''}`}
                >
                  {piece && (
                    <div className={`w-[82%] h-[82%] rounded-full piece-shadow transition-all transform ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110' : 'hover:scale-105'}`}>
                      {piece.king && (
                         <div className="w-full h-full flex items-center justify-center text-amber-300">
                           <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                         </div>
                      )}
                    </div>
                  )}
                  {canJumpTo && <div className="absolute inset-0 bg-emerald-500/30 animate-pulse border-2 border-emerald-400 m-1 rounded-lg"></div>}
                </div>
              );
            }))}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900 rounded-2xl text-indigo-400">
             <div className="w-10 h-10 border-4 border-current border-t-transparent rounded-full animate-spin"></div>
             <p className="font-black text-[10px] tracking-widest uppercase">جاري مزامنة قاعدة البيانات...</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 w-full max-w-[420px]">
          <button onClick={() => setShowRules(true)} className="p-4 bg-slate-900 rounded-xl text-slate-500 border border-white/5 active:scale-90 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
          <button onClick={handleLeaveRoom} className="flex-1 py-4 bg-rose-500/10 text-rose-500 rounded-xl font-black text-xs tracking-widest uppercase border border-rose-500/10 active:scale-95 transition-all">مغادرة / انسحاب</button>
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-8" onClick={() => setShowRules(false)}>
           <div className="glass w-full max-w-sm p-10 rounded-[2rem] text-right" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black mb-6 text-indigo-400 text-center tracking-tighter">📜 قوانين المحرك اللحظي</h2>
              <div className="text-slate-300 text-sm font-bold space-y-4">
                <p>💡 يتم مزامنة كل "أكلة" بشكل منفصل لضمان الشفافية بين اللاعبين.</p>
                <p>💡 في حال وجود قفزة متعددة، لا ينتقل الدور حتى يكمل اللاعب مساره بالكامل.</p>
                <p>💡 المحرك يفرض عليك الأكل إذا كان متاحاً، ويجبرك على اختيار أطول مسار ممكن.</p>
              </div>
              <button onClick={() => setShowRules(false)} className="w-full mt-10 py-4 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-xl">فهمت!</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
