export type ParticipantRole = "HOST" | "GUEST";

export type Participant = {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
};

export type JoinRoomRequest = {
  displayName: string;
};
