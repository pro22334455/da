import React, { useState, useEffect, useMemo } from 'react';
import { DamaBoard, DamaPiece, User, Room } from '../types';
import Lobby from './Lobby';
import { db, ref, onValue, set, update, remove, onDisconnect } from '../firebaseService';

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

  // ==== محرك اللعبة مع أطول سلسلة وحركة الملك ====
  const getJumps = (board: DamaBoard, piece: DamaPiece, row: number, col: number, visited = new Set<string>()): number[][][] => {
    const jumps: number[][][] = [];
    const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      if (!piece.king) {
        if (piece.player === 1 && dr === -1) continue;
        if (piece.player === 2 && dr === 1) continue;
        const mr = row + dr, mc = col + dc;
        const lr = row + 2*dr, lc = col + 2*dc;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = board[mr][mc];
        if (mid && mid.player !== piece.player && !board[lr][lc] && !visited.has(`${mr},${mc}`)) {
          const newVisited = new Set(visited);
          newVisited.add(`${mr},${mc}`);
          const next = getJumps(board, piece, lr, lc, newVisited);
          if (next.length) next.forEach(seq => jumps.push([[lr,lc,mr,mc], ...seq]));
          else jumps.push([[lr,lc,mr,mc]]);
        }
      } else {
        let step = 1;
        while (true) {
          const mr = row + dr*step, mc = col + dc*step;
          const lr = row + dr*(step+1), lc = col + dc*(step+1);
          if (!inBounds(mr,mc) || !inBounds(lr,lc)) break;
          const mid = board[mr][mc];
          if (!mid) { step++; continue; }
          if (mid.player === piece.player) break;
          if (visited.has(`${mr},${mc}`)) break;
          let landStep = step+1;
          while(true){
            const lr2=row+dr*landStep, lc2=col+dc*landStep;
            if(!inBounds(lr2,lc2) || board[lr2][lc2]) break;
            const newVisited=new Set(visited); newVisited.add(`${mr},${mc}`);
            const next=getJumps(board,piece,lr2,lc2,newVisited);
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

  const getLongestJumps = (board: DamaBoard, player: 1|2) => {
    let max=0; const moves: Record<string,number[][][]>={};
    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const piece=board[r][c];
        if(piece && piece.player===player){
          const jumps=getJumps(board,piece,r,c);
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

  // ==== Firebase Sync ====
  useEffect(()=>{
    if(!activeRoom) return;
    const gameRef=ref(db,`rooms/${activeRoom.id}`);
    const unsub=onValue(gameRef,snapshot=>{
      const data=snapshot.val();
      if(!data) return;

      // فرض ظهور الرقعة والقطع بالقوة
      setBoard(data.board || createInitialBoard());
      setTurn(data.turn || 1);
      if(data.opponent){
        setOpponent(data.opponent.id===currentUser.id?data.creator:data.opponent);
        setGameStarted(data.status==='playing');
      }

      if(!data.board && playerRole===1){
        update(gameRef,{ board:createInitialBoard(), turn:1 });
      }

      if(data.status==='closed') resetState();
    });

    return ()=>unsub();
  },[activeRoom,playerRole]);

  const saveToFirebase=(nb:DamaBoard,nt:1|2)=>{
    if(!activeRoom) return;
    update(ref(db,`rooms/${activeRoom.id}`),{ board:nb, turn:nt });
  };

  const handleClick=(r:number,c:number)=>{
    if(!board || turn!==playerRole || !gameStarted) return;
    const cell=board[r][c];
    const { max, moves }=getLongestJumps(board,turn);

    if(!selected){
      if(cell && cell.player===turn){
        if(max>0 && moves[`${r},${c}`]){
          setSelected([r,c]);
          setPending(moves[`${r},${c}`].map(s=>[...s]));
        } else if(max===0){
          setSelected([r,c]);
        }
      }
    } else {
      const [sr,sc]=selected;
      const piece=board[sr][sc];
      if(!piece) return;

      if(pending?.length){
        const seq=pending.find(s=>s[0][0]===r && s[0][1]===c);
        if(seq){
          const [[lr,lc,mr,mc], ...rest]=seq;
          const newBoard=board.map(row=>row.slice());
          newBoard[mr][mc]=null; newBoard[sr][sc]=null; newBoard[lr][lc]=piece;
          if((piece.player===1 && lr===7) || (piece.player===2 && lr===0)) piece.king=true;
          if(rest.length>0){
            setBoard(newBoard);
            setSelected([lr,lc]);
            setPending([rest]);
            saveToFirebase(newBoard,turn);
          } else {
            const nextTurn=turn===1?2:1;
            saveToFirebase(newBoard,nextTurn);
            setSelected(null); setPending(null);
          }
        } else setSelected(null);
      } else {
        const dr=r-sr, dc=c-sc;
        if(!cell && Math.abs(dr)===1 && Math.abs(dc)===1){
          const can=piece.king || (piece.player===1 && dr===1) || (piece.player===2 && dr===-1);
          if(can){
            const newBoard=board.map(row=>row.slice());
            newBoard[r][c]=piece; newBoard[sr][sc]=null;
            if((piece.player===1 && r===7) || (piece.player===2 && r===0)) piece.king=true;
            saveToFirebase(newBoard, turn===1?2:1);
          }
        }
        setSelected(null);
      }
    }
  };

  const resetState=()=>{
    setActiveRoom(null); setGameStarted(false); setOpponent(null); setBoard(null);
    setSelected(null); setPending(null);
  };

  if(!activeRoom) return <Lobby currentUser={currentUser} onJoinRoom={setActiveRoom} rooms={allRooms} onRoomsUpdate={setAllRooms} />;

  return (
    <div className="flex flex-col h-full items-center justify-center p-4 gap-4" dir="rtl">
      {/* هنا يظل التصميم كما هو Tailwind... */}
      {/* عرض الرقعة والقطع */}
    </div>
  );
};

export default DamaView;
