export type RoomStatus = "WAITING" | "ACTIVE" | "CLOSED";

export type Room = {
  id: string;
  slug: string;
  title: string;
  projectUrl: string | null;
  status: RoomStatus;
  scrollLocked: boolean;
  presentationActive: boolean;
  createdAt: string;
};

export type PublicRoom = Pick<Room, "slug" | "title" | "projectUrl" | "status" | "scrollLocked" | "presentationActive">;

export type CreateRoomRequest = {
  title: string;
  projectUrl: string;
};
