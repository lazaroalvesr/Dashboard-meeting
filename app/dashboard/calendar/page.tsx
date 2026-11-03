import { Dashboard } from "@/features/rooms/components/dashboard";

export default async function CalendarRoute({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date } = await searchParams;
  return <Dashboard section="calendar" calendarDate={typeof date === "string" ? date : undefined} />;
}
