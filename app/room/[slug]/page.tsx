import { RoomLobby } from "@/features/participants/components/room-lobby";

type RoomPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    mode?: string;
  }>;
};

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const [{ slug }, { mode }] = await Promise.all([params, searchParams]);

  return <RoomLobby slug={slug} isHostRequested={mode === "host"} />;
}
