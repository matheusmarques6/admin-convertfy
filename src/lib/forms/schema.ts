/**
 * A ponte entre as duas representações do mesmo formulário.
 *
 * `crm_form_fields` (uma linha por campo) é a forma histórica, viva, que
 * o editor clássico e o submit usam. `form_versions.schema` (um JSONB
 * imutável) é a forma publicada, que o conversacional precisa porque
 * carrega o que a tabela não tem: lógica de salto, finais e a tela de
 * abertura.
 *
 * As duas convivem de propósito e por tempo indeterminado. Migrar tudo
 * de uma vez exigiria reescrever o submit, o dispatch de conversão e o
 * mapeamento de lead na mesma janela — e a "Pagina de vendas" está no ar
 * com verba em cima. A regra que impede as duas de divergirem é uma só:
 * **o `ref` é o `crm_form_fields.id`**, então qualquer lado consegue
 * encontrar o outro sem tradução.
 *
 * `normalizarSchema` nunca lança. JSONB do banco pode ser `{}`, pode ser
 * de uma versão anterior e pode ter sido editado à mão; derrubar o
 * formulário público por causa disso seria trocar um campo faltando por
 * uma página de erro.
 */

import type {
  FaixaDePontuacao,
  FormBlock,
  FormBlockType,
  FormEnding,
  FormOption,
  FormSchema,
  LogicCondition,
  LogicRule,
} from "@/types/forms-conversational"
import { POLITICAS_DE_DUPLICADO } from "@/types/forms-conversational"
import type { QualifiedOperator } from "@/types/form-tracking"
import { normalizarMidia } from "./midia"
import { normalizarDestino } from "./destino"

/** A linha de `crm_form_fields`, como as rotas a selecionam. */
export interface CampoLegado {
  id: string
  field_type: string
  label: string
  placeholder?: string | null
  description?: string | null
  required?: boolean | null
  position?: number | null
  options?: unknown
  validation?: unknown
  map_to_lead_field?: string | null
  media?: unknown
}

const TIPOS: ReadonlySet<string> = new Set<FormBlockType>([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "url",
  "cpf",
  "cnpj",
  "cep",
  "statement",
  "multi_select",
  "yes_no",
  "nps",
  "rating",
  "schedule",
])

const OPERADORES: ReadonlySet<string> = new Set<QualifiedOperator>([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_set",
])

/**
 * Opções: o banco guarda `string[]` OU `{label, value}[]`, dependendo de
 * quando o campo foi criado. Normalizamos para o objeto, mas o `value`
 * de uma opção-string continua sendo o próprio texto — trocá-lo por um
 * slug quebraria a regra do evento qualificado, que compara com o texto.
 */
export function normalizarOpcoes(raw: unknown): FormOption[] {
  if (!Array.isArray(raw)) return []
  const out: FormOption[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim()
      if (t) out.push({ label: t, value: t })
      continue
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>
      const label = typeof o.label === "string" ? o.label : typeof o.value === "string" ? o.value : ""
      const value = typeof o.value === "string" ? o.value : label
      if (label || value) {
        const piso = typeof o.piso === "number" && Number.isFinite(o.piso) ? o.piso : undefined
        const valor = typeof o.valor === "number" && Number.isFinite(o.valor) ? o.valor : undefined
        const moeda =
          o.moeda === "BRL" || o.moeda === "USD" || o.moeda === "EUR" ? o.moeda : undefined
        out.push({
          label: label || value,
          value: value || label,
          ...(typeof o.atalho === "string" && o.atalho ? { atalho: o.atalho } : {}),
          ...(piso !== undefined ? { piso } : {}),
          ...(valor !== undefined ? { valor } : {}),
          ...(moeda ? { moeda } : {}),
          ...(typeof o.tag === "string" && o.tag.trim() ? { tag: o.tag.trim() } : {}),
        })
      }
    }
  }
  return out
}

