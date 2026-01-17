
import React, { useState, useEffect, useMemo } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, update, remove } from '../firebaseService';

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
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pendingJumpSequence, setPendingJumpSequence] = useState<number[][][] | null>(null);
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  // تحديد الدور مباشرة من خلال الغرفة النشطة
  const playerRole = useMemo(() => {
    if (!activeRoom) return null;
    return activeRoom.creator.id === currentUser.id ? 1 : 2;
  }, [activeRoom, currentUser.id]);

  const initBoard = () => {
    const newBoard: DamaBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 0) { // المربعات الغامقة
          if (r < 3) newBoard[r][c] = { player: 1, king: false };
          if (r > 4) newBoard[r][c] = { player: 2, king: false };
        }
      }
    }
    return newBoard;
  };

  // --- منطق المحرك الاحترافي الخاص بك (مع تعديلات طفيفة للتوافق) ---
  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getJumps = (b: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const mr = row + dr, mc = col + dc, lr = row + dr * 2, lc = col + dc * 2;
        if (inBounds(mr, mc) && inBounds(lr, lc)) {
          const mid = b[mr][mc];
          if (mid && mid.player !== piece.player && b[lr][lc] === null && !visited.has(`${mr},${mc}`)) {
            const newVisited = new Set(visited); newVisited.add(`${mr},${mc}`);
            const next = getJumps(b, piece, lr, lc, newVisited);
            if (next.length) next.forEach(seq => jumps.push([[lr, lc, mr, mc], ...seq]));
            else jumps.push([[lr, lc, mr, mc]]);
          }
        }
      } else {
        let step = 1;
        while (true) {
          const mr = row + dr * step, mc = col + dc * step, lr = row + dr * (step + 1), lc = col + dc * (step + 1);
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
    let max = 0;
    const moves: Record<string, number[][][]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p && p.player === player) {
          const jumps = getJumps(b, p, r, c);
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

  // --- Firebase Sync ---
  useEffect(() => {
    if (!activeRoom || !playerRole) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      // إصلاح مشكلة التعليق: إذا كنت المنشئ واللوحة غير موجودة، قم بإنشائها فوراً
      if (playerRole === 1 && !data.board) {
        update(gameRef, { 
          board: initBoard(), 
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
  }, [activeRoom, playerRole, currentUser.id]);

  const handleCellClick = (r: number, c: number) => {
    if (!board || turn !== playerRole || !gameStarted) return;
    const piece = board[r][c];
    const { max, moves } = getLongestJumps(board, turn);

    if (!selected) {
      if (piece && piece.player === turn) {
        if (max > 0 && moves[`${r},${c}`]) {
          setSelected([r, c]);
          setPendingJumpSequence(moves[`${r},${c}`]);
        } else if (max === 0) setSelected([r, c]);
      }
    } else {
      const [sr, sc] = selected;
      const pieceToMove = board[sr][sc];
      if (!pieceToMove) return;

      if (pendingJumpSequence) {
        const valid = pendingJumpSequence.filter(seq => seq[0][0] === r && seq[0][1] === c);
        if (valid.length > 0) {
          const nb = board.map(row => row.slice());
          const [tr, tc, mr, mc] = valid[0][0];
          nb[mr][mc] = null; nb[sr][sc] = null; nb[tr][tc] = pieceToMove;
          const next = valid.map(s => s.slice(1)).filter(s => s.length > 0);
          if (next.length > 0) {
            setBoard(nb); setSelected([tr, tc]); setPendingJumpSequence(next);
          } else {
            if ((pieceToMove.player === 1 && tr === 7) || (pieceToMove.player === 2 && tr === 0)) pieceToMove.king = true;
            update(ref(db, `rooms/${activeRoom?.id}`), { board: nb, turn: turn === 1 ? 2 : 1 });
            setSelected(null); setPendingJumpSequence(null);
          }
        } else { setSelected(null); setPendingJumpSequence(null); }
      } else {
        const dr = r - sr, dc = c - sc;
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1 && !board[r][c]) {
          const can = pieceToMove.king || (pieceToMove.player === 1 && dr === 1) || (pieceToMove.player === 2 && dr === -1);
          if (can) {
            const nb = board.map(row => row.slice());
            nb[r][c] = pieceToMove; nb[sr][sc] = null;
            if ((pieceToMove.player === 1 && r === 7) || (pieceToMove.player === 2 && r === 0)) pieceToMove.king = true;
            update(ref(db, `rooms/${activeRoom?.id}`), { board: nb, turn: turn === 1 ? 2 : 1 });
          }
        }
        setSelected(null);
      }
    }
  };

  const resetState = () => { setActiveRoom(null); setGameStarted(false); setOpponent(null); setBoard(null); };
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
      {/* Top Bar */}
      <div className="w-full max-w-[440px] glass p-4 rounded-[1.8rem] flex justify-between items-center border border-white/5 shadow-xl">
        <div className="flex items-center gap-2">
          <img src={opponent?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=wait`} className="w-9 h-9 rounded-lg bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">المنافس</span>
            <span className="text-xs font-black text-amber-500 font-mono">{formatTime(playerRole === 1 ? p2Time : p1Time)}</span>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${gameStarted ? (turn === playerRole ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500') : 'bg-rose-500/20 text-rose-500 animate-pulse'}`}>
          {gameStarted ? (turn === playerRole ? 'دورك الآن' : 'انتظر') : 'في الانتظار'}
        </div>
        <div className="flex items-center gap-2 text-left">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">أنت</span>
            <span className="text-xs font-black text-indigo-400 font-mono">{formatTime(playerRole === 1 ? p1Time : p2Time)}</span>
          </div>
          <img src={currentUser.avatar || ''} className="w-9 h-9 rounded-lg bg-slate-800 border border-indigo-500/30" />
        </div>
      </div>

      {/* Board Fix: Aspect Ratio + Explicit Fr Units */}
      <div className="relative w-full max-w-[420px] aspect-square bg-[#1a120b] p-1.5 rounded-[2rem] shadow-2xl border-[6px] border-[#2c1e14]">
        {board ? (
          <div className="w-full h-full rounded-lg overflow-hidden grid grid-cols-8 grid-rows-8 bg-[#3e2723]">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 !== 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const canJumpTo = pendingJumpSequence?.some(s => s[0][0] === r && s[0][1] === c);

              return (
                <div 
                  key={`${r}-${c}`} 
                  onClick={() => handleCellClick(r, c)}
                  className={`w-full h-full flex items-center justify-center relative transition-colors ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'ring-4 ring-inset ring-amber-400 z-10' : ''}`}
                >
                  {piece && (
                    <div className={`w-[85%] h-[85%] rounded-full piece-shadow transition-transform duration-300 ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110 shadow-indigo-500/50' : ''}`}>
                      {piece.king && <div className="w-full h-full flex items-center justify-center text-amber-300 text-sm">★</div>}
                    </div>
                  )}
                  {canJumpTo && <div className="absolute inset-0 bg-emerald-500/30 animate-pulse border-2 border-emerald-400 m-1 rounded-md"></div>}
                </div>
              );
            }))}

            {!gameStarted && (
               <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-[4px] flex flex-col items-center justify-center rounded-[1.5rem]">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-xs font-black text-white tracking-[0.3em] uppercase">بانتظار المنافس للبدء...</p>
               </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900 rounded-[1.5rem]">
             <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="font-black text-[10px] text-indigo-400 tracking-[0.4em]">INITIALIZING BOARD...</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 w-full max-w-[420px]">
          <button onClick={() => setShowRules(true)} className="p-4 bg-slate-900 rounded-2xl text-slate-500 border border-white/5 active:scale-90 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
          <button onClick={handleLeaveRoom} className="flex-1 py-4 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-xs tracking-widest uppercase border border-rose-500/10 active:scale-95 transition-all">خروج / انسـحاب</button>
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/98 z-[100] flex items-center justify-center p-8" onClick={() => setShowRules(false)}>
           <div className="glass w-full max-w-sm p-10 rounded-[3rem] text-right" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black mb-6 text-indigo-400 text-center">📜 قوانين المحرك الجديد</h2>
              <div className="text-slate-300 text-sm font-bold space-y-4">
                <p>💡 <span className="text-white">قوة الأكل:</span> إذا كان لديك خيار للأكل، يجب أن تختار المسار الذي يأكل أكبر عدد من القطع.</p>
                <p>💡 <span className="text-white">الملك:</span> يتحرك ويأكل في جميع الاتجاهات القطرية وبأي مسافة.</p>
                <p>💡 <span className="text-white">التكدس:</span> تم استخدام نظام Grid مرن يضمن ظهور الرقعة بشكل سليم على جميع الشاشات.</p>
              </div>
              <button onClick={() => setShowRules(false)} className="w-full mt-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-2xl shadow-indigo-600/30">فهمت، لنبدأ!</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
