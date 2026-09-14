/**
 * Dispositivo — o eixo de SEÇÃO que faltava (Trilha B3, set/2026).
 *
 * A biblioteca era classificada só por `block_type` (hero, body, products,
 * reviews, offer, footer): para o Curador, uma hero de cupom e uma hero de
 * pergunta eram "hero", e o Estruturador só podia pedir "uma hero". No
 * batch 6249aef2 ele descreveu em prosa "uma tese em 3 cards" e o Curador
 * escolheu um bloco de comparação: a prosa não filtra. O dispositivo é o
 * vocabulário FECHADO (22 valores, decisão do dono em 14/09) que os dois
 * lados passam a falar: o Estruturador pede `requisitos.dispositivo`, o
 * código elimina por ele ANTES de qualquer outro requisito, e a variante
 * carrega o seu em `email_component_variants.dispositivo`.
 *
 * O código NÃO inventa o 23º valor. O papel "varredura numerada de 3–4
 * razões" não tem dispositivo exato (o mais próximo é `body_passos`) — é
 * pergunta ao dono do vocabulário, registrada no plano.
 *
 * Puro (zero I/O). Fonte única: o CHECK da migration 20261149 é gerado
 * desta lista e um teste os compara.
 */

export const DISPOSITIVOS = [
  "hero_apresentacao",
  "hero_oferta_cupom",
  "hero_pergunta",
  "hero_lineup",
  "body_tese",
  "body_mecanismo_visual",
  "body_garantias",
  "body_comparacao",
  "body_faq",
  "body_passos",
  "products_grade_preco",
  "products_grade_sem_preco",
  "products_unico_oferta",
  "products_galeria",
  "reviews_2",
  "reviews_3plus",
  "reviews_com_credencial",
  "offer_cupom",
  "offer_sem_cupom",
  "offer_lembrete",
  "footer_nav",
  "footer_minimo",
] as const

export type Dispositivo = (typeof DISPOSITIVOS)[number]

/** Seções da biblioteca (`block_type`) que o vocabulário cobre. */
export type SecaoComDispositivo = "hero" | "body" | "products" | "reviews" | "offer" | "footer"

/** Uma linha por dispositivo — o que o Estruturador lê em `<dispositivos_disponiveis>`. */
export const DESCRICAO_DO_DISPOSITIVO: Record<Dispositivo, string> = {
  hero_apresentacao: "abertura que apresenta a marca ou a peça sem oferta nem pergunta",
  hero_oferta_cupom: "abertura em que a oferta (percentual/cupom) é a manchete",
  hero_pergunta: "abertura com pergunta ao leitor (comparativa, de dúvida, 'posso ajudar?')",
  hero_lineup: "abertura que anuncia conjunto — rotina, kit, linha, coleção",
  body_tese: "um argumento em prosa curta: título + 1–2 parágrafos + CTA",
  body_mecanismo_visual: "mostra COMO funciona com apoio visual (esquema, marcadores, cards de atributo)",
  body_garantias: "selos/garantias/valores da marca em 2–4 itens curtos",
  body_comparacao: "nós × os outros, lado a lado",
  body_faq: "perguntas e respostas",
  body_passos: "lista numerada de passos ou dicas",
  products_grade_preco: "grade de produtos COM preço visível",
  products_grade_sem_preco: "grade de produtos sem preço (nome, foto, botão)",
  products_unico_oferta: "um produto só, com oferta/preço/prazo",
  products_galeria: "produtos apresentados por foto grande, sem grade regular",
  reviews_2: "dois depoimentos",
  reviews_3plus: "três ou mais depoimentos",
  reviews_com_credencial: "depoimentos com credencial do depoente (cargo, idade, contexto, verificado)",
  offer_cupom: "bloco de oferta com código de cupom",
  offer_sem_cupom: "bloco de oferta/condição comercial sem cupom",
  offer_lembrete: "lembrete de cupom já entregue",
  footer_nav: "rodapé com menu de navegação",
  footer_minimo: "rodapé mínimo (legal + poucos links)",
}

export function ehDispositivo(x: unknown): x is Dispositivo {
  return typeof x === "string" && (DISPOSITIVOS as readonly string[]).includes(x)
}

/** `hero_oferta_cupom` → `hero`. */
export function secaoDoDispositivo(d: Dispositivo): SecaoComDispositivo {
  return d.split("_")[0] as SecaoComDispositivo
}

const norm = (s: string) => s.trim().toLowerCase()

/** Dispositivos de uma seção (`block_type`), na ordem do vocabulário. */
export function dispositivosDaSecao(secao: string): Dispositivo[] {
  const s = norm(secao)
  return DISPOSITIVOS.filter((d) => secaoDoDispositivo(d) === s)
}

/** O dispositivo pertence à seção da posição? Seção fora do vocabulário nunca casa. */
export function dispositivoPertenceASecao(d: Dispositivo, secao: string): boolean {
  return secaoDoDispositivo(d) === norm(secao)
}

/**
 * Conflito dispositivo pedido × dispositivo da variante. `null` = sem
 * conflito. Variante SEM dispositivo (biblioteca ainda não classificada)
 * nunca conflita — o filtro é fail-open até o backfill, e é o
 * `dispositivo_sem_variante` da auditoria que denuncia a lacuna.
 */
export function conflitoDeDispositivo(
  daVariante: string | null | undefined,
  pedido: string | null | undefined,
): string | null {
  if (!pedido || !daVariante) return null
  if (norm(daVariante) === norm(pedido)) return null
  return `dispositivo ${daVariante} e a decisão pede ${pedido}`
}
