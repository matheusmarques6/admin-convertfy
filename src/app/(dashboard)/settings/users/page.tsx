"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function UsersPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/team") }, [router])
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Redirecionando para gestão de equipe...</p>
    </div>
  )
}
