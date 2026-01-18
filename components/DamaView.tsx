import React, { useEffect, useMemo, useState, useRef } from 'react';
import { DamaBoard, DamaPiece, User, Room, ChatMessage } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, update, remove, set, push } from '../firebaseService';

/* =======================
   أدوات مساعدة أساسية
======================= */

const cloneBoard = (b: DamaBoard): DamaBoard =>
  b.map(row => row.map(cell => cell ? { ...cell } : null));

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

const directionsFor = (piece: DamaPiece): number[][] => {
  if (piece.king) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return piece.player === 1 ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]];
};

const getCaptures = (board: DamaBoard, r: number, c: number): number[][][] => {
  const piece = board[r][c];
  if (!piece) return [];
  const captures: number[][][] = [];
  const dirs = directionsFor(piece);
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc;
    const tr = r + dr * 2, tc = c + dc * 2;
    if (inBounds(tr, tc) && board[mr]?.[mc] && board[mr][mc]!.player !== piece.player && !board[tr][tc]) {
      captures.push([[mr, mc], [tr, tc]]);
    }
  }
  return captures;
};

const playerHasAnyCapture = (board: DamaBoard, player: 1 | 2): boolean => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.player === player && getCaptures(board, r, c).length > 0) return true;
    }
  }
  return false;
};

/* =======================
   Component
======================= */

interface Props {
  currentUser: User;
  onUpdatePoints: (p: number) => void;
}

