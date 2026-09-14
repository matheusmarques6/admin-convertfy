/**
 * Prontidão da loja para geração de e-mails — módulo PURO (client-safe).
 *
 * Por que existe (Trilha B1, set/2026): a loja entrava na fila de geração
 * sem estar pronta e a falta só aparecia no MEIO do pipeline — `brand_
 * incomplete` na fase 2 depois da fase 1 paga, pesquisa vazia virando
 * dossiê de uma linha, `store_top_products` vazio deixando o bloco de
 * produtos sem feed. Cada uma dessas faltas custa uma geração inteira para
 * ser descoberta, e nenhuma delas era dita ANTES do clique.
 *
 * Duas severidades, e a régua é o custo do erro:
 *
 * - **bloqueio** — sem isto a peça não pode sair certa (pesquisa, produtos,
 *   paleta, logo, fontes). Corta a fila e as rotas manuais (422), a menos
 *   que o operador diga POR QUE quer gerar assim mesmo (`gate_override`).
 * - **aviso** — a peça sai, mas com uma lacuna que alguém vai notar depois
 *   (paleta com dois "Principal", selos vazios, cupom sem tradução,
 *   identidade não confirmada). Vai no run `gate` e no card.
 *
 * A identidade lida é a ÚLTIMA versão, não só a confirmada: a Hero Boxers
 * tem cores, logo e fontes na v3 e `confirmed_at` nulo — bloquear por isso
 * seria bloquear por um clique que o time esquece de dar. Vira aviso.
 *
 * Quem faz I/O é `prontidao.service.ts`. O card da produção e o gate do
 * enfileiramento chamam a MESMA função — não existem duas réguas.
 */

export type SeveridadeDaProntidao = "bloqueio" | "aviso"

export type IdDeProntidao =
  | "pesquisa_incompleta"
  | "sem_produtos"
  | "paleta_sem_hex"
  | "logo_ausente"
  | "fontes_ausentes"
  | "paleta_dois_principais"
  | "politica_sem_pagina"
  | "trust_icons_vazio"
  | "cupom_sem_override"
  | "identidade_nao_confirmada"

export interface AcaoDeProntidao {
  /** Onde o operador resolve: rota absoluta ou recurso do workspace. */
  destino: { tipo: "rota"; href: string } | { tipo: "recurso"; recurso: "brand" | "briefing" }
  rotulo: string
}

export interface ItemDeProntidao {
  id: IdDeProntidao
  severidade: SeveridadeDaProntidao
  titulo: string
  detalhe: string
  acao: AcaoDeProntidao
}

export interface Prontidao {
  pronta: boolean
  bloqueios: ItemDeProntidao[]
  avisos: ItemDeProntidao[]
}

/** Os 5 pilares da pesquisa — um pilar conta como preenchido com QUALQUER campo. */
export const PILARES_DA_PESQUISA: ReadonlyArray<{ id: string; rotulo: string; campos: readonly string[] }> = [
  { id: "marca", rotulo: "Perfil da marca", campos: ["brand_thesis", "brand_about", "brand_pillars", "brand_presence"] },
  { id: "loja", rotulo: "Sobre a loja", campos: ["store_story", "store_milestones"] },
  {
    id: "icp",
    rotulo: "Cliente ideal",
    campos: [
      "icp_persona", "icp_demographics", "icp_day_in_life", "icp_motivations", "icp_frictions",
      "icp_awareness", "icp_starving_crowd", "icp_unique_mechanism", "icp_objections", "icp_vocabulary",
    ],
  },
  { id: "tom", rotulo: "Tom de comunicação", campos: ["tone_description", "tone_do", "tone_dont", "tone_use_words", "tone_avoid_words"] },
  { id: "ads", rotulo: "Review dos anúncios", campos: ["ads_score", "ads_summary", "ads_sub_scores", "ads_strengths", "ads_opportunities", "ads_risks"] },
]

export interface LojaParaProntidao {
  id: string
  /** Colunas da pesquisa (as dos pilares) + as de política que o setup guarda. */
  [coluna: string]: unknown
}

export interface IdentidadeParaProntidao {
  colors_primary?: unknown
  colors_secondary?: unknown
  logo_main_svg?: string | null
  logo_main_png?: string | null
  logo_alt_svg?: string | null
  logo_alt_png?: string | null
  logo_monogram_svg?: string | null
  logo_monogram_png?: string | null
  font_heading?: string | null
  font_body?: string | null
  trust_icons?: unknown
  confirmed_at?: string | null
}

