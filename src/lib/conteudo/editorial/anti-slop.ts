/**
 * Filtro editorial anti-slop — o que é UNIVERSAL do material da
 * BrandsDecoded, aplicado por código, com o TRECHO que reprovou (a UI
 * destaca; a IA recebe a lista para reescrever). O que é voz deles e
 * conflita com a da casa NÃO está aqui como regra fixa: a segunda pessoa
 * ("você") é liberada por PERFIL — o carrossel que o time mais gosta é
 * todo em "você".
 *
 * Severidade: `erro` reprova a peça (binário, cacoete, travessão, abertura
 * ou fechamento proibido, dado sem fonte); `aviso` pede olhar humano
 * (jargão, anglicismo numérico, 2ª pessoa quando o perfil não libera).
 *
 * Puro: sem I/O, client-safe.
 */

import type { Campo, Documento, SeveridadeEditorial, ViolacaoEditorial } from "../types"

export type EscopoRegra = "slide" | "legenda" | "headline"

export interface RegraAntiSlop {
  id: string
  nome: string
  re: RegExp
  sugestao: string
  severidade: SeveridadeEditorial
  /** Onde a regra vale; ausente = em todo lugar. */
  escopos?: EscopoRegra[]
}

/** Conectivos que denunciam texto 2 dependente do texto 1 (contrato da capa). */
export const CONECTIVOS_DE_CONTINUACAO = new Set(["e", "mas", "porque", "que", "então", "entao", "aí", "ai", "porém", "porem", "ou", "pois", "nem", "portanto", "logo", "assim", "contudo", "todavia", "enquanto"])

