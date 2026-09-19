import { redirect } from "next/navigation"

export default function TrackingScriptRedirect() {
  redirect("/client/tracking")
}