function normalizarValidacao(raw: unknown): FormBlock["validation"] {
  if (!raw || typeof raw !== "object") return undefined
  const v = raw as Record<string, unknown>
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined)
  const out: NonNullable<FormBlock["validation"]> = {}
  if (num(v.min) !== undefined) out.min = num(v.min)
  if (num(v.max) !== undefined) out.max = num(v.max)
  if (num(v.minLength) !== undefined) out.minLength = num(v.minLength)
  if (num(v.maxLength) !== undefined) out.maxLength = num(v.maxLength)
  if (num(v.minEscolhas) !== undefined) out.minEscolhas = num(v.minEscolhas)
  if (num(v.maxEscolhas) !== undefined) out.maxEscolhas = num(v.maxEscolhas)
  if (typeof v.pattern === "string" && v.pattern) out.pattern = v.pattern
  if (typeof v.countryCode === "boolean") out.countryCode = v.countryCode
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizarCondicao(raw: unknown): LogicCondition | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  const ref = typeof c.ref === "string" ? c.ref : typeof c.field_id === "string" ? c.field_id : ""
  const op = typeof c.operator === "string" && OPERADORES.has(c.operator) ? c.operator : ""
  if (!ref || !op) return null
  return { ref, operator: op as QualifiedOperator, value: c.value as LogicCondition["value"] }
}

