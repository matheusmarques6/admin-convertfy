"use client"

import { Mail, MessageSquare, Bell, MessageCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Channel Config — DS v3.0 explicit colors ─────────────────────────────────

export interface ChannelConfig {
  label: string
  icon: LucideIcon
  color: string        // primary text/dot color
  darkColor: string    // dark mode text/dot color
  bgLight: string      // light mode background
  bgDark: string       // dark mode background
  borderLight: string  // light mode border
  borderDark: string   // dark mode border
}

export const DS_CHANNEL_CONFIG: Record<string, ChannelConfig> = {
  email: {
    label: "Email",
    icon: Mail,
    color: "#4E62D8",
    darkColor: "#7B8CEA",
    bgLight: "#EEF0FB",
    bgDark: "rgba(78,98,216,0.1)",
    borderLight: "rgba(78,98,216,0.2)",
    borderDark: "rgba(123,140,234,0.2)",
  },
  sms: {
    label: "SMS",
    icon: MessageSquare,
    color: "#065F46",
    darkColor: "#6EE7B7",
    bgLight: "#ECFDF5",
    bgDark: "rgba(6,95,70,0.1)",
    borderLight: "rgba(6,95,70,0.2)",
    borderDark: "rgba(110,231,183,0.2)",
  },
  push: {
    label: "Push",
    icon: Bell,
    color: "#7C3AED",
    darkColor: "#C4B5FD",
    bgLight: "#F3E8FF",
    bgDark: "rgba(124,58,237,0.1)",
    borderLight: "rgba(124,58,237,0.2)",
    borderDark: "rgba(196,181,253,0.2)",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "#146B3A",
    darkColor: "#86EFAC",
    bgLight: "#E6F9EC",
    bgDark: "rgba(20,107,58,0.1)",
    borderLight: "rgba(20,107,58,0.2)",
    borderDark: "rgba(134,239,172,0.2)",
  },
}

// ── ChannelBadge Component ───────────────────────────────────────────────────

interface ChannelBadgeProps {
  channel: string
  showIcon?: boolean
  className?: string
}

export function ChannelBadge({ channel, showIcon = true, className }: ChannelBadgeProps) {
  const cfg = DS_CHANNEL_CONFIG[channel] || DS_CHANNEL_CONFIG.email
  const IconComp = cfg.icon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border",
        "text-[11px] font-semibold tracking-[0.02em]",
        "transition-colors duration-150",
        className,
      )}
      style={{
        backgroundColor: `var(--channel-bg)`,
        color: `var(--channel-color)`,
        borderColor: `var(--channel-border)`,
        // @ts-expect-error CSS custom properties
        "--channel-bg": cfg.bgLight,
        "--channel-color": cfg.color,
        "--channel-border": cfg.borderLight,
      }}
    >
      {showIcon && <IconComp size={12} strokeWidth={2} />}
      {cfg.label}
    </span>
  )
}

// ── ChannelDot — small colored dot ───────────────────────────────────────────

interface ChannelDotProps {
  channel: string
  size?: number
  className?: string
}

export function ChannelDot({ channel, size = 8, className }: ChannelDotProps) {
  const cfg = DS_CHANNEL_CONFIG[channel] || DS_CHANNEL_CONFIG.email
  return (
    <span
      className={cn("rounded-full shrink-0", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: cfg.color,
      }}
    />
  )
}
