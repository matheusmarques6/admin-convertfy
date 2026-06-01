/**
 * Tipos e constantes do domínio de blueprints — client-safe.
 *
 * Esses símbolos eram exportados de `@/lib/services/blueprint-management.service`,
 * mas aquele arquivo importa `createAdminClient` de `@/lib/supabase/server`,
 * que puxa `next/headers`. Quando um client component (`"use client"`)
 * importa qualquer coisa de lá, o webpack do Next falha o build:
 *
 *   You're importing a component that needs "next/headers".
 *
 * Solução: tipos e constantes ficam aqui, sem deps de server-only. O service
 * mantém só funções que rodam no server.
 */

import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"

export interface BlueprintRow {
  id: string | null
  flow_type: string
  email_number: number
  objective: string
  messaging: string
  subject_hint: string | null
  blocks: BlueprintBlockDef[]
  tone_override: string | null
  updated_at: string | null
  source: "db" | "default"
}

export const BLOCK_TYPE_OPTIONS = [
  { value: "hero", label: "Hero (banner com imagem)" },
  { value: "text", label: "Text (parágrafo)" },
  { value: "coupon", label: "Coupon (código + CTA)" },
  { value: "products", label: "Products (carrossel)" },
  { value: "cta", label: "CTA (botão isolado)" },
  { value: "footer", label: "Footer (links + copyright)" },
  { value: "image", label: "Image (banner sem texto)" },
  { value: "divider", label: "Divider (linha)" },
  { value: "spacer", label: "Spacer (espaço)" },
  // ── Expansão Ozoric 2026-06 ──
  { value: "header", label: "Header (cabeçalho com logo)" },
  { value: "headline", label: "Headline (título destacado)" },
  { value: "features", label: "Features (strip de ícones)" },
  { value: "social_proof", label: "Social Proof (clientes/rating)" },
  { value: "testimonials", label: "Testimonials (cards de depoimento)" },
  { value: "urgency", label: "Urgency (escassez/expiração)" },
  { value: "comparison", label: "Comparison (tabela comparativa)" },
  { value: "story", label: "Story (card de história da marca)" },
  { value: "letter", label: "Letter (texto formato carta)" },
] as const

export type BlueprintBlockType = (typeof BLOCK_TYPE_OPTIONS)[number]["value"]
