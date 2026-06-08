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

import { z } from "zod"
import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"

/**
 * Validadores Zod dos campos de instrução de IMAGEM do blueprint (story AE-10).
 * Fonte única reusada pelos schemas PATCH e POST das rotas de email-blueprints,
 * pra não duplicar as regras nos dois endpoints.
 */
export const blueprintImageFields = {
  image_brief: z.string().nullable().optional(),
  image_produto_heroi_hint: z.string().nullable().optional(),
  image_aspect: z.enum(["4:5", "3:5", "4:3", "1:1", "3:4"]).nullable().optional(),
  image_mode: z.enum(["auto", "product_ref", "text2img"]).nullable().optional(),
  image_overlay_reserve_bottom: z.boolean().nullable().optional(),
}

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
  // ── Instrução de geração de imagem por email (story AE-10) ──
  // Opcionais: rows 'default' e legacy não têm esses campos.
  image_brief?: string | null
  image_produto_heroi_hint?: string | null
  image_aspect?: "4:5" | "3:5" | "4:3" | "1:1" | "3:4" | null
  image_mode?: "auto" | "product_ref" | "text2img" | null
  image_overlay_reserve_bottom?: boolean | null
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
  // ── Expansão welcome universal 2026-06 ──
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
