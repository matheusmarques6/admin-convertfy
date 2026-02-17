import { cn } from "@/lib/utils"

export type GlowColor = "success" | "warning" | "destructive" | "primary" | "info" | "mrr"
export type GlowIntensity = "intense" | "moderate"

interface GlowCardProps {
  color: GlowColor
  intensity?: GlowIntensity
  className?: string
  surfaceClassName?: string
  children: React.ReactNode
}

export function GlowCard({
  color,
  intensity = "moderate",
  className,
  surfaceClassName,
  children,
}: GlowCardProps) {
  const showLeftLine = intensity === "intense"

  return (
    <div
      className={cn("glow-card", className)}
      data-color={color}
      data-intensity={intensity}
    >
      {/* Layer 0: Halo (outer glow) */}
      <div className="glow-halo" aria-hidden="true" />

      {/* Layer 3: Glass surface */}
      <div className={cn("glow-surface", surfaceClassName)}>
        {/* Layer 1: Top luminous line */}
        <div className="glow-line-top" aria-hidden="true" />
        <div className="glow-line-top-blur" aria-hidden="true" />

        {/* Layer 2: Left line (intense only) */}
        {showLeftLine && (
          <>
            <div className="glow-line-left" aria-hidden="true" />
            <div className="glow-line-left-blur" aria-hidden="true" />
          </>
        )}

        {/* Content */}
        <div className="relative z-[3]">
          {children}
        </div>
      </div>
    </div>
  )
}
