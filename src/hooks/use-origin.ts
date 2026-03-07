import { useState, useEffect } from "react"

export function useOrigin() {
  const [origin, setOrigin] = useState("")
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  return origin
}
