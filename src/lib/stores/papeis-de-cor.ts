/**
 * Papéis de cor da identidade visual — vocabulário FECHADO (Trilha B5).
 *
 * `BrandColor.role` era texto livre com a convenção "Principal | Fundo |
 * Destaque" aplicada só pela UI. Duas consequências medidas em 14/09: as
 * três lojas de teste têm DUAS cores "Principal" e nenhuma "Fundo"/"Texto"
 * (o papel de cada uma é adivinhado pela luminância), e não havia como
 * declarar `texto` nem `superficie` — os tokens {{COR_TEXTO}} e
 * {{COR_SUPERFICIE}} saíam sempre derivados.
 *
 * Aqui vive a normalização (legado capitalizado e com acento entra e sai
 * minúsculo) e a régua "no máximo uma principal". Puro (zero I/O).
 */

export const PAPEIS_DE_COR = ["principal", "fundo", "texto", "destaque", "superficie"] as const

export type PapelDeCor = (typeof PAPEIS_DE_COR)[number]

export const ROTULO_DO_PAPEL: Record<PapelDeCor, string> = {
  principal: "Principal — botões e títulos",
  fundo: "Fundo — canvas do e-mail",
  texto: "Texto — cor do corpo",
  destaque: "Destaque — acento pontual",
  superficie: "Superfície — painéis e faixas",
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")

/**
 * "Principal" → "principal"; "Superfície" → "superficie"; "Secundário",
 * "" e qualquer rótulo fora do vocabulário → "" (sem papel). Sem papel não
 * é erro: a derivação por luminância continua valendo para a cor.
 */
export function normalizarPapel(raw: unknown): PapelDeCor | "" {
  if (typeof raw !== "string") return ""
  const t = semAcento(raw.trim().toLowerCase())
  return (PAPEIS_DE_COR as readonly string[]).includes(t) ? (t as PapelDeCor) : ""
}

export function ehPapelDeCor(x: unknown): x is PapelDeCor {
  return typeof x === "string" && (PAPEIS_DE_COR as readonly string[]).includes(x)
}

export interface CorComPapel {
  hex?: string
  role?: string | null
}

/**
 * A paleta inteira (primária + secundária) aceita UMA `principal`.
 *
 * Duas principais não são "duas cores importantes": são a ausência de
 * decisão sobre qual pinta o botão, e a derivação escolhe a primeira por
 * ordem de cadastro — que ninguém escolheu. Devolve o código que a API e o
 * gate usam (`paleta_dois_principais`).
 */
export function validarPaleta(
  primarias: CorComPapel[] = [],
  secundarias: CorComPapel[] = [],
): { ok: true } | { ok: false; codigo: "paleta_dois_principais"; mensagem: string } {
  const principais = [...primarias, ...secundarias].filter((c) => normalizarPapel(c.role) === "principal")
  if (principais.length <= 1) return { ok: true }
  return {
    ok: false,
    codigo: "paleta_dois_principais",
    mensagem: `A paleta tem ${principais.length} cores marcadas como "Principal" (${principais.map((c) => c.hex ?? "?").join(", ")}). Só uma pode ser a principal — marque as outras como fundo, texto, destaque ou superfície.`,
  }
}
