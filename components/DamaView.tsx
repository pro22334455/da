
import React, { useState, useEffect, useCallback } from 'react';
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
  const [playerRole, setPlayerRole] = useState<1 | 2 | null>(null);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pendingJumpSequence, setPendingJumpSequence] = useState<number[][][] | null>(null);
  
  const [p1Time, setP1Time] = useState(0);
  const [p2Time, setP2Time] = useState(0);

  useEffect(() => {
    if (activeRoom) {
      setPlayerRole(activeRoom.creator.id === currentUser.id ? 1 : 2);
    }
  }, [activeRoom, currentUser.id]);

  const initBoard = () => {
    const newBoard: DamaBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 0) newBoard[r][c] = { player: 1, king: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 0) newBoard[r][c] = { player: 2, king: false };
      }
    }
    return newBoard;
  };

  // --- محرك اللعبة الاحترافي المستورد من الكود الخاص بك ---
  
  const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

  const getJumps = (currentBoard: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        // قطع عادية: تأكل للأمام وللخلف في بعض القوانين، لكننا سنلتزم بقانونك (اتجاه اللاعب)
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;

        const mr = row + dr; const mc = col + dc;
        const lr = row + dr * 2; const lc = col + dc * 2;

        if (inBounds(mr, mc) && inBounds(lr, lc)) {
          const mid = currentBoard[mr][mc];
          if (mid && mid.player !== piece.player && currentBoard[lr][lc] === null && !visited.has(`${mr},${mc}`)) {
            const newVisited = new Set(visited); newVisited.add(`${mr},${mc}`);
            const next = getJumps(currentBoard, piece, lr, lc, newVisited);
            if (next.length) next.forEach(seq => jumps.push([[lr, lc, mr, mc], ...seq]));
            else jumps.push([[lr, lc, mr, mc]]);
          }
        }
      } else {
        // الملك الطائر
        let step = 1;
        while (true) {
          const mr = row + dr * step; const mc = col + dc * step;
          const lr = row + dr * (step + 1); const lc = col + dc * (step + 1);
          if (!inBounds(mr, mc) || !inBounds(lr, lc)) break;
          const mid = currentBoard[mr][mc];
          if (!mid) { step++; continue; }
          if (mid.player === piece.player) break;
          if (visited.has(`${mr},${mc}`)) break;
          
          let landStep = step + 1;
          while (true) {
            const lr2 = row + dr * landStep; const lc2 = col + dc * landStep;
            if (!inBounds(lr2, lc2) || currentBoard[lr2][lc2]) break;
            const newVisited = new Set(visited); newVisited.add(`${mr},${mc}`);
            const next = getJumps(currentBoard, piece, lr2, lc2, newVisited);
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

  const getLongestJumps = (currentBoard: DamaBoard, player: 1 | 2) => {
    let max = 0;
    const moves: Record<string, number[][][]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece.player === player) {
          const jumps = getJumps(currentBoard, piece, r, c);
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

  // --- الربط مع Firebase ومزامنة الحركات ---

  useEffect(() => {
    if (!activeRoom || playerRole === null) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      if (playerRole === 1 && (!data.board || (Array.isArray(data.board) && (data.board[0]?.filter((p:any)=>p!==null).length || 0) > 4))) {
        update(gameRef, { board: initBoard(), turn: 1, status: data.opponent ? 'playing' : 'waiting' });
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
        } else if (max === 0) {
          setSelected([r, c]);
        }
      }
    } else {
      const [sr, sc] = selected;
      const pieceToMove = board[sr][sc];
      if (!pieceToMove) return;

      if (pendingJumpSequence && pendingJumpSequence.length > 0) {
        // محاولة تنفيذ قفزة
        const validJump = pendingJumpSequence.filter(seq => seq[0][0] === r && seq[0][1] === c);
        if (validJump.length > 0) {
          const newBoard = board.map(row => row.slice());
          const [targetR, targetC, midR, midC] = validJump[0][0];
          
          newBoard[midR][midC] = null;
          newBoard[sr][sc] = null;
          newBoard[targetR][targetC] = pieceToMove;

          const nextPending = validJump.map(seq => seq.slice(1)).filter(seq => seq.length > 0);
          
          if (nextPending.length > 0) {
            setBoard(newBoard);
            setSelected([targetR, targetC]);
            setPendingJumpSequence(nextPending);
          } else {
            // انتهت القفزات، ترقية الملك وتغيير الدور
            if ((pieceToMove.player === 1 && targetR === 7) || (pieceToMove.player === 2 && targetR === 0)) {
              pieceToMove.king = true;
            }
            update(ref(db, `rooms/${activeRoom?.id}`), { board: newBoard, turn: turn === 1 ? 2 : 1 });
            setSelected(null);
            setPendingJumpSequence(null);
          }
        } else {
          setSelected(null); setPendingJumpSequence(null);
        }
      } else {
        // حركة عادية (ليست قفزة)
        const dr = r - sr; const dc = c - sc;
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1 && !board[r][c]) {
          const canMove = pieceToMove.king || (pieceToMove.player === 1 && dr === 1) || (pieceToMove.player === 2 && dr === -1);
          if (canMove) {
            const newBoard = board.map(row => row.slice());
            newBoard[r][c] = pieceToMove;
            newBoard[sr][sc] = null;
            if ((pieceToMove.player === 1 && r === 7) || (pieceToMove.player === 2 && r === 0)) pieceToMove.king = true;
            update(ref(db, `rooms/${activeRoom?.id}`), { board: newBoard, turn: turn === 1 ? 2 : 1 });
            setSelected(null);
          } else setSelected(null);
        } else setSelected(null);
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
            <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">الخصم</span>
            <span className="text-xs font-black text-amber-500 font-mono">{formatTime(playerRole === 1 ? p2Time : p1Time)}</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${gameStarted ? (turn === playerRole ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-500/10 text-slate-500') : 'bg-rose-500/10 text-rose-500 animate-pulse'}`}>
          {gameStarted ? (turn === playerRole ? 'دورك الآن' : 'انتظر الخصم') : 'بانتظار المنافس'}
        </div>
        <div className="flex items-center gap-2 text-left">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">أنت</span>
            <span className="text-xs font-black text-indigo-400 font-mono">{formatTime(playerRole === 1 ? p1Time : p2Time)}</span>
          </div>
          <img src={currentUser.avatar || ''} className="w-9 h-9 rounded-lg bg-slate-800 border border-indigo-500/30" />
        </div>
      </div>

      {/* Professional Board Grid */}
      <div className="relative aspect-square w-full max-w-[420px] bg-[#2c1e14] p-1.5 rounded-[2rem] shadow-2xl border-[6px] border-[#1a120b]">
        {board ? (
          <div className="w-full h-full rounded-lg overflow-hidden grid grid-cols-8 grid-rows-8">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 !== 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              
              return (
                <div 
                  key={`${r}-${c}`} 
                  onClick={() => handleCellClick(r, c)}
                  className={`w-full h-full flex items-center justify-center relative cursor-pointer ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'ring-2 ring-inset ring-amber-400 z-10' : ''}`}
                >
                  {piece && (
                    <div className={`w-[85%] h-[85%] rounded-full shadow-lg transition-all duration-300 ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-800' : 'bg-gradient-to-br from-cyan-400 to-indigo-800'} ${isSelected ? 'scale-110' : ''}`}>
                      {piece.king && <div className="w-full h-full flex items-center justify-center text-amber-300 text-xs drop-shadow">★</div>}
                    </div>
                  )}
                  {/* تلميح للقفزة المطلوبة */}
                  {pendingJumpSequence?.some(seq => seq[0][0] === r && seq[0][1] === c) && (
                    <div className="absolute inset-0 bg-emerald-500/20 animate-pulse border-2 border-emerald-500/50 rounded-md"></div>
                  )}
                </div>
              );
            }))}

            {!gameStarted && (
               <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-[1.5rem]">
                  <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-[10px] font-black text-white tracking-widest uppercase">في انتظار الخصم للبدء...</p>
               </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900 rounded-lg">
             <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="font-black text-[10px] text-indigo-400 tracking-widest">تحميل الرقعة...</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 w-full max-w-[420px]">
          <button onClick={() => setShowRules(true)} className="p-4 bg-slate-900 rounded-xl text-slate-500 border border-white/5 active:scale-90 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
          <button onClick={handleLeaveRoom} className="flex-1 py-4 bg-rose-500/10 text-rose-500 rounded-xl font-black text-[10px] tracking-widest uppercase border border-rose-500/10 active:scale-95 transition-all">خروج / انسـحاب</button>
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-8" onClick={() => setShowRules(false)}>
           <div className="glass w-full max-w-xs p-8 rounded-[2rem] text-center" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black mb-4 text-indigo-400">📜 القوانين الحالية</h2>
              <div className="text-slate-400 text-xs font-bold space-y-3 text-right">
                <p>✅ قاعدة الأغلبية: يجب أن تختار الطريق الذي يأكل أكبر عدد من القطع.</p>
                <p>✅ الملك الطائر: الملك يتحرك ويأكل عبر أي مسافة قطرية.</p>
                <p>✅ القفز المتعدد: يتم إجبارك على إكمال سلسلة الأكل للنهاية.</p>
              </div>
              <button onClick={() => setShowRules(false)} className="w-full mt-8 py-4 bg-indigo-600 text-white rounded-xl font-black text-xs">موافق</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default DamaView;