function normalizarRegra(raw: unknown): LogicRule | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const goto = typeof r.goto === "string" ? r.goto : ""
  if (!goto) return null
  const conditions = Array.isArray(r.conditions)
    ? r.conditions.map(normalizarCondicao).filter((c): c is LogicCondition => c !== null)
    : []
  // Regra sem condição válida nunca casa (é o que a engine faz). Guardá-la
  // preserva o que o operador montou — apagar aqui faria o editor perder
  // a regra pela metade sem dizer nada.
  const set = Array.isArray(r.set)
    ? (r.set as unknown[])
        .map((s) => {
          if (!s || typeof s !== "object") return null
          const o = s as Record<string, unknown>
          if (typeof o.nome !== "string" || !o.nome) return null
          const operacao = o.operacao === "add" ? "add" : "set"
          const valor = typeof o.valor === "number" || typeof o.valor === "string" ? o.valor : 0
          return { nome: o.nome, operacao: operacao as "set" | "add", valor }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : undefined
  return {
    conditions,
    logic: r.logic === "or" ? "or" : "and",
    goto,
    ...(set && set.length > 0 ? { set } : {}),
  }
}

function normalizarBloco(raw: unknown): FormBlock | null {
  if (!raw || typeof raw !== "object") return null
  const b = raw as Record<string, unknown>
  // `field_id` é o nome no backfill da 20261144; `ref` é o nome canônico.
  const ref = typeof b.ref === "string" ? b.ref : typeof b.field_id === "string" ? b.field_id : ""
  if (!ref) return null
  const tipoBruto = typeof b.type === "string" ? b.type : typeof b.field_type === "string" ? b.field_type : "text"
  // Tipo desconhecido vira `text` em vez de sumir: o campo continua
  // coletando resposta, só perde a máscara. Descartá-lo apagaria uma
  // pergunta do formulário publicado.
  const type = (TIPOS.has(tipoBruto) ? tipoBruto : "text") as FormBlockType
  const logic = Array.isArray(b.logic)
    ? b.logic.map(normalizarRegra).filter((r): r is LogicRule => r !== null)
    : undefined
  // `media` é o nome da coluna; `midia` é o nome no schema. Os dois são
  // lidos porque a normalização roda tanto sobre a linha do banco quanto
  // sobre um schema já publicado.
  const midia = normalizarMidia(b.midia ?? b.media)

  return {
    ref,
    type,
    ...(typeof b.alias === "string" && b.alias.trim() ? { alias: b.alias.trim() } : {}),
    label: typeof b.label === "string" ? b.label : "",
    description: typeof b.description === "string" ? b.description : null,
    placeholder: typeof b.placeholder === "string" ? b.placeholder : null,
    required: Boolean(b.required),
    options: normalizarOpcoes(b.options),
    validation: normalizarValidacao(b.validation),
    map_to_lead_field:
      typeof b.map_to_lead_field === "string" && b.map_to_lead_field ? b.map_to_lead_field : null,
    ...(logic && logic.length > 0 ? { logic } : {}),
    ...(b.mesma_tela === true ? { mesma_tela: true } : {}),
    ...(typeof b.proximo === "string" && b.proximo.trim()
      ? { proximo: b.proximo.trim() }
      : {}),
    ...(b.opcoes_por_moeda === true ? { opcoes_por_moeda: true } : {}),
    ...(typeof b.moeda_de === "string" && b.moeda_de ? { moeda_de: b.moeda_de } : {}),
    ...(typeof b.variavel === "string" && b.variavel.trim()
      ? { variavel: b.variavel.trim() }
      : {}),
    ...(typeof b.titulo_da_tela === "string" && b.titulo_da_tela.trim()
      ? { titulo_da_tela: b.titulo_da_tela.trim() }
      : {}),
    ...(midia ? { midia } : {}),
    ...(b.destaque === true ? { destaque: true } : {}),
    ...(b.hidden === true || tipoBruto === "hidden" ? { hidden: true } : {}),
    // Os quatro do handoff. Cada um precisa passar por AQUI, senão o
    // primeiro Publicar (que normaliza) os apaga em silêncio — foi assim
    // que o destino do final sumiu uma vez.
    ...(b.outro === true ? { outro: true } : {}),
    ...(b.embaralhar === true ? { embaralhar: true } : {}),
    ...(normalizarPontos(b.pontos) ? { pontos: normalizarPontos(b.pontos)! } : {}),
    ...(normalizarEscala(b.escala) ? { escala: normalizarEscala(b.escala)! } : {}),
  }
}

/** `{ value → pontos }`. Chave vazia e número inválido caem fora. */
export function normalizarPontos(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.trim()) continue
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
    if (Number.isFinite(n)) out[k] = n
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizarEscala(raw: unknown): FormBlock["escala"] | null {
  if (!raw || typeof raw !== "object") return null
  const e = raw as Record<string, unknown>
  const min = typeof e.min_label === "string" && e.min_label.trim() ? e.min_label.trim() : null
  const max = typeof e.max_label === "string" && e.max_label.trim() ? e.max_label.trim() : null
  if (!min && !max) return null
  return { min_label: min, max_label: max }
}

/**
 * Faixas de pontuação, saneadas: `de`/`ate` numéricos, `de <= ate`
 * (invertida é trocada, não descartada — quem digitou "10 a 3" quis
 * "3 a 10"). Ordem preservada: a primeira que contém o total vence.
 */
export function normalizarFaixas(raw: unknown): FaixaDePontuacao[] {
  if (!Array.isArray(raw)) return []
  const out: FaixaDePontuacao[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const f = item as Record<string, unknown>
    const de = Number(f.de)
    const ate = Number(f.ate)
    if (!Number.isFinite(de) || !Number.isFinite(ate)) continue
    out.push({
      de: Math.min(de, ate),
      ate: Math.max(de, ate),
      stage_id: typeof f.stage_id === "string" && f.stage_id ? f.stage_id : null,
      tag: typeof f.tag === "string" && f.tag.trim() ? f.tag.trim() : null,
    })
  }
  return out
}

/**
 * Toda tela tem um começo.
 *
 * `mesma_tela` quer dizer "divide a tela com a ANTERIOR", e o primeiro
 * bloco visível não tem anterior. A marca sobra ali o tempo todo — basta
 * reordenar as perguntas no editor e a que estava agrupada vira a
 * primeira. Sem esta limpeza, `inicioDaTela` andaria para trás até o
 * índice 0 e a tela ficaria sem cabeça: quem consome (progresso,
 * caminho, Voltar) passaria a decidir cada um por conta.
 */
function primeiraTelaTemCabeca(blocks: FormBlock[]): FormBlock[] {
  const i = blocks.findIndex((b) => !b.hidden)
  if (i < 0 || !blocks[i].mesma_tela) return blocks
  const copia = [...blocks]
  const semMarca = { ...copia[i] }
  delete semMarca.mesma_tela
  copia[i] = semMarca
  return copia
}

function normalizarEnding(raw: unknown): FormEnding | null {
  if (!raw || typeof raw !== "object") return null
  const e = raw as Record<string, unknown>
  const ref = typeof e.ref === "string" ? e.ref : ""
  if (!ref) return null
  return {
    ref,
    title: typeof e.title === "string" ? e.title : "",
    description: typeof e.description === "string" ? e.description : null,
    redirect_url: typeof e.redirect_url === "string" && e.redirect_url ? e.redirect_url : null,
    button_label: typeof e.button_label === "string" && e.button_label ? e.button_label : null,
    button_url: typeof e.button_url === "string" && e.button_url ? e.button_url : null,
    // O destino tem de ser normalizado AQUI. Campo que o normalizador
    // não conhece é descartado, e este roda no GET público e na
    // publicação: sem esta linha, o WhatsApp configurado no editor
    // sumiria no primeiro clique em Publicar, sem erro nenhum.
    destino: normalizarDestino(e.destino),
    ...(e.disqualified === true ? { disqualified: true } : {}),
    // As duas também precisam sobreviver ao normalizador: elas decidem
    // se o cadastro vira card na pipeline e com que marca. Perdidas num
    // Publicar, o funil que recusa passaria a encher o Inbound.
    ...(Array.isArray(e.tags)
      ? { tags: e.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "") }
      : {}),
    ...(e.cria_negocio === false ? { cria_negocio: false } : {}),
  }
}

