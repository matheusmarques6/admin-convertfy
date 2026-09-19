import { redirect } from "next/navigation"

// /meetings/new is no longer needed — the MeetingDialog is now
// integrated directly in the /meetings page via the "Agendar Reunião" button.
// Redirect any old links here.
export default function NewMeetingPage() {
  redirect("/admin/meetings")
}