export interface EntradaDeProntidao {
  store: LojaParaProntidao | null
  /** Última versão da identidade (confirmada ou não). */
  identity: IdentidadeParaProntidao | null
  /** Quantos produtos há em `store_top_products` (ou no snapshot da identidade). */
  produtos: number
  /** Ficha operacional normalizada (troca/envio), quando existe. */
  ficha?: { troca?: { texto?: string | null; prazo_dias?: number | null } | null; envio?: { texto?: string | null; prazo?: string | null } | null } | null
  /** Idioma da loja (código) e se o outline do toque tem tradução para ele. */
  idioma?: { codigo: string | null; outline_tem_cupom: boolean; traducao_presente: boolean } | null
  /** Passo 16: políticas lidas das páginas públicas (troca/frete). */
  politicas?: { troca?: { dias?: number | null } | null; frete?: { gratis?: boolean | null; prazo?: string | null } | null } | null
}

const HEX_RE = /^#?[0-9a-f]{6}$/i

function preenchido(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "number") return Number.isFinite(v)
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v as object).length > 0
  return Boolean(v)
}

function cores(v: unknown): Array<{ hex: string; role: string }> {
  if (!Array.isArray(v)) return []
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ hex: typeof c.hex === "string" ? c.hex.trim() : "", role: typeof c.role === "string" ? c.role.trim().toLowerCase() : "" }))
}

function pilaresVazios(store: LojaParaProntidao | null): string[] {
  if (!store) return PILARES_DA_PESQUISA.map((p) => p.rotulo)
  return PILARES_DA_PESQUISA.filter((p) => !p.campos.some((c) => preenchido(store[c]))).map((p) => p.rotulo)
}