/** Coage o JSONB cru. Nunca lança; schema ilegível vira schema vazio. */
export function normalizarSchema(raw: unknown): FormSchema {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  // O backfill da 20261144 gravou a lista como `fields`; o editor grava
  // como `blocks`. Os dois são lidos.
  const listaBruta = Array.isArray(s.blocks) ? s.blocks : Array.isArray(s.fields) ? s.fields : []
  const blocks = primeiraTelaTemCabeca(
    listaBruta.map(normalizarBloco).filter((b): b is FormBlock => b !== null),
  )
  const endings = Array.isArray(s.endings)
    ? s.endings.map(normalizarEnding).filter((e): e is FormEnding => e !== null)
    : []

  const cfg = (s.settings && typeof s.settings === "object" ? s.settings : {}) as Record<string, unknown>
  const calculos = Array.isArray(cfg.calculos)
    ? cfg.calculos
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>
          const nome = typeof o.nome === "string" ? o.nome.trim() : ""
          const expressao = typeof o.expressao === "string" ? o.expressao.trim() : ""
          if (!nome || !expressao) return null
          const formato = o.formato === "dinheiro" ? ("dinheiro" as const) : ("numero" as const)
          return { nome, expressao, formato }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
    : []

  const welcomeBruto = (cfg.welcome && typeof cfg.welcome === "object" ? cfg.welcome : null) as
    | Record<string, unknown>
    | null

  const faixas = normalizarFaixas(cfg.faixas)
  const textos: Record<string, string> = {}
  if (cfg.textos && typeof cfg.textos === "object" && !Array.isArray(cfg.textos)) {
    for (const [k, v] of Object.entries(cfg.textos as Record<string, unknown>)) {
      if (k.trim() && typeof v === "string" && v.trim()) textos[k] = v
    }
  }
  const limite =
    typeof cfg.limite_envios === "number" && Number.isFinite(cfg.limite_envios) && cfg.limite_envios > 0
      ? Math.trunc(cfg.limite_envios)
      : null
  const duplicado =
    typeof cfg.duplicado === "string" && (POLITICAS_DE_DUPLICADO as readonly string[]).includes(cfg.duplicado)
      ? (cfg.duplicado as (typeof POLITICAS_DE_DUPLICADO)[number])
      : undefined

  return {
    version: typeof s.version === "number" ? s.version : 1,
    display_mode: s.display_mode === "conversational" ? "conversational" : "classic",
    locale: typeof s.locale === "string" && s.locale ? s.locale : "pt-BR",
    blocks,
    endings,
    hidden_fields: Array.isArray(s.hidden_fields)
      ? s.hidden_fields.filter((x): x is string => typeof x === "string")
      : [],
    settings: {
      mostrar_progresso: cfg.mostrar_progresso === undefined ? true : Boolean(cfg.mostrar_progresso),
      enter_avanca: cfg.enter_avanca === undefined ? true : Boolean(cfg.enter_avanca),
      rotulo_avancar: typeof cfg.rotulo_avancar === "string" ? cfg.rotulo_avancar : undefined,
      ...(calculos.length > 0 ? { calculos } : {}),
      ...(welcomeBruto && typeof welcomeBruto.title === "string" && welcomeBruto.title
        ? {
            welcome: {
              title: welcomeBruto.title,
              description:
                typeof welcomeBruto.description === "string" ? welcomeBruto.description : null,
              button_label:
                typeof welcomeBruto.button_label === "string" ? welcomeBruto.button_label : undefined,
              ...(normalizarMidia(welcomeBruto.midia)
                ? { midia: normalizarMidia(welcomeBruto.midia) }
                : {}),
            },
          }
        : {}),
      ...(faixas.length > 0 ? { faixas } : {}),
      ...(Object.keys(textos).length > 0 ? { textos } : {}),
      ...(cfg.fechado === true ? { fechado: true } : {}),
      ...(typeof cfg.mensagem_fechado === "string" && cfg.mensagem_fechado.trim()
        ? { mensagem_fechado: cfg.mensagem_fechado.trim() }
        : {}),
      ...(limite !== null ? { limite_envios: limite } : {}),
      ...(duplicado ? { duplicado } : {}),
    },
  }
}