export const REGRAS_ANTI_SLOP: RegraAntiSlop[] = [
  // ── Estruturas binárias ──
  { id: "nao_e_x_e_y", nome: "\"Não é X, é Y\"", re: /\bn[ãa]o [ée] (sobre )?[^,.;:!?\n]{2,40},\s*[ée] (sobre )?/i, sugestao: "Mostre a diferença sem nomear a fórmula: diga o que acontece e por quê.", severidade: "erro" },
  { id: "menos_x_mais_y", nome: "\"Menos X, mais Y\"", re: /\bmenos [^,.;:!?\n]{2,30}[,.;]\s*mais\b/i, sugestao: "Escreva em prosa com conector natural, não em fórmula de dois polos.", severidade: "erro" },
  { id: "sem_x_sem_y", nome: "\"Sem X. Sem Y.\"", re: /\bsem [^,.;:!?\n]{2,30}\.\s*sem\b/i, sugestao: "Diga o que existe no lugar, em uma frase com verbo.", severidade: "erro" },
  { id: "deixa_de_ser", nome: "\"Deixa de ser X para ser Y\"", re: /\bdeixa(m)? de ser\b[^.!?\n]{2,60}\bpara ser\b/i, sugestao: "Descreva a mudança com o dado que a prova.", severidade: "erro" },
  { id: "antes_agora", nome: "\"Antes: X. Agora: Y.\"", re: /\bantes:\s*[^.!?\n]{2,80}\.\s*agora:/i, sugestao: "Conte a virada em prosa, com o que causou.", severidade: "erro" },
  { id: "paralelismo", nome: "Paralelismo forçado (X diminui, Y acelera)", re: /\b(enquanto )?[^,.;\n]{2,40} (perde|diminui|cai|encolhe),\s*[^,.;\n]{2,40} (ganha|acelera|sobe|cresce)\b/i, sugestao: "Quando o contraste for real, escreva com conector natural, sem simetria de dois pontos.", severidade: "erro" },
  // ── Cacoetes de IA ──
  { id: "muda_tudo", nome: "\"E isso muda tudo\"", re: /\bisso muda tudo\b/i, sugestao: "Diga especificamente o que muda e como.", severidade: "erro" },
  { id: "fim_das_contas", nome: "\"No fim das contas\" / \"Ao final do dia\"", re: /\bno (fim|final) das contas\b|\bao final do dia\b/i, sugestao: "Corte a transição; entre direto na ideia.", severidade: "erro" },
  { id: "pergunta_que_fica", nome: "\"A pergunta que fica\" / \"O ponto é\" / \"A questão é\"", re: /\ba pergunta (que )?fica\b|\bo ponto [ée]\b|\ba quest[ãa]o [ée]\b/i, sugestao: "Formule a pergunta ou a afirmação sem anunciá-la.", severidade: "erro" },
  { id: "funciona_assim", nome: "\"A lógica/o mecanismo funciona assim:\"", re: /\b(a l[óo]gica|o mecanismo) funciona assim\b/i, sugestao: "Explique o mecanismo direto, sem preâmbulo.", severidade: "erro" },
  { id: "de_forma", nome: "\"De forma X\"", re: /\bde forma \p{L}+/iu, sugestao: "Seja específico sobre como (\"cresceu sem parar\" em vez de \"de forma consistente\").", severidade: "aviso" },
  { id: "cada_vez_mais", nome: "\"Cada vez mais\"", re: /\bcada vez mais\b/i, sugestao: "Use o dado real em vez da sensação.", severidade: "aviso" },
  { id: "mundo_onde", nome: "\"Em um mundo onde\" / \"Vivemos em uma era\"", re: /\bem um mundo (onde|em que)\b|\bvivemos (em )?uma (era|época)\b/i, sugestao: "Comece direto no fato.", severidade: "erro" },
  { id: "simplesmente", nome: "\"Simplesmente\" / \"Basicamente\"", re: /\b(simplesmente|basicamente)\b/i, sugestao: "Corte: minimiza sem informar.", severidade: "aviso" },
  { id: "na_pratica_abertura", nome: "\"Na prática\" como abertura", re: /^\s*na pr[áa]tica[,:]/i, sugestao: "Vá direto para a prática.", severidade: "aviso" },
  { id: "e_preciso", nome: "\"É preciso\" / \"Devemos\" (tom de coach)", re: /\b([ée] preciso|devemos|precisamos)\b/i, sugestao: "Descreva o que acontece; não prescreva.", severidade: "aviso" },
  // ── Aberturas e fechamentos proibidos ──
  { id: "abertura_meta", nome: "Abertura de preparação (\"Hoje vamos falar\", \"Neste carrossel\")", re: /\b(hoje vamos falar|neste carrossel|nesse carrossel|antes de come[çc]ar|como voc[êe] (provavelmente )?sabe|muitas pessoas perguntam|todo mundo j[áa] ouviu)\b/i, sugestao: "O slide começa no fato, na tensão ou no dado.", severidade: "erro" },
  { id: "fechamento_swipe", nome: "Fechamento com aviso (\"Continue no próximo\", \"Mas tem mais\")", re: /\b(continue no pr[óo]ximo|swipe|arrasta pro lado|arraste para o lado|mas tem mais|n[ãa]o para por a[íi])\b/i, sugestao: "O próximo slide tem de ser inevitável pela tensão, não pelo aviso.", severidade: "erro", escopos: ["slide"] },
  { id: "cta_cordial", nome: "CTA cordial (\"Espero que tenha gostado\", \"Não esqueça de seguir\")", re: /\b(espero que tenha gostado|obrigad[oa] por acompanhar|n[ãa]o esque[çc]a de seguir|se esse conte[úu]do te ajudou|se tiver d[úu]vidas)\b/i, sugestao: "CTA é diretivo: comenta X, recebe Y. Sem agradecimento.", severidade: "erro" },
  // ── Dados sem fonte ──
  { id: "dado_sem_fonte", nome: "Afirmação sem fonte (\"estudos mostram\", \"especialistas dizem\")", re: /\b(estudos (mostram|apontam|indicam)|especialistas (dizem|afirmam|apontam)|pesquisas (mostram|apontam|indicam)|a maioria das (pessoas|lojas|empresas)|muitas (empresas|lojas|marcas))\b/i, sugestao: "Número + fonte + ano. Sem os três não é dado, é opinião.", severidade: "erro" },
  { id: "recentemente", nome: "\"Recentemente\" sem data", re: /\brecentemente\b/i, sugestao: "Dê a data ou o período.", severidade: "aviso" },
  // ── Tipografia e formato ──
  { id: "travessao", nome: "Travessão", re: /—|–/, sugestao: "Regra da casa: sem travessão. Use ponto ou vírgula.", severidade: "erro" },
  { id: "anglicismo_numerico", nome: "Anglicismo numérico (\"10+\", \"5x\", \"2-3 anos\") no corpo", re: /\b\d+\+(?!\d)|\b\d+x\b|\b\d+-\d+ (anos|meses|dias)\b/i, sugestao: "\"mais de 10 anos\", \"cinco vezes maior\", \"dois ou três anos\".", severidade: "aviso", escopos: ["legenda"] },
  // ── Jargão ──
  { id: "jargao", nome: "Jargão corporativo", re: /\b(ecossistema|sinergia|disruptiv[oa]|stakeholders?|mindset|storytelling|overview|alavancar|alavancagem)\b/i, sugestao: "Troque pelo equivalente coloquial (mercado, integração, narrativa, visão geral).", severidade: "aviso" },
]