const DamaView: React.FC<Props> = ({ currentUser, onUpdatePoints }) => {
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [board, setBoard] = useState<DamaBoard | null>(null);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<number[][][] | null>(null);

  const playerRole = useMemo(() => {
    if (!activeRoom) return null;
    return activeRoom.creator.id === currentUser.id ? 1 : 2;
  }, [activeRoom, currentUser.id]);

  useEffect(() => {
    if (!activeRoom) return;
    const roomRef = ref(db, `rooms/${activeRoom.id}`);
    const unsub = onValue(roomRef, snap => {
      const data = snap.val();
      if (!data) return;

      if (!data.board && playerRole === 1) {
        update(roomRef, { board: createInitialBoard(), turn: 1, status: 'waiting' });
        return;
      }

      if (data.board) setBoard(cloneBoard(data.board));
      if (data.turn) setTurn(data.turn);

      if (data.creator && data.opponent) {
        setOpponent(data.creator.id === currentUser.id ? data.opponent : data.creator);
        if (data.status === 'waiting') update(roomRef, { status: 'playing' });
        setGameStarted(data.status === 'playing');
      }

      if (data.status === 'closed') reset();
    });
    return () => unsub();
  }, [activeRoom, playerRole]);

  const save = (b: DamaBoard, t: 1 | 2) => {
    if (!activeRoom) return;
    update(ref(db, `rooms/${activeRoom.id}`), { board: cloneBoard(b), turn: t });
  };

  const handleClick = (r: number, c: number) => {
    if (!board || !playerRole || !gameStarted || turn !== playerRole) return;
    const cell = board[r][c];

    // Selecting a piece
    if (!selected) {
      if (cell && cell.player === playerRole) {
        const mustEat = playerHasAnyCapture(board, playerRole);
        const caps = getCaptures(board, r, c);
        if (!mustEat || caps.length > 0) {
          setSelected([r, c]);
          setPending(caps.length > 0 ? caps : null);
        }
      }
      return;
    }

    const [sr, sc] = selected;
    const piece = board[sr][sc];
    if (!piece) { setSelected(null); return; }

    const captures = getCaptures(board, sr, sc);
    const targetCapture = captures.find(([_, [tr, tc]]) => tr === r && tc === c);

    if (targetCapture) {
      const [[er, ec], [tr, tc]] = targetCapture;
      const nb = cloneBoard(board);
      nb[sr][sc] = null;
      nb[er][ec] = null;
      nb[tr][tc] = { ...piece };

      // Promotion
      if (!piece.king && ((piece.player === 1 && tr === 7) || (piece.player === 2 && tr === 0))) {
        nb[tr][tc]!.king = true;
      }

      const nextCaps = getCaptures(nb, tr, tc);
      if (nextCaps.length > 0) {
        setBoard(nb);
        setSelected([tr, tc]);
        setPending(nextCaps);
        update(ref(db, `rooms/${activeRoom!.id}`), { board: cloneBoard(nb) });
      } else {
        save(nb, turn === 1 ? 2 : 1);
        setSelected(null);
        setPending(null);
      }
      return;
    }

    // Normal movement (only if no captures available)
    if (!playerHasAnyCapture(board, playerRole)) {
      const dr = r - sr;
      const dc = c - sc;
      if (!cell && Math.abs(dr) === 1 && Math.abs(dc) === 1 && (piece.king || (piece.player === 1 && dr === 1) || (piece.player === 2 && dr === -1))) {
        const nb = cloneBoard(board);
        nb[sr][sc] = null;
        nb[r][c] = { ...piece };
        if (!piece.king && ((piece.player === 1 && r === 7) || (piece.player === 2 && r === 0))) {
          nb[r][c]!.king = true;
        }
        save(nb, turn === 1 ? 2 : 1);
      }
    }
    setSelected(null);
    setPending(null);
  };

  const reset = () => {
    setActiveRoom(null);
    setBoard(null);
    setOpponent(null);
    setGameStarted(false);
    setSelected(null);
    setPending(null);
  };

  if (!activeRoom) return <Lobby currentUser={currentUser} rooms={allRooms} onJoinRoom={setActiveRoom} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 bg-[#020617] p-4" dir="rtl">
      {/* Player Headers */}
      <div className="w-full max-w-[440px] glass p-4 rounded-[2rem] flex justify-between items-center border border-white/10 shadow-2xl">
        <div className="flex items-center gap-3">
          <img src={opponent?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=wait`} className="w-10 h-10 rounded-xl bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">المنافس</span>
            <span className="text-sm font-bold text-white truncate max-w-[80px]">{opponent?.username || 'انتظار...'}</span>
          </div>
        </div>
        
        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${turn === playerRole ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
          {turn === playerRole ? 'دورك الآن' : 'انتظر الخصم'}
        </div>

        <div className="flex items-center gap-3 text-left">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">أنت</span>
            <span className="text-sm font-bold text-indigo-400">{currentUser.username}</span>
          </div>
          <img src={currentUser.avatar || ''} className="w-10 h-10 rounded-xl bg-indigo-500/10" />
        </div>
      </div>

      {/* The Board */}
      <div className="relative w-full max-w-[400px] aspect-square bg-[#2c1e14] p-3 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] border-[6px] border-[#3e2723]">
        <div className="w-full h-full rounded-2xl overflow-hidden grid grid-cols-8 grid-rows-8 bg-[#1a0f08] shadow-2xl">
          {board?.map((row, r) => row.map((p, c) => {
            const isDark = (r + c) % 2 === 0;
            const isSelected = selected?.[0] === r && selected?.[1] === c;
            const isTarget = pending?.some(([_, [tr, tc]]) => tr === r && tc === c);
            return (
              <div 
                key={`${r}-${c}`} 
                onClick={() => handleClick(r, c)} 
                className={`w-full h-full flex items-center justify-center relative cursor-pointer transition-colors duration-200 ${isDark ? 'bg-[#3e2723]' : 'bg-[#d7ccc8]'} ${isSelected ? 'bg-indigo-900/40 ring-inset ring-4 ring-indigo-500/50' : ''}`}
              >
                {p && (
                  <div className={`w-[80%] h-[80%] rounded-full shadow-2xl transition-all duration-300 transform ${p.player === 1 ? 'bg-gradient-to-br from-rose-500 to-red-900' : 'bg-gradient-to-br from-cyan-400 to-indigo-900'} ${isSelected ? 'scale-110' : ''} ${turn === p.player && turn === playerRole ? 'hover:brightness-125' : ''}`}>
                    <div className="w-full h-full rounded-full border-t-2 border-white/20 flex items-center justify-center">
                       {p.king && <div className="text-amber-300 text-lg drop-shadow-lg">👑</div>}
                    </div>
                  </div>
                )}
                {isTarget && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-4 h-4 bg-emerald-500/40 rounded-full animate-ping"></div>
                    <div className="absolute inset-0 bg-emerald-500/10 border-2 border-emerald-500/30 m-1 rounded-lg"></div>
                  </div>
                )}
              </div>
            );
          }))}
          {!gameStarted && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-10">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
              <p className="text-white font-black tracking-widest uppercase text-sm animate-pulse">في انتظار انضمام الخصم...</p>
              <button 
                onClick={async () => { if(activeRoom) await remove(ref(db, `rooms/${activeRoom.id}`)); reset(); }}
                className="mt-8 px-6 py-2 bg-rose-500/20 text-rose-500 rounded-xl text-xs font-bold uppercase tracking-widest border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all"
              >
                إلغاء الغرفة
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex gap-4 w-full max-w-[400px]">
        <button 
          onClick={async () => { if(activeRoom) await update(ref(db, `rooms/${activeRoom.id}`), { status: 'closed' }); reset(); }} 
          className="flex-1 py-4 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[10px] tracking-widest uppercase border border-rose-500/20 active:scale-95 transition-all hover:bg-rose-500/20"
        >
          انسحاب من المباراة
        </button>
      </div>
    </div>
  );
};

export default DamaView;
