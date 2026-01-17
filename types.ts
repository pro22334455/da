export interface User {
  id: string;
  username: string;
  points: number;
  avatar: string | null;
}

export interface ChatMessage {
  sender: string;
  text: string;
  time: number;
}

export interface VoiceActivity {
  p1?: boolean;
  p2?: boolean;
}

export interface Room {
  id: string;
  creator: User;
  timeLimit: number;
  createdAt: number;
  status: 'waiting' | 'playing' | 'closed';
  opponent?: User;
  board?: DamaBoard;
  turn?: 1 | 2;
  p1Time?: number;
  p2Time?: number;
  chat?: Record<string, ChatMessage>;
  voiceActivity?: VoiceActivity;
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
