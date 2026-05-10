import { WeeklyReportView } from "@/components/stores/weekly-report-view"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string }>
}

export default async function StoreWeeklyReportPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params
  const { week } = await searchParams
  return <WeeklyReportView storeId={id} initialWeek={week} />
}
