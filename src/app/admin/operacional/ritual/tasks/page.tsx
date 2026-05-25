import { RitualTasksClient } from "@/components/ritual/ritual-tasks"

export const metadata = {
  title: "Tasks Geradas · Ritual de Sexta · Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default async function RitualTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams
  return <RitualTasksClient sessionId={session} />
}