/** Segunda pessoa — só entra quando o perfil NÃO libera (regra por voz). */
export const REGRA_SEGUNDA_PESSOA: RegraAntiSlop = {
  id: "segunda_pessoa",
  nome: "Segunda pessoa (\"você\", \"seu\") com o perfil em tom jornalístico",
  re: /\b(voc[êe]s?|seus?|suas?|teu|tua)\b/i,
  sugestao: "Este perfil escreve como reportagem: descreva, não aconselhe.",
  severidade: "aviso",
}

export interface OpcoesFiltro {
  /** "você" liberado (default true — é a voz da casa). */
  segundaPessoa?: boolean
}

function acha(re: RegExp, texto: string): string | null {
  const m = re.exec(texto)
  return m ? m[0].trim() : null
}

/** Violações de UM texto, num escopo. */
export function filtrarAntiSlop(texto: string, escopo: EscopoRegra, opts: OpcoesFiltro = {}): Array<Omit<ViolacaoEditorial, "onde" | "frameId" | "campo">> {
  const t = texto ?? ""
  if (!t.trim()) return []
  const regras = opts.segundaPessoa === false ? [...REGRAS_ANTI_SLOP, REGRA_SEGUNDA_PESSOA] : REGRAS_ANTI_SLOP
  const out: Array<Omit<ViolacaoEditorial, "onde" | "frameId" | "campo">> = []
  for (const r of regras) {
    if (r.escopos && !r.escopos.includes(escopo)) continue
    const trecho = acha(r.re, t)
    if (trecho) out.push({ regra: r.id, nome: r.nome, trecho, sugestao: r.sugestao, severidade: r.severidade })
  }
  return out
}

/** Violações do documento inteiro: cada campo de cada frame + legenda. */
export function revisarDocumento(doc: Pick<Documento, "frames" | "legenda">, opts: OpcoesFiltro = {}): ViolacaoEditorial[] {
  const out: ViolacaoEditorial[] = []
  doc.frames.forEach((f, i) => {
    const escopo: EscopoRegra = i === 0 ? "headline" : "slide"
    for (const campo of f.campos) {
      const v = f.textos[campo as Campo]
      if (!v) continue
      for (const x of filtrarAntiSlop(v, escopo, opts)) out.push({ ...x, onde: escopo, frameId: f.frameId, campo: campo as Campo })
    }
  })
  for (const x of filtrarAntiSlop(doc.legenda ?? "", "legenda", opts)) out.push({ ...x, onde: "legenda" })
  return out
}

export const contarErros = (v: ViolacaoEditorial[]): number => v.filter((x) => x.severidade === "erro").length
