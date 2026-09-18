/**
 * meus-templates — o que as duas rotas de `conteudo_meus_templates` dividem.
 *
 * Isto morava em `app/api/conteudo/templates/route.ts` e era importado de
 * `../route` pela rota do `[id]`. Rota importando VALOR de outra rota quebra
 * o build: o Next valida os exports de um `route.ts` contra uma lista fechada
 * (handlers + `dynamic`, `maxDuration`…) e recusa o resto. Além disso, o
 * import arrastava o módulo inteiro do handler vizinho para o bundle de quem
 * importava — o módulo é o lugar certo dos dois pontos de vista.
 *
 * `lib/conteudo/templates.ts` é outra coisa: os moldes FIXOS da casa. Aqui é
 * a prateleira do time, gravada por org.
 */

import { z } from "zod"
import { ehFamilia } from "@/lib/conteudo/familias"
import { TEMPLATE_PADRAO_ID } from "@/lib/conteudo/templates"
import type { EstruturaDetectada, MeuTemplate } from "@/lib/conteudo/types"

const estruturaSchema = z
  .array(z.object({ tipo: z.enum(["capa", "dado", "texto", "prova", "lista", "mec", "cta"]), slotImagem: z.boolean().optional(), descricao: z.string().max(200).optional() }))
  .min(3)
  .max(30)

export const criarSchema = z.object({
  nome: z.string().min(1).max(120),
  templateId: z.string().max(80),
  familia: z.enum(["padrao", "editorial", "alternado", "post", "post-largo"]).optional(),
  estrutura: estruturaSchema,
  fidelidade: z.number().min(0).max(100).nullable().optional(),
  usos: z.number().int().min(0).optional(),
})

export interface Row {
  id: string
  nome: string
  template_base: string | null
  familia?: string | null
  estrutura: EstruturaDetectada[]
  fidelidade: number | null
  usos: number
  criado_em: string
}

export function rowToMeuTemplate(r: Row): MeuTemplate {
  return {
    id: r.id,
    nome: r.nome,
    origem: "inspiração",
    frames: r.estrutura.length,
    usos: r.usos,
    templateId: r.template_base ?? TEMPLATE_PADRAO_ID,
    ...(ehFamilia(r.familia) ? { familia: r.familia } : {}),
    estrutura: r.estrutura,
    fidelidade: r.fidelidade,
    criadoEm: r.criado_em,
  }
}

export const COLS = "id, nome, template_base, familia, estrutura, fidelidade, usos, criado_em"
/** Sem a migration 20261157: a prateleira funciona, a prévia herda do molde. */
export const COLS_SEM_FAMILIA = "id, nome, template_base, estrutura, fidelidade, usos, criado_em"

/** 42703/PGRST204 falando da coluna nova — a migration deste repo escorrega. */
export function semColunaFamilia(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  if (e.code !== "42703" && e.code !== "PGRST204") return false
  return (e.message ?? "").includes("familia")
}
