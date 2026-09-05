/**
 * Contratos da IA do Estúdio — entrada (rota) e saída (o que o modelo
 * devolve, validado antes de tocar o documento).
 */

import { z } from "zod"

const frameTipo = z.enum(["capa", "dado", "texto", "prova", "lista", "mec", "cta"])

const frameContrato = z.object({
  frameId: z.string(),
  tipo: frameTipo,
  label: z.string(),
  campos: z.array(z.enum(["titulo", "subtitulo", "corpo", "botao"])),
})

const textos = z
  .object({
    titulo: z.string().optional(),
    subtitulo: z.string().optional(),
    corpo: z.string().optional(),
    botao: z.string().optional(),
  })
  .strict()

// ── Entradas ────────────────────────────────────────────────────────────

export const entradaSchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("gerar_estrutura"),
    nome: z.string().min(1).max(200),
    /** Quem publica: handle/nome e a voz (marca = "nós"; pessoal = primeira pessoa). */
    perfil: z.object({ handle: z.string().max(80).nullable(), nome: z.string().max(120), voz: z.enum(["marca", "pessoal"]).optional() }),
    pauta: z.string().min(1).max(4000),
    pilar: z.string().max(40).optional(),
    etapaFunil: z.string().max(40).optional(),
    objetivoCta: z.string().max(60).optional(),
    prova: z.string().max(400).optional(),
    templateNome: z.string().max(80),
    frames: z.array(frameContrato).min(1).max(30),
    /** Textos atuais (para regenerar mantendo o que já foi escrito à mão). */
    atuais: z.record(z.string(), textos).optional(),
  }),
  z.object({
    acao: z.literal("preencher_frame"),
    resumo: z.string().max(8000),
    frame: frameContrato,
    atual: textos.optional(),
    /** true = reescrever mesmo que já tenha texto. */
    regenerar: z.boolean().optional(),
  }),
  z.object({
    acao: z.literal("headlines"),
    resumo: z.string().max(8000),
    atual: z.string().max(300),
  }),
  z.object({
    acao: z.literal("legenda"),
    resumo: z.string().max(8000),
    palavraChave: z.string().max(40).optional(),
  }),
  z.object({
    acao: z.literal("corrigir_legenda"),
    legenda: z.string().max(4000),
    problemas: z.array(z.string().max(120)).max(10),
  }),
  z.object({
    acao: z.literal("distribuir"),
    resumo: z.string().max(8000),
    texto: z.string().min(1).max(6000),
    frames: z.array(frameContrato).min(1).max(30),
  }),
  z.object({
    acao: z.literal("chat"),
    resumo: z.string().max(8000),
    mensagem: z.string().max(6000),
    anexos: z.array(z.string().max(4_000_000)).max(4).optional(),
    historico: z
      .array(z.object({ de: z.enum(["eu", "ia"]), t: z.string().max(3000) }))
      .max(12)
      .optional(),
    frames: z.array(frameContrato).min(1).max(30),
  }),
  z.object({
    acao: z.literal("analisar_inspiracao"),
    imagens: z.array(z.string().max(4_000_000)).min(1).max(12),
  }),
])

/** Geração de imagem (não passa pelo LLM de texto — tratada à parte na rota). */
export const entradaImagemSchema = z.object({
  acao: z.literal("gerar_imagem"),
  prompt: z.string().min(3).max(1500),
  aspecto: z.enum(["4:5", "9:16", "1:1"]).optional(),
  quantidade: z.number().int().min(1).max(4).optional(),
})

export type EntradaImagem = z.infer<typeof entradaImagemSchema>

export interface SaidaImagem {
  urls: string[]
}

export type EntradaIA = z.infer<typeof entradaSchema>

// ── Saídas ──────────────────────────────────────────────────────────────

export const saidaEstruturaSchema = z.object({
  nome: z.string().optional(),
  frames: z.array(z.object({ frameId: z.string(), textos })).min(1),
  legenda: z.string(),
  palavraChave: z.string(),
})

export const saidaFrameSchema = z.object({ textos })

export const saidaHeadlinesSchema = z.object({ opcoes: z.array(z.string().min(1)).min(3).max(6) })

export const saidaLegendaSchema = z.object({ legenda: z.string().min(20), palavraChave: z.string().min(1) })

export const saidaCorrigirSchema = z.object({ legenda: z.string().min(20) })

export const propostaSchema = z.object({
  frameId: z.string(),
  titulo: z.string(),
  corpo: z.string().optional(),
})

export const saidaDistribuirSchema = z.object({ props: z.array(propostaSchema).min(1) })

export const acaoChatSchema = z.object({
  tipo: z.enum(["estrutura", "estilo", "imagens", "exportar", "gerar", "headline", "legenda", "nenhuma"]),
  label: z.string().min(1).max(60),
})

export const saidaChatSchema = z.object({
  texto: z.string().min(1),
  acao: acaoChatSchema.optional(),
  props: z.array(propostaSchema).optional(),
  opcoes: z.array(z.string()).optional(),
  detalhes: z.array(z.string()).optional(),
  legenda: z.string().optional(),
  palavraChave: z.string().optional(),
  estilo: z
    .object({
      fundoEscuroTipos: z.array(frameTipo).optional(),
      escalaTituloCapa: z.number().min(50).max(170).optional(),
      angulo: z.number().min(0).max(360).optional(),
    })
    .optional(),
})

export const saidaInspiracaoSchema = z.object({
  frames: z
    .array(
      z.object({
        tipo: frameTipo,
        descricao: z.string(),
        slotImagem: z.boolean().optional(),
      }),
    )
    .min(3)
    .max(20),
  fidelidade: z.number().min(0).max(100),
  observacoes: z.string().optional(),
  templateSugerido: z.string().optional(),
})

export type SaidaEstrutura = z.infer<typeof saidaEstruturaSchema>
export type SaidaFrame = z.infer<typeof saidaFrameSchema>
export type SaidaHeadlines = z.infer<typeof saidaHeadlinesSchema>
export type SaidaLegenda = z.infer<typeof saidaLegendaSchema>
export type SaidaCorrigir = z.infer<typeof saidaCorrigirSchema>
export type SaidaDistribuir = z.infer<typeof saidaDistribuirSchema>
export type SaidaChat = z.infer<typeof saidaChatSchema>
export type SaidaInspiracao = z.infer<typeof saidaInspiracaoSchema>

export type SaidaPorAcao = {
  gerar_estrutura: SaidaEstrutura
  preencher_frame: SaidaFrame
  headlines: SaidaHeadlines
  legenda: SaidaLegenda
  corrigir_legenda: SaidaCorrigir
  distribuir: SaidaDistribuir
  chat: SaidaChat
  analisar_inspiracao: SaidaInspiracao
}

export const SAIDA_SCHEMA: { [K in keyof SaidaPorAcao]: z.ZodType<SaidaPorAcao[K]> } = {
  gerar_estrutura: saidaEstruturaSchema,
  preencher_frame: saidaFrameSchema,
  headlines: saidaHeadlinesSchema,
  legenda: saidaLegendaSchema,
  corrigir_legenda: saidaCorrigirSchema,
  distribuir: saidaDistribuirSchema,
  chat: saidaChatSchema,
  analisar_inspiracao: saidaInspiracaoSchema,
}
