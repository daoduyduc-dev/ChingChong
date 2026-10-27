import type { Move, Position, Side } from "./chess";
export type Actor = {
  id: string;
  sessionId: string;
  guest: boolean;
  name: string;
  role: string;
  avatar?: string;
};
export type RoomState = {
  serverTime?: number;
  id: string;
  code: string;
  owner: string;
  visibility: "public" | "private";
  status: "WAITING" | "COUNTDOWN" | "IN_MATCH" | "POST_MATCH" | "CLOSED";
  minutes: number;
  ownerSide: Side | "random";
  undo: boolean;
  version: number;
  seats: { id: string; name: string; ready: boolean }[];
  startAt?: number;
  ownerDeadline?: number;
  matchId?: string;
};
export type RequestKind = "SAVE" | "RESUME" | "DRAW" | "UNDO" | "VIDEO";
export type MatchRequest = {
  id: string;
  kind: RequestKind;
  sender: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELED";
  version: number;
  expiresAt: number;
};
export type MatchState = {
  serverTime?: number;
  chatVersion?: number;
  videoSessionId?: string;
  createdAt?: string;
  id: string;
  roomId: string;
  red: string;
  black: string;
  names: Record<Side, string>;
  publicCodes?: Record<Side, string>;
  guests: boolean;
  status:
    | "ACTIVE"
    | "PAUSED_RECONNECT"
    | "SAVED"
    | "RESUMING"
    | "FINISHED"
    | "CANCELED";
  version: number;
  position: Position;
  minutes: number;
  remaining: Record<Side, number | null>;
  lastTick: number;
  undo: boolean;
  log: {
    id: string;
    move: Move;
    before: Position;
    clocks: Record<Side, number | null>;
  }[];
  requests: MatchRequest[];
  ready: string[];
  windows: Record<
    string,
    { at: number; deadline: number; used: number; online: boolean }
  >;
  result?: { winner: Side | null; reason: string };
  video: boolean;
  messages: {
    id: string;
    sender: string;
    name: string;
    text: string;
    at: number;
  }[];
  receipts: Record<string, string>;
};
