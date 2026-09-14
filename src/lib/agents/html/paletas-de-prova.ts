/**
 * Paletas de PROVA (B4/B5): as duas lojas de teste do plano — Luxe Lift
 * (escura) e Innova Bay (verde/clara) — lidas da identidade real quando
 * existem, com uma paleta fixa por baixo. Servem para renderizar a MESMA
 * anatomia em duas identidades antes de gravar (tokenização) ou de aprovar
 * (gerador). I/O de leitura; nunca lança — paleta fixa é o fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"

import { tokensDaLoja } from "./apply-identity-tokens"
import { VALOR_PADRAO, type ValoresDeTokens } from "./identity-tokens"

const log = logger.child("PaletasDeProva")

export interface PaletaDeProva {
  nome: string
  slug: string
  origem: "loja" | "padrao"
  storeId: string | null
  tokens: ValoresDeTokens
}

const ALVOS: Array<{ nome: string; slug: string; padrao: ValoresDeTokens }> = [
  {
    nome: "Luxe Lift",
    slug: "luxe-lift",
    padrao: {
      ...VALOR_PADRAO,
      COR_PRINCIPAL: "#3D2820",
      COR_FUNDO: "#FAF5F3",
      COR_TEXTO: "#1F1F1F",
      COR_SUPERFICIE: "#F0E8E4",
      COR_DESTAQUE: "#6B4A3E",
      FONTE_TITULO: "'Playfair Display',Georgia,'Times New Roman',serif",
      FONTE_CORPO: "Lato,Arial,Helvetica,sans-serif",
    },
  },
  {
    nome: "Innova Bay",
    slug: "innova-bay",
    padrao: {
      ...VALOR_PADRAO,
      COR_PRINCIPAL: "#034326",
      COR_FUNDO: "#FFFFFF",
      COR_TEXTO: "#1F1F1F",
      COR_SUPERFICIE: "#F2F2F2",
      COR_DESTAQUE: "#2E7D4F",
      FONTE_TITULO: "Poppins,Arial,Helvetica,sans-serif",
      FONTE_CORPO: "Poppins,Arial,Helvetica,sans-serif",
    },
  },
]

export async function paletasDeProva(admin: SupabaseClient): Promise<PaletaDeProva[]> {
  const out: PaletaDeProva[] = []
  for (const alvo of ALVOS) {
    try {
      const { data: store } = await admin
        .from("client_stores")
        .select("id, store_name")
        .ilike("store_name", `${alvo.nome}%`)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!store?.id) {
        out.push({ nome: alvo.nome, slug: alvo.slug, origem: "padrao", storeId: null, tokens: alvo.padrao })
        continue
      }
      const { data: brand } = await admin
        .from("store_brand_identity")
        .select("colors_primary, colors_secondary, font_heading, font_body, font_heading_weight, font_body_weight")
        .eq("store_id", store.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
      out.push({
        nome: (store.store_name as string) || alvo.nome,
        slug: alvo.slug,
        origem: brand ? "loja" : "padrao",
        storeId: store.id as string,
        tokens: brand ? tokensDaLoja(brand) : alvo.padrao,
      })
    } catch (err) {
      log.warn("paletas_de_prova.fallback", { nome: alvo.nome, error: err instanceof Error ? err.message : String(err) })
      out.push({ nome: alvo.nome, slug: alvo.slug, origem: "padrao", storeId: null, tokens: alvo.padrao })
    }
  }
  return out
}
