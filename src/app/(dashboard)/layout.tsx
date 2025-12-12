import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const userData = profile ? {
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatar_url,
  } : {
    name: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    avatar_url: undefined,
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar user={userData} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={userData} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
