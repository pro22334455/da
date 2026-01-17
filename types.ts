
export interface User {
  id: string;
  username: string;
  points: number;
  avatar: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
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
  messages?: Record<string, ChatMessage>;
  voiceStatus?: Record<string, boolean>; // id -> isMuted
}

export interface DamaPiece {
  player: 1 | 2;
  king: boolean;
}

export type DamaBoard = (DamaPiece | null)[][];