export function avaliarProntidao(entrada: EntradaDeProntidao): Prontidao {
  const bloqueios: ItemDeProntidao[] = []
  const avisos: ItemDeProntidao[] = []
  const storeId = entrada.store?.id ?? ""
  const rotaContexto = { tipo: "rota" as const, href: `/admin/stores/${storeId}?tab=contexto` }
  const recursoMarca = { tipo: "recurso" as const, recurso: "brand" as const }

  // ── bloqueios ─────────────────────────────────────────────────────────
  const vazios = pilaresVazios(entrada.store)
  if (vazios.length > 0) {
    bloqueios.push({
      id: "pesquisa_incompleta",
      severidade: "bloqueio",
      titulo: "Pesquisa & Diagnóstico incompleta",
      detalhe: `${vazios.length === 5 ? "Nenhum pilar" : `Pilar${vazios.length > 1 ? "es" : ""} sem conteúdo: ${vazios.join(", ")}`}. Sem a pesquisa o dossiê da marca sai vazio e todo agente escreve no escuro.`,
      acao: { destino: rotaContexto, rotulo: "Abrir a pesquisa" },
    })
  }
  if (entrada.produtos <= 0) {
    bloqueios.push({
      id: "sem_produtos",
      severidade: "bloqueio",
      titulo: "Nenhum produto sincronizado",
      detalhe: "`store_top_products` está vazio: o bloco de produtos não tem o que mostrar e a imagem não tem referência de produto.",
      acao: { destino: rotaContexto, rotulo: "Sincronizar produtos" },
    })
  }

  const id = entrada.identity
  const primarias = cores(id?.colors_primary)
  const secundarias = cores(id?.colors_secondary)
  const comHex = [...primarias, ...secundarias].filter((c) => HEX_RE.test(c.hex))
  if (comHex.length === 0) {
    bloqueios.push({
      id: "paleta_sem_hex",
      severidade: "bloqueio",
      titulo: "Paleta sem cor válida",
      detalhe: "A identidade não tem nenhuma cor com hex válido — os papéis de cor (fundo, texto, botão) não têm de onde derivar.",
      acao: { destino: recursoMarca, rotulo: "Cadastrar a paleta" },
    })
  }
  const temLogo = Boolean(id?.logo_main_svg || id?.logo_main_png || id?.logo_alt_svg || id?.logo_alt_png || id?.logo_monogram_svg || id?.logo_monogram_png)
  if (!temLogo) {
    bloqueios.push({
      id: "logo_ausente",
      severidade: "bloqueio",
      titulo: "Logo ausente",
      detalhe: "Nenhuma logo (principal, alternativa ou monograma) na identidade — o cabeçalho de todo e-mail sairia sem marca.",
      acao: { destino: recursoMarca, rotulo: "Enviar a logo" },
    })
  }
  if (!preenchido(id?.font_heading) || !preenchido(id?.font_body)) {
    bloqueios.push({
      id: "fontes_ausentes",
      severidade: "bloqueio",
      titulo: "Fontes não definidas",
      detalhe: `Falta ${!preenchido(id?.font_heading) && !preenchido(id?.font_body) ? "a fonte de título e a de corpo" : !preenchido(id?.font_heading) ? "a fonte de título" : "a fonte de corpo"} — a tipografia da peça seria a do template, não a da loja.`,
      acao: { destino: recursoMarca, rotulo: "Definir as fontes" },
    })
  }

  // ── avisos ────────────────────────────────────────────────────────────
  const principais = primarias.filter((c) => c.role === "principal").length
  const temFundoOuTexto = [...primarias, ...secundarias].some((c) => c.role === "fundo" || c.role === "texto")
  if (principais >= 2 && !temFundoOuTexto) {
    avisos.push({
      id: "paleta_dois_principais",
      severidade: "aviso",
      titulo: "Paleta com dois \"Principal\" e sem fundo/texto",
      detalhe: "Duas cores marcadas como principal e nenhuma como fundo ou texto: o papel de cada uma é adivinhado pela luminância, e o botão pode sair na cor errada.",
      acao: { destino: recursoMarca, rotulo: "Definir os papéis das cores" },
    })
  }
  const politicaLoja = preenchido(entrada.store?.devolucao_politica) || preenchido(entrada.store?.frete_prazo) || preenchido(entrada.store?.frete_cobertura)
  const politicaFicha = Boolean(entrada.ficha?.troca?.texto || entrada.ficha?.troca?.prazo_dias != null || entrada.ficha?.envio?.texto || entrada.ficha?.envio?.prazo)
  // Passo 16: a página pública da loja também conta como fonte.
  const politicaPagina = Boolean(entrada.politicas?.troca || entrada.politicas?.frete)
  if (!politicaLoja && !politicaFicha && !politicaPagina) {
    avisos.push({
      id: "politica_sem_pagina",
      severidade: "aviso",
      titulo: "Política de troca e frete não informada",
      detalhe: "Nem o setup, nem a ficha operacional, nem as páginas públicas da loja têm troca/frete: o Seletor proíbe afirmar prazo e garantia, e os selos de confiança saem vazios.",
      acao: { destino: rotaContexto, rotulo: "Preencher a ficha operacional" },
    })
  }
  if (!Array.isArray(id?.trust_icons) || (id?.trust_icons as unknown[]).length === 0) {
    avisos.push({
      id: "trust_icons_vazio",
      severidade: "aviso",
      titulo: "Sem selos de confiança",
      detalhe: "`trust_icons` está vazio — blocos de garantia usam ícone genérico em vez do selo da loja.",
      acao: { destino: recursoMarca, rotulo: "Enviar selos" },
    })
  }
  const idioma = entrada.idioma
  if (idioma && idioma.codigo && idioma.codigo.toLowerCase() !== "pt-br" && idioma.outline_tem_cupom && !idioma.traducao_presente) {
    avisos.push({
      id: "cupom_sem_override",
      severidade: "aviso",
      titulo: `Cupom sem tradução para ${idioma.codigo}`,
      detalhe: "O outline deste toque entrega cupom e não há código no idioma da loja: o e-mail sairia com o código em pt-BR.",
      acao: { destino: { tipo: "rota", href: "/admin/outlines" }, rotulo: "Traduzir o código" },
    })
  }
  if (id && !id.confirmed_at) {
    avisos.push({
      id: "identidade_nao_confirmada",
      severidade: "aviso",
      titulo: "Identidade visual não confirmada",
      detalhe: "A versão mais recente da identidade ainda não foi confirmada pelo designer — a geração usa o que está gravado, mas ninguém revisou.",
      acao: { destino: recursoMarca, rotulo: "Revisar e confirmar" },
    })
  }

  return { pronta: bloqueios.length === 0, bloqueios, avisos }
}

/** Resumo de uma linha para log, `error_message` e toast. */
export function resumoDaProntidao(p: Prontidao): string {
  const b = p.bloqueios.map((i) => i.id).join(", ")
  const a = p.avisos.map((i) => i.id).join(", ")
  if (!b && !a) return "pronta"
  return [b ? `bloqueios: ${b}` : null, a ? `avisos: ${a}` : null].filter(Boolean).join(" · ")
}
