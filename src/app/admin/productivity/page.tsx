"use client"

import { useState } from "react"
import { ProductivityHome } from "@/components/productivity/productivity-home"
import { DailyPlanning } from "@/components/productivity/daily-planning"

export default function ProductivityHomePage() {
  const [planningOpen, setPlanningOpen] = useState(false)

  return (
    <>
      <ProductivityHome />
      <DailyPlanning open={planningOpen} onClose={() => setPlanningOpen(false)} />
    </>
  )
}
