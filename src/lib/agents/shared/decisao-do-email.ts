/**
 * DecisaoDoEmail — o contrato de decisão de UM e-mail, montado uma vez
 * depois do Estruturador e lido por todo nó a jusante (14/09, migration
 * 20261145).
 *
 * Por que existe: as decisões viviam em quatro lugares (alvo do Seletor,
 * saída do Estruturador, catálogo de objeções, outline) e cada nó lia um
 * subconjunto diferente. A inversão decisão × entregue do batch 6249aef2
 * (3 de 6 posições) aconteceu na FRONTEIRA entre agentes, não dentro deles.
 * Um objeto só, persistido em `store_email_blueprints.decisao`, é o que os
 * validadores (escolha, resgate, blueprint, copy, HTML final) comparam.
 *
 * Puro. `montarDecisao` não lê banco; quem lê é o `generate.service`.
 */

import type { AlvoDoEmail } from "../objecoes/vocabulario"
import type { DecisaoDeIncentivo } from "../objecoes/incentivo"
import type { EstruturadorOutput, RequisitosDaPosicao } from "../estruturador/estruturador-prompt"

export const DECISAO_VERSAO = 1 as const

export interface DecisaoAlvo {
  objecao_id: string | null
  objecao: string | null
  tipo_de_risco: string | null
  aliviador: string | null
  profundidade: string | null
  dimensao: string | null
  trabalhos_fixos: string[]
}

export interface DecisaoIncentivo {
  existe: boolean
  codigo: string | null
  valor: string | null
  origem: string
  traducao_faltante: boolean
}

export interface DecisaoPosicao {
  block_index: number
  section: string
  /** Campo tipado que nasce em B3 (vocabulário fechado). Até lá, null. */
  dispositivo: string | null
  papel: string
  requisitos: RequisitosDaPosicao | null
  exige: string[]
  imagem: string | null
}

export interface DecisaoDescarte {
  section: string | null
  dispositivo: string | null
  motivo: string
}

export interface DecisaoDoEmail {
  versao: typeof DECISAO_VERSAO
  alvo: DecisaoAlvo | null
  incentivo: DecisaoIncentivo
  insumos_permitidos: string[]
  /** Deduplicado entre idiomas (o Seletor emite pares PT/EN da mesma regra). */
  proibido: string[]
  posicoes: DecisaoPosicao[]
  descartes: DecisaoDescarte[]
  fio_narrativo: string | null
}

// ── Dedupe de proibições entre idiomas ───────────────────────────────

/**
 * O Seletor emitiu 28 proibições no batch de referência: 5 em português
 * (da nota de intenção) e 23 em inglês (do catálogo), várias dizendo a
 * mesma coisa — "urgência artificial" e "No artificial urgency, countdown or
 * 'offer ends soon'". O dedupe por chave normalizada não pega o par
 * cruzado. Aqui cada proibição vira um conjunto de FAMÍLIAS (cupom,
 * urgência, fundação…) e duas proibições com o mesmo conjunto de famílias
 * e o mesmo sentido são uma só; a que vem primeiro fica (a do contrato).
 *
 * Proibição sem família reconhecida NÃO é deduplicada por sentido — só
 * por texto normalizado. Deduplicar de menos custa uma linha repetida no
 * prompt; deduplicar demais apaga uma regra.
 */
const FAMILIAS: Array<{ nome: string; re: RegExp }> = [
  { nome: "incentivo", re: /\b(cupom|coupon|c[oó]digo|code|incentiv|oferta|offer|desconto|discount|promo|bundle|buy \d)/i },
  { nome: "urgencia", re: /\b(urg[eê]nc|countdown|ends soon|termina|expira|expiry|prazo|deadline)/i },
  { nome: "fundacao", re: /\b(funda[cç][aã]o|founding|origem longa|hist[oó]ria longa|long .*story)/i },
  { nome: "engajamento", re: /\b(engajamento|engagement|rede social|social follow|prefer[eê]nc|preference)/i },
  { nome: "empilhar", re: /\b(esgotar|stacking|uma obje[cç][aã]o s[oó]|attack obj_\w+ only)/i },
  { nome: "resistencia", re: /\b83%|more resistant|resistente/i },
  { nome: "corte", re: /\b(cut-pattern|padr[aã]o de corte|engineering|pattern details)/i },
  { nome: "qualidade", re: /\b(quality-control|controle de qualidade|inspection|inspe[cç][aã]o)/i },
  { nome: "frete", re: /\b(shipping|frete|entrega|carrier|transportadora|tracking|delivery)/i },
  { nome: "taxas", re: /\b(all-in pricing|duty|hidden fees|taxas|imposto)/i },
  { nome: "suporte", re: /\b(support|suporte|response time|tempo de resposta|contact policy)/i },
  { nome: "pagamento", re: /\b(secure payment|pagamento seguro|trust badge|selo|checkout|pci)/i },
  { nome: "troca", re: /\b(return|exchange|troca|devolu[cç][aã]o|refund|policy page)/i },
  { nome: "depoimento", re: /\b(testimonial|depoimento|reviewer|avalia[cç][aã]o|review)/i },
]

function chaveDeTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function familiasDe(s: string): string {
  return FAMILIAS.filter((f) => f.re.test(s)).map((f) => f.nome).sort().join("+")
}

export function dedupeProibicoes(lista: readonly string[]): string[] {
  const out: string[] = []
  const vistas = new Set<string>()
  const familiasVistas = new Set<string>()
  for (const raw of lista) {
    const texto = (raw ?? "").trim()
    if (!texto) continue
    const chave = chaveDeTexto(texto)
    if (vistas.has(chave)) continue
    const fam = familiasDe(texto)
    if (fam && familiasVistas.has(fam)) continue
    vistas.add(chave)
    if (fam) familiasVistas.add(fam)
    out.push(texto)
  }
  return out
}

// ── Montagem ─────────────────────────────────────────────────────────

export function montarDecisao(p: {
  alvo: AlvoDoEmail | null
  estruturador: EstruturadorOutput
  incentivo: DecisaoDeIncentivo
}): DecisaoDoEmail {
  const primaria = p.alvo?.alvos.find((a) => a.primaria) ?? p.alvo?.alvos[0] ?? null
  const alvo: DecisaoAlvo | null = p.alvo
    ? {
        objecao_id: primaria?.id ?? null,
        objecao: primaria?.objecao ?? null,
        tipo_de_risco: primaria?.tipo_de_risco ?? null,
        aliviador: primaria?.aliviador_pedido ?? null,
        profundidade: primaria?.profundidade_de_prova ?? null,
        dimensao: p.alvo.dimensao_confianca ?? null,
        trabalhos_fixos: [...p.alvo.trabalhos_fixos],
      }
    : null
  const posicoes: DecisaoPosicao[] = p.estruturador.estrutura.map((pos, i) => ({
    block_index: i,
    section: pos.section,
    dispositivo: null,
    papel: pos.papel,
    requisitos: pos.requisitos ?? null,
    exige: pos.requisitos?.exige ?? [],
    imagem: pos.requisitos?.imagem ?? null,
  }))
  const descartes: DecisaoDescarte[] = (p.estruturador.descartes ?? []).map((d) => ({
    section: d.section ?? null,
    dispositivo: null,
    motivo: [d.papel_na_referencia, d.porque].filter(Boolean).join(" — "),
  }))
  return {
    versao: DECISAO_VERSAO,
    alvo,
    incentivo: {
      existe: p.incentivo.existe,
      codigo: p.incentivo.codigo,
      valor: p.incentivo.valor,
      origem: p.incentivo.origem,
      traducao_faltante: p.incentivo.traducao_faltante,
    },
    insumos_permitidos: [...(p.alvo?.insumos_permitidos ?? [])],
    proibido: dedupeProibicoes(p.alvo?.proibido_neste_toque ?? []),
    posicoes,
    descartes,
    fio_narrativo: p.estruturador.fio_narrativo?.trim() || null,
  }
}

/** Leitura tolerante do JSONB gravado (versão desconhecida → null). */
export function lerDecisao(raw: unknown): DecisaoDoEmail | null {
  if (!raw || typeof raw !== "object") return null
  const d = raw as Partial<DecisaoDoEmail>
  if (d.versao !== DECISAO_VERSAO || !Array.isArray(d.posicoes) || !d.incentivo) return null
  return d as DecisaoDoEmail
}
