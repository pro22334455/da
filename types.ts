
export enum ViewType {
  CHAT = 'CHAT',
  IMAGE = 'IMAGE',
  VOICE = 'VOICE',
  DAMA = 'DAMA'
}

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

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
  sender?: string;
  timestamp: Date;
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

// Added GeneratedImage interface to fix the import error in ImageGenView.tsx
export interface GeneratedImage {
  url: string;
  prompt: string;
  timestamp: Date;
}

// Added VoiceHistoryItem interface to fix the import error in VoiceView.tsx
export interface VoiceHistoryItem {
  text: string;
  voiceName: string;
  timestamp: Date;
}
