// DamaView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, set, update, remove } from '../firebaseService';

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

  // ===== محرك اللعبة =====
  const getJumps = (board: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const mr = row + dr, mc = col + dc;
        const lr = row + dr * 2, lc = col + dc * 2;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = board[mr][mc];
        if (mid && mid.player !== piece.player && !board[lr][lc] && !visited.has(`${mr},${mc}`)) {
          const newVisited = new Set(visited);
          newVisited.add(`${mr},${mc}`);
          const next = getJumps(board, piece, lr, lc, newVisited);
          if (next.length) next.forEach(seq => jumps.push([[lr, lc, mr, mc], ...seq]));
          else jumps.push([[lr, lc, mr, mc]]);
        }
      } else {
        let step = 1;
        while (true) {
          const mr = row + dr * step, mc = col + dc * step;
          const lr = row + dr * (step + 1), lc = col + dc * (step + 1);
          if (!inBounds(mr, mc) || !inBounds(lr, lc)) break;
          const mid = board[mr][mc];
          if (!mid) { step++; continue; }
          if (mid.player === piece.player) break;
          if (visited.has(`${mr},${mc}`)) break;
          let landStep = step + 1;
          while (true) {
            const lr2 = row + dr * landStep, lc2 = col + dc * landStep;
            if (!inBounds(lr2, lc2) || board[lr2][lc2]) break;
            const newVisited = new Set(visited); newVisited.add(`${mr},${mc}`);
            const next = getJumps(board, piece, lr2, lc2, newVisited);
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

  const getLongestJumps = (board: DamaBoard, player: 1 | 2) => {
    let max = 0; const moves: Record<string, number[][][]> = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.player === player) {
          const jumps = getJumps(board, piece, r, c);
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

  // ===== مزامنة Firebase =====
  useEffect(() => {
    if (!activeRoom) return;
    const gameRef = ref(db, `rooms/${activeRoom.id}`);

    const unsub = onValue(gameRef, (snapshot) => {
      let data = snapshot.val();

      // إذا الغرفة جديدة أو board غير موجود
      if (!data || !data.board) {
        const initialBoard = createInitialBoard();
        const initialData = {
          board: initialBoard,
          turn: 1,
          status: 'waiting',
          creator: activeRoom.creator,
          opponent: activeRoom.opponent || null,
        };
        set(gameRef, initialData); // فرض ظهور الرقعة بالقوة
        data = initialData;
      }

      setBoard(data.board);
      setTurn(data.turn || 1);
      setOpponent(data.opponent?.id === currentUser.id ? data.creator : data.opponent || null);
      setGameStarted(data.status === 'playing');
    });

    return () => unsub();
  }, [activeRoom]);

  const saveToFirebase = (nb: DamaBoard, nt: 1 | 2) => {
    if (!activeRoom) return;
    update(ref(db, `rooms/${activeRoom.id}`), { board: nb, turn: nt });
  };

  // ===== التعامل مع النقر على الخانات =====
  const handleClick = (r: number, c: number) => {
    if (!board || turn !== playerRole || !gameStarted) return;

    const cell = board[r][c];
    const { max, moves } = getLongestJumps(board, turn);

    if (!selected) {
      if (cell && cell.player === turn) {
        if (max > 0 && moves[`${r},${c}`]) {
          setSelected([r, c]);
          setPending(moves[`${r},${c}`].map(s => [...s]));
        } else if (max === 0) setSelected([r, c]);
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
            saveToFirebase(newBoard, turn);
          } else {
            const nextTurn = turn === 1 ? 2 : 1;
            saveToFirebase(newBoard, nextTurn);
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
            saveToFirebase(newBoard, turn === 1 ? 2 : 1);
          }
        }
        setSelected(null);
      }
    }
  };

  const resetState = () => {
    setActiveRoom(null); setGameStarted(false); setOpponent(null); setBoard(null); setSelected(null); setPending(null);
  };

  if (!activeRoom) return <Lobby currentUser={currentUser} onJoinRoom={setActiveRoom} rooms={allRooms} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col h-full bg-[#020617] items-center justify-center p-4 gap-4" dir="rtl">
      {/* HUD */}
      <div className="w-full max-w-[440px] glass p-4 rounded-[1.5rem] flex justify-between items-center border border-white/5 shadow-2xl">
        {/* ... هنا تبقى الـ HUD كما في الكود السابق ... */}
      </div>

      {/* الرقعة */}
      <div className="relative w-full max-w-[420px] aspect-square bg-[#1a120b] p-1.5 rounded-[2rem] shadow-[0_0_60px_rgba(0,0,0,0.6)] border-[6px] border-[#2c1e14]">
        {board ? (
          <div className="w-full h-full rounded-xl overflow-hidden grid grid-cols-8 grid-rows-8 bg-[#3e2723]">
            {board.map((row, r) => row.map((piece, c) => {
              const isDark = (r + c) % 2 === 0;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isTarget = pending?.some(s => s[0][0] === r && s[0][1] === c);

              return (
                <div key={`${r}-${c}`} onClick={() => handleClick(r, c)}
                     className={`w-full h-full flex items-center justify-center relative cursor-pointer transition-colors ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'bg-amber-400/20' : ''}`}>
                  {piece && (
                    <div className={`w-[80%] h-[80%] rounded-full ${piece.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110 ring-4 ring-amber-400 ring-offset-2 ring-offset-[#3e2723]' : 'hover:scale-105'}`}>
                      {piece.king && <div className="w-full h-full flex items-center justify-center">👑</div>}
                    </div>
                  )}
                  {isTarget && <div className="absolute inset-0 bg-emerald-500/30 animate-pulse border-2 border-emerald-400 m-1 rounded-lg"></div>}
                </div>
              );
            }))}
          </div>
        ) : <div className="w-full h-full flex items-center justify-center text-white">جاري التحميل...</div>}
      </div>

      {/* Footer */}
      <div className="flex gap-3 w-full max-w-[420px]">
        <button onClick={async () => {
          if (activeRoom) {
            if (playerRole === 1 && !gameStarted) await remove(ref(db, `rooms/${activeRoom.id}`));
            else await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' });
          }
          resetState();
        }} className="flex-1 py-5 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[11px] tracking-widest uppercase border border-rose-500/10">مغـادرة المباراة</button>
      </div>
    </div>
  );
};

export default DamaView;
