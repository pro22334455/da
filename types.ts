export interface User {
  id: string;
  username: string;
  points: number;
  avatar: string | null;
}

export interface Room {
  id: string;
  creator: User;
  timeLimit: number; // in minutes
  createdAt: number;
  status: 'waiting' | 'playing';
  opponent?: User;
}

export interface DamaPiece {
  player: 1 | 2;
  king: boolean;
}

export type DamaBoard = (DamaPiece | null)[][];

export interface GameState {
  board: DamaBoard;
  turn: 1 | 2;
  player1: User;
  player2?: User;
  timeLimit: number;
  p1Time: number;
  p2Time: number;
}
