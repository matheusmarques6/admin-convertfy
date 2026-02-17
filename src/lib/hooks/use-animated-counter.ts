"use client"

import { useEffect, useRef, useState } from "react"

interface UseAnimatedCounterOptions {
  target: number
  duration?: number
  format?: "number" | "currency" | "percent"
  locale?: string
}

export function useAnimatedCounter({
  target,
  duration = 1000,
  format = "number",
  locale = "pt-BR",
}: UseAnimatedCounterOptions) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          animate()
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(element)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  function animate() {
    const start = performance.now()

    function step(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(eased * target)

      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        setValue(target)
      }
    }

    requestAnimationFrame(step)
  }

  function formatValue(val: number): string {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(val)
      case "percent":
        return `${val.toFixed(1)}%`
      default:
        return new Intl.NumberFormat(locale, {
          maximumFractionDigits: 0,
        }).format(val)
    }
  }

  return { ref, value, formattedValue: formatValue(value) }
}
