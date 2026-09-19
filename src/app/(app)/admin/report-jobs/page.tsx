import { redirect } from "next/navigation"

// Redirect to unified reports page with jobs tab
export default function ReportJobsPage() {
  redirect("/admin/reports?tab=jobs")
}
