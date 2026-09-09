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

// ── Motor editorial (tipos compartilhados entre entrada e saída) ─────────

const perfilSchema = z.object({ handle: z.string().max(80).nullable(), nome: z.string().max(120), voz: z.enum(["marca", "pessoal"]).optional() })

export const evidenciaSchema = z.object({ rotulo: z.string().max(4), texto: z.string().min(1).max(600), fonte: z.string().max(200).optional() })

export const triagemSchema = z.object({
  transformacao: z.string().min(1).max(1200),
  friccaoCentral: z.string().min(1).max(800),
  anguloDominante: z.string().min(1).max(600),
  evidencias: z.array(evidenciaSchema).min(1).max(6),
  eixo: z.enum(["mercado", "cases", "noticias", "cultura", "produto"]),
  funil: z.enum(["topo", "meio", "fundo"]),
  promessa: z.string().min(1).max(400),
})

export const headlineOpcaoSchema = z.object({
  texto: z.string().min(3).max(220),
  subtitulo: z.string().max(220).optional(),
  padrao: z.string().min(1).max(40),
  gatilhos: z.array(z.string().min(1).max(30)).min(1).max(4),
  veredito: z.enum(["aprovada", "ressalva", "reprovada"]),
  motivo: z.string().max(300).optional(),
})

export const espinhaSchema = z.object({
  headline: z.string().min(1).max(220),
  subtitulo: z.string().max(220).optional(),
  hook: z.string().min(1).max(900),
  mecanismo: z.string().min(1).max(1200),
  prova: z.array(z.string().min(1).max(500)).min(1).max(5),
  aplicacao: z.string().min(1).max(900),
  direcao: z.string().min(1).max(700),
  fechamento: z.string().min(1).max(700),
})

const limitesCapaSchema = z.object({ titulo: z.number().int().positive().optional(), subtitulo: z.number().int().positive().optional() })

const papelSchema = z.enum(["headline", "hook", "mecanismo", "prova", "aplicacao", "direcao", "fechamento", "cta"])

const frameComPapel = frameContrato.extend({ papel: papelSchema.optional() })

const violacaoLite = z.object({ frameId: z.string().optional(), campo: z.string().optional(), nome: z.string().max(160), trecho: z.string().max(300), sugestao: z.string().max(300) })

// ── Entradas ────────────────────────────────────────────────────────────

export const entradaSchema = z.discriminatedUnion("acao", [
  /** Passo 1 do motor editorial: leitura do insumo antes de qualquer headline. */
  z.object({
    acao: z.literal("triagem"),
    insumo: z.string().min(10).max(8000),
    perfil: perfilSchema,
    pilar: z.string().max(40).optional(),
    etapaFunil: z.enum(["topo", "meio", "fundo"]).optional(),
    templateNome: z.string().max(80).optional(),
  }),
  /** Reescreve UMA opção (ou mistura duas) mantendo as demais. */
  z.object({
    acao: z.literal("ajustar_headline"),
    opcoes: z.array(headlineOpcaoSchema).min(1).max(12),
    indice: z.number().int().min(0).max(11),
    instrucao: z.string().max(400).optional(),
    misturarCom: z.number().int().min(0).max(11).optional(),
    triagem: triagemSchema.optional(),
    limites: limitesCapaSchema.optional(),
    segundaPessoa: z.boolean().optional(),
  }),
  /** Passo 3: estrutura narrativa aprovada antes da copy. */
  z.object({
    acao: z.literal("espinha"),
    triagem: triagemSchema,
    headline: headlineOpcaoSchema,
    perfil: perfilSchema,
    templateNome: z.string().max(80),
    papeis: z.array(papelSchema).max(30),
    pilar: z.string().max(40).optional(),
    segundaPessoa: z.boolean().optional(),
    /** Espinha anterior + pedido de ajuste (regenerar com direção). */
    atual: espinhaSchema.optional(),
    instrucao: z.string().max(600).optional(),
  }),
  /** Revisão: 7 parâmetros com nota por peça e por slide, com reescrita opcional. */
  z.object({
    acao: z.literal("revisar"),
    frames: z.array(frameComPapel.extend({ textos })).min(1).max(30),
    legenda: z.string().max(4000),
    perfil: perfilSchema,
    segundaPessoa: z.boolean(),
    violacoes: z.array(violacaoLite).max(60),
    espinha: espinhaSchema.optional(),
    triagem: triagemSchema.optional(),
  }),
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
    frames: z.array(frameComPapel).min(1).max(30),
    /** Textos atuais (para regenerar mantendo o que já foi escrito à mão). */
    atuais: z.record(z.string(), textos).optional(),
    /** Motor editorial: com triagem + espinha a copy é DERIVADA, não inventada da pauta. */
    triagem: triagemSchema.optional(),
    espinha: espinhaSchema.optional(),
    segundaPessoa: z.boolean().optional(),
  }),
  z.object({
    acao: z.literal("preencher_frame"),
    resumo: z.string().max(8000),
    frame: frameContrato,
    atual: textos.optional(),
    /** true = reescrever mesmo que já tenha texto. */
    regenerar: z.boolean().optional(),
  }),
  /**
   * Motor de headlines: 10 opções com padrão, gatilhos e veredito. `modo`
   * "diagnosticar" avalia a atual antes de propor. `resumo` (documento
   * aberto) OU `triagem` (fluxo novo) dão o contexto.
   */
  z.object({
    acao: z.literal("headlines"),
    resumo: z.string().max(8000).optional(),
    atual: z.string().max(300).optional(),
    triagem: triagemSchema.optional(),
    modo: z.enum(["criar", "diagnosticar"]).optional(),
    quantidade: z.number().int().min(3).max(12).optional(),
    limites: limitesCapaSchema.optional(),
    segundaPessoa: z.boolean().optional(),
    perfil: perfilSchema.optional(),
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
  /**
   * Lê um carrossel-referência: copy por slide (não só a estrutura, como
   * `analisar_inspiracao`), por que funciona, pilar/molde. É o que vira
   * exemplo de estilo nos pedidos seguintes.
   */
  z.object({
    acao: z.literal("transcrever_referencia"),
    imagens: z.array(z.string().max(4_000_000)).min(1).max(12),
    legenda: z.string().max(4000).optional(),
    nome: z.string().max(200).optional(),
  }),
])