/** Monta o schema a partir das linhas de `crm_form_fields`. */
export function schemaDeCampos(
  campos: CampoLegado[],
  opts: { display_mode?: "classic" | "conversational"; locale?: string; version?: number } = {},
): FormSchema {
  const ordenados = [...campos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return normalizarSchema({
    version: opts.version ?? 1,
    display_mode: opts.display_mode ?? "classic",
    locale: opts.locale ?? "pt-BR",
    blocks: ordenados.map((c) => ({
      ref: c.id,
      type: c.field_type,
      label: c.label,
      placeholder: c.placeholder,
      description: c.description,
      required: c.required,
      options: c.options,
      validation: c.validation,
      map_to_lead_field: c.map_to_lead_field,
      midia: c.media,
    })),
  })
}

/**
 * Volta para o formato que o renderizador clássico e o submit consomem.
 *
 * Os blocos que só o conversacional tem (`statement`) NÃO atravessam: no
 * clássico eles não coletam nada e apareceriam como campo vazio.
 */
export function camposDoSchema(schema: FormSchema): CampoLegado[] {
  return schema.blocks
    .filter((b) => b.type !== "statement")
    .map((b, i) => ({
      id: b.ref,
      field_type: b.hidden ? "hidden" : b.type,
      label: b.label,
      placeholder: b.placeholder ?? null,
      description: b.description ?? null,
      required: Boolean(b.required),
      position: i,
      options: (b.options ?? []).map((o) => (o.label === o.value ? o.value : o)),
      validation: b.validation ?? {},
      map_to_lead_field: b.map_to_lead_field ?? null,
      media: b.midia ?? null,
    }))
}
