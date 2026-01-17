import { useEffect, useState } from "react";
import { db, ref, set, onValue } from "./firebaseService";

type Piece = {
  player: 1 | 2;
  king: boolean;
};

type Cell = Piece | null;
type Board = Cell[][];

const createInitialBoard = (): Board => {
  const board: Board = Array.from({ length: 8 }, () =>
    Array(8).fill(null)
  );
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) {
        if (r < 3) board[r][c] = { player: 1, king: false };
        if (r > 4) board[r][c] = { player: 2, king: false };
      }
    }
  }
  return board;
};

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

/* =========================
   🔥 GAME LOGIC
========================= */
const getJumps = (
  board: Board,
  piece: Piece,
  row: number,
  col: number,
  visited = new Set<string>()
): number[][][] => {
  const jumps: number[][][] = [];
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const [dr, dc] of dirs) {
    if (!piece.king) {
      if (piece.player === 1 && dr === -1) continue;
      if (piece.player === 2 && dr === 1) continue;

      const mr = row + dr;
      const mc = col + dc;
      const lr = row + dr * 2;
      const lc = col + dc * 2;

      if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;

      const mid = board[mr][mc];
      if (
        mid &&
        mid.player !== piece.player &&
        board[lr][lc] === null &&
        !visited.has(`${mr},${mc}`)
      ) {
        const newVisited = new Set(visited);
        newVisited.add(`${mr},${mc}`);

        const next = getJumps(board, piece, lr, lc, newVisited);
        if (next.length) {
          next.forEach(seq => jumps.push([[lr, lc, mr, mc], ...seq]));
        } else {
          jumps.push([[lr, lc, mr, mc]]);
        }
      }
    } else {
      let step = 1;
      while (true) {
        const mr = row + dr * step;
        const mc = col + dc * step;
        const lr = row + dr * (step + 1);
        const lc = col + dc * (step + 1);
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) break;

        const mid = board[mr][mc];
        if (!mid) {
          step++;
          continue;
        }
        if (mid.player === piece.player) break;
        if (visited.has(`${mr},${mc}`)) break;

        let landStep = step + 1;
        while (true) {
          const lr2 = row + dr * landStep;
          const lc2 = col + dc * landStep;
          if (!inBounds(lr2, lc2)) break;
          if (board[lr2][lc2]) break;

          const newVisited = new Set(visited);
          newVisited.add(`${mr},${mc}`);

          const next = getJumps(board, piece, lr2, lc2, newVisited);
          if (next.length) {
            next.forEach(seq => jumps.push([[lr2, lc2, mr, mc], ...seq]));
          } else {
            jumps.push([[lr2, lc2, mr, mc]]);
          }
          landStep++;
        }
        break;
      }
    }
  }
  return jumps;
};

const getLongestJumps = (board: Board, player: 1 | 2) => {
  let max = 0;
  const moves: Record<string, number[][][]> = {};

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

/* =========================
   🎮 COMPONENT
========================= */
export default function DamaView() {
  const [board, setBoard] = useState<Board>(createInitialBoard());
  const [turn, setTurn] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<number[][][] | null>(null);

  // Firebase path
  const gameRef = ref(db, "dama/room1");

  // 👇 تحميل اللعبة من Firebase
  useEffect(() => {
    const unsubscribe = onValue(gameRef, snapshot => {
      const val = snapshot.val();
      if (val?.board && val?.turn) {
        // فرض القطع بالقوة
        setBoard(val.board);
        setTurn(val.turn);
      }
    });
    return () => unsubscribe();
  }, []);

  // 👇 حفظ أي حركة تلقائياً
  const saveToFirebase = (newBoard: Board, newTurn: 1 | 2) => {
    set(gameRef, { board: newBoard, turn: newTurn });
  };

  /* =========================
     🟢 HANDLE CLICK
  ========================= */
  const handleClick = (r: number, c: number) => {
    const cell = board[r][c];
    const { max, moves } = getLongestJumps(board, turn);

    if (!selected) {
      if (cell && cell.player === turn) {
        if (max > 0 && moves[`${r},${c}`]) {
          setSelected([r, c]);
          setPending([...moves[`${r},${c}`]]);
        } else if (max === 0) {
          setSelected([r, c]);
          setPending(null);
        }
      }
      return;
    }

    if (!cell && selected) {
      const [sr, sc] = selected;
      const piece = board[sr][sc];
      if (!piece) return;

      // تحقق من أطول سلسلة
      if (pending?.length) {
        const seq = pending.find(s => s[0][0] === r && s[0][1] === c);
        if (seq) {
          const [[lr, lc, mr, mc], ...rest] = seq;
          const newBoard = board.map(row => row.slice());
          newBoard[mr][mc] = null;
          newBoard[lr][lc] = piece;
          newBoard[sr][sc] = null;
          if ((piece.player === 1 && lr === 7) || (piece.player === 2 && lr === 0)) {
            piece.king = true;
          }
          setBoard(newBoard);
          setSelected([lr, lc]);
          setPending(rest.length ? [rest] : null);
          saveToFirebase(newBoard, turn); // حفظ
          if (!rest.length) {
            setSelected(null);
            setTurn(turn === 1 ? 2 : 1);
            saveToFirebase(newBoard, turn === 1 ? 2 : 1);
          }
        }
        return;
      }

      // حركة بسيطة
      const dr = r - sr;
      const dc = c - sc;
      if (
        piece.king ||
        (piece.player === 1 && dr === 1 && Math.abs(dc) === 1) ||
        (piece.player === 2 && dr === -1 && Math.abs(dc) === 1)
      ) {
        const newBoard = board.map(row => row.slice());
        newBoard[r][c] = piece;
        newBoard[sr][sc] = null;
        if ((piece.player === 1 && r === 7) || (piece.player === 2 && r === 0)) {
          piece.king = true;
        }
        setBoard(newBoard);
        setSelected(null);
        const nextTurn = turn === 1 ? 2 : 1;
        setTurn(nextTurn);
        saveToFirebase(newBoard, nextTurn); // حفظ
      }
    }
  };

  return (
    <div>
      <h2>Turn: Player {turn}</h2>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "repeat(8, 50px)",
          gridTemplateColumns: "repeat(8, 50px)",
          border: "2px solid black",
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r},${c}`}
              onClick={() => handleClick(r, c)}
              style={{
                width: 50,
                height: 50,
                backgroundColor: (r + c) % 2 === 0 ? "#B58863" : "#F0D9B5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border:
                  selected && selected[0] === r && selected[1] === c
                    ? "2px solid yellow"
                    : "1px solid black",
              }}
            >
              {cell && (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    backgroundColor: cell.player === 1 ? "red" : "blue",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "gold",
                    fontWeight: "bold",
                  }}
                >
                  {cell.king ? "K" : ""}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
