"use client"

import Link from "next/link"
import useSWR from "swr"
import { ExternalLink } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  storeId: string
}

export function WeeklyReportLink({ storeId }: Props) {
  const { data } = useSWR<{ pending?: number; data?: { pending: number } }>(
    `/api/stores/${storeId}/weekly-report/pending-count`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )
  const pending = data?.pending ?? data?.data?.pending ?? 0

  return (
    <Link
      href={`/admin/stores/${storeId}/weekly-report`}
      className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700"
    >
      📊 Feedback semanal
      {pending > 0 && (
        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white bg-red-500 tabular-nums">
          {pending}
        </span>
      )}
      <ExternalLink className="w-3 h-3" />
    </Link>
  )
}
