/**
 * Vocabulário de tokens de ATRIBUTO da biblioteca de variantes (Fase 0 do
 * endereçamento sem placeholder).
 *
 * Os HTMLs das variantes marcam os slots de imagem direto nos atributos —
 * `src="URL_DA_IMAGEM_1"`, `alt="ALT_PRODUTO_3"`, `src="URL_DO_LOGO_AQUI"` —
 * e nunca adotaram `{{TAG}}`. A regra de reconhecimento é por FORMA, não por
 * lista fechada: valor de atributo inteiramente SCREAMING_SNAKE é token.
 * Uma lista fechada quebraria no primeiro slot novo que o designer nomeasse;
 * a forma cobre o que existe (inventário de 20/08 sobre as 38 variantes
 * ativas — ver scripts/inventario-attr-tokens.ts para re-derivar do banco)
 * e o que vier no mesmo padrão.
 *
 * O que NUNCA é slot se autodenuncia no próprio valor:
 *   - `data:image/...;base64` — arte fixa da biblioteca (ícones sociais,
 *     selos): fica exatamente como o designer desenhou.
 *   - URL http(s) real (resquício de export do Figma) ou caminho relativo.
 *
 * Puro (zero I/O) — client-safe.
 */

/** Forma de um token: SCREAMING_SNAKE, 3+ caracteres, começa com letra. */
export const TOKEN_SHAPE = /^[A-Z][A-Z0-9_]{2,}$/

/**
 * Tokens ESTRUTURAIS: preenchidos pela plataforma (dados da loja ou merge
 * tag do provedor), não pela copy do bloco nem pelo agente de imagem.
 * Inventário real:
 *   - URL_DO_LOGO_AQUI  → logo da loja (src)
 *   - NOME_DA_MARCA     → nome da loja (alt do logo E texto corrido)
 *   - URL_UNSUBSCRIBE   → merge tag de descadastro do ESP (href)
 *   - URL_PREFERENCIAS  → merge tag da central de preferências (href)
 * Lista explícita de propósito — estrutural é decisão, não forma.
 *
 * Os dois de href entraram em 20/08 junto com o cadastro do output_schema
 * dos rodapés (migration 20261075). Sem eles o rodapé montava e o check de
 * compliance passava — a palavra "Unsubscribe" estava lá —, mas o link não
 * clicava: `stripUnresolvedAttrTokens` esvaziava o href e
 * `neutralizeDeadLinks` o removia. Link de descadastro sem destino é pior
 * que rodapé ausente, porque a ausência pelo menos dispara o aviso.
 *
 * NÃO cobre os demais tokens de href da biblioteca — CTA
 * (`URL_DO_CTA_AQUI` e família, 60+ ocorrências), site e redes sociais.
 * Aqueles dependem de destino de campanha e de dados da loja que não
 * chegam neste ponto; seguem virando `<a>` sem href, reportados pelo
 * render-checks como "link sem destino".
 */
export const STRUCTURAL_TOKENS = new Set([
  "URL_DO_LOGO_AQUI",
  "NOME_DA_MARCA",
  "URL_UNSUBSCRIBE",
  "URL_PREFERENCIAS",
])

/** Arte fixa da biblioteca — nunca é slot, nunca é tocada. */
export const FIXED_ART_SRC = /^data:image\//i

export interface AttrToken {
  raw: string
  /** Base sem o sufixo de ordem: "URL_FOTO_PEQUENA_2B" → "URL_FOTO_PEQUENA". */
  base: string
  /** Sufixo numérico ("URL_PRODUTO_3" → 3). null quando não há. */
  ordinal: number | null
  /** Sub-letra de grade ("2B" → "B"; "URL_TOPO_COLUNA_A" → "A"). */
  sub: string | null
}

/**
 * Interpreta o sufixo de ordem de um token.
 *   URL_PRODUTO_3        → { base: URL_PRODUTO,       ordinal: 3, sub: null }
 *   URL_FOTO_PEQUENA_2B  → { base: URL_FOTO_PEQUENA,  ordinal: 2, sub: "B" }
 *   URL_TOPO_COLUNA_A    → { base: URL_TOPO_COLUNA,   ordinal: null, sub: "A" }
 *   URL_DO_LOGO_AQUI     → { base: URL_DO_LOGO_AQUI,  ordinal: null, sub: null }
 *     ("AQUI" tem mais de uma letra — é parte do nome, não ordem)
 * Devolve null para valor que não tem a forma de token.
 */
export function parseAttrToken(raw: string): AttrToken | null {
  const value = raw.trim()
  if (!TOKEN_SHAPE.test(value)) return null

  const numbered = /^(.*)_(\d+)([A-Z])?$/.exec(value)
  if (numbered) {
    return {
      raw: value,
      base: numbered[1],
      ordinal: Number(numbered[2]),
      sub: numbered[3] ?? null,
    }
  }
  const lettered = /^(.*)_([A-Z])$/.exec(value)
  if (lettered) {
    return { raw: value, base: lettered[1], ordinal: null, sub: lettered[2] }
  }
  return { raw: value, base: value, ordinal: null, sub: null }
}

/** Token que a PLATAFORMA preenche (logo, nome da marca). */
export function isStructuralToken(raw: string): boolean {
  return STRUCTURAL_TOKENS.has(raw.trim())
}

/** Token de texto alternativo (ALT_*) — nesta rodada só é LIMPO, não preenchido. */
export function isAltToken(raw: string): boolean {
  return /^ALT_/.test(raw.trim())
}

/**
 * URL "de verdade" — resquício de export (Figma) ou asset externo. Não é
 * slot: o valor já resolve para uma imagem real e não há o que casar.
 */
export function isResidualUrl(src: string): boolean {
  const v = src.trim()
  return /^(https?:)?\/\//i.test(v) || v.startsWith("/") || v.startsWith("#")
}

/**
 * O valor de atributo É um slot do vocabulário?
 * (forma de token E não é arte fixa E não é URL real)
 */
export function isAttrToken(value: string): boolean {
  const v = value.trim()
  if (FIXED_ART_SRC.test(v) || isResidualUrl(v)) return false
  return TOKEN_SHAPE.test(v)
}
