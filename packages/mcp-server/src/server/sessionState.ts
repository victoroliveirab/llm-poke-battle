import type { RoomMembership } from './rooms';

export type SessionState = {
  joinedRooms: Map<string, RoomMembership>;
};

export function createSessionState(): SessionState {
  return {
    joinedRooms: new Map<string, RoomMembership>(),
  };
}