/** Geração de imagem (não passa pelo LLM de texto — tratada à parte na rota). */
export const entradaImagemSchema = z.object({
  acao: z.literal("gerar_imagem"),
  prompt: z.string().min(3).max(1500),
  aspecto: z.enum(["4:5", "9:16", "1:1"]).optional(),
  quantidade: z.number().int().min(1).max(4).optional(),
  /**
   * Via B. `hibrido` (e o legado sem modo) = só o visual, a rota reforça
   * "sem texto na imagem". `completo` = slide inteiro pelo modelo, texto
   * incluído — é o ÚNICO modo em que a rota não acrescenta essa proibição.
   */
  modo: z.enum(["hibrido", "completo"]).optional(),
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

export const saidaHeadlinesSchema = z.object({
  diagnostico: z
    .object({ padraoAtual: z.string().max(60), forca: z.number().min(0).max(10), problema: z.string().max(400), oportunidade: z.string().max(400) })
    .optional(),
  opcoes: z.array(headlineOpcaoSchema).min(3).max(12),
})

export const saidaTriagemSchema = triagemSchema
export const saidaAjustarHeadlineSchema = z.object({ opcao: headlineOpcaoSchema })
export const saidaEspinhaSchema = espinhaSchema
export const saidaRevisarSchema = z.object({
  parametros: z.array(z.object({ id: z.string().max(30), nota: z.number(), problemas: z.array(z.string().max(300)).max(8).optional() })).min(1).max(10),
  slides: z
    .array(z.object({ frameId: z.string(), nota: z.number(), problemas: z.array(z.string().max(300)).max(6).optional(), reescrita: textos.optional() }))
    .max(30),
  resumo: z.string().max(600).optional(),
})

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

export const saidaTranscricaoSchema = z.object({
  nome: z.string().min(1).max(200),
  slides: z
    .array(
      z.object({
        ordem: z.number().int().min(1).max(20),
        tipo: frameTipo,
        titulo: z.string().max(400).optional(),
        corpo: z.string().max(1200).optional(),
      }),
    )
    .min(1)
    .max(20),
  porQueFunciona: z.array(z.string().min(1).max(300)).min(1).max(6),
  pilar: z.enum(["Case", "Educacional", "Bastidor", "Benchmark"]).optional(),
  molde: z.enum(["Turbo", "MEC", "Benchmark", "Lista", "Bastidor"]).optional(),
  palavraChave: z.string().max(40).optional(),
})

export type SaidaTriagem = z.infer<typeof saidaTriagemSchema>
export type SaidaAjustarHeadline = z.infer<typeof saidaAjustarHeadlineSchema>
export type SaidaEspinha = z.infer<typeof saidaEspinhaSchema>
export type SaidaRevisar = z.infer<typeof saidaRevisarSchema>
export type SaidaEstrutura = z.infer<typeof saidaEstruturaSchema>
export type SaidaFrame = z.infer<typeof saidaFrameSchema>
export type SaidaHeadlines = z.infer<typeof saidaHeadlinesSchema>
export type SaidaLegenda = z.infer<typeof saidaLegendaSchema>
export type SaidaCorrigir = z.infer<typeof saidaCorrigirSchema>
export type SaidaDistribuir = z.infer<typeof saidaDistribuirSchema>
export type SaidaChat = z.infer<typeof saidaChatSchema>
export type SaidaInspiracao = z.infer<typeof saidaInspiracaoSchema>
export type SaidaTranscricao = z.infer<typeof saidaTranscricaoSchema>

export type SaidaPorAcao = {
  triagem: SaidaTriagem
  ajustar_headline: SaidaAjustarHeadline
  espinha: SaidaEspinha
  revisar: SaidaRevisar
  gerar_estrutura: SaidaEstrutura
  preencher_frame: SaidaFrame
  headlines: SaidaHeadlines
  legenda: SaidaLegenda
  corrigir_legenda: SaidaCorrigir
  distribuir: SaidaDistribuir
  chat: SaidaChat
  analisar_inspiracao: SaidaInspiracao
  transcrever_referencia: SaidaTranscricao
}

export const SAIDA_SCHEMA: { [K in keyof SaidaPorAcao]: z.ZodType<SaidaPorAcao[K]> } = {
  triagem: saidaTriagemSchema,
  ajustar_headline: saidaAjustarHeadlineSchema,
  espinha: saidaEspinhaSchema,
  revisar: saidaRevisarSchema,
  gerar_estrutura: saidaEstruturaSchema,
  preencher_frame: saidaFrameSchema,
  headlines: saidaHeadlinesSchema,
  legenda: saidaLegendaSchema,
  corrigir_legenda: saidaCorrigirSchema,
  distribuir: saidaDistribuirSchema,
  chat: saidaChatSchema,
  analisar_inspiracao: saidaInspiracaoSchema,
  transcrever_referencia: saidaTranscricaoSchema,
}
