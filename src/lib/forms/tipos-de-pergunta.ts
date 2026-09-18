/**
 * O vocabulário dos tipos de pergunta — UMA fonte.
 *
 * Antes eram quatro listas escritas à mão: `FIELD_TYPES` no editor (13
 * tipos, sem os do handoff), `TIPO_CURTO` na espinha (12), outro
 * `TIPO_CURTO` no editor de fluxo (15) e o `switch` de cada renderer.
 * Acrescentar um tipo acertava uma e deixava as outras para trás, em
 * silêncio — e o defeito aparecia como "a pergunta some do fluxo" ou
 * "o seletor não oferece o tipo que a espinha mostra". Aqui o tipo é
 * declarado uma vez, com grupo, rótulos, o que ele carrega e o que ele
 * exige do resto do sistema.
 *
 * A lista é FECHADA de propósito: `tipos-no-check.test.ts` compara o que
 * este arquivo declara com o CHECK do banco, e um tipo novo sem migration
 * reprova ali em vez de tomar 23514 no primeiro save.
 */

import type { FormBlockType } from "@/types/forms-conversational"

export type GrupoDeTipo = "contato" | "escolha" | "texto" | "nota" | "tempo" | "estrutura"

export interface DefinicaoDeGrupo {
  id: GrupoDeTipo
  nome: string
  /** Cor do ícone; o fundo do quadrado é a mesma cor a 12%. */
  cor: string
}

/** A ordem daqui é a ordem do seletor. */
export const GRUPOS_DE_TIPO: readonly DefinicaoDeGrupo[] = [
  { id: "contato", nome: "Contato", cor: "#2563EB" },
  { id: "escolha", nome: "Escolha", cor: "#7C3AED" },
  { id: "texto", nome: "Texto & número", cor: "#0F766E" },
  { id: "nota", nome: "Avaliação", cor: "#D97706" },
  { id: "tempo", nome: "Data & agenda", cor: "#DB2777" },
  { id: "estrutura", nome: "Estrutura", cor: "#6B7280" },
]

export interface DefinicaoDeTipo {
  tipo: FormBlockType
  grupo: GrupoDeTipo
  /** Nome no seletor e no inspetor ("Telefone / WhatsApp"). */
  nome: string
  /** Rótulo curto na espinha e no fluxo ("Telefone"). */
  curto: string
  /** Campo do lead que o tipo costuma preencher — vira "→ CRM" no seletor. */
  crm?: string
  /** Texto de exemplo com que a pergunta nasce. */
  placeholder?: string
  /** A resposta é uma das `options` (o inspetor mostra a lista). */
  comOpcoes?: boolean
  /** Só o formato conversacional o desenha. */
  soConversacional?: boolean
  /** Fica fora do seletor: existe por compatibilidade, não se cria mais. */
  legado?: boolean
}

export const TIPOS_DE_PERGUNTA: readonly DefinicaoDeTipo[] = [
  // Contato
  { tipo: "text", grupo: "contato", nome: "Nome", curto: "Texto", crm: "first_name", placeholder: "Seu primeiro nome" },
  { tipo: "email", grupo: "contato", nome: "E-mail", curto: "E-mail", crm: "email", placeholder: "voce@sualoja.com" },
  { tipo: "phone", grupo: "contato", nome: "Telefone / WhatsApp", curto: "Telefone", crm: "phone", placeholder: "(11) 99999-9999" },
  { tipo: "url", grupo: "contato", nome: "Site / URL", curto: "Site", placeholder: "https://sualoja.com" },
  // Escolha
  { tipo: "radio", grupo: "escolha", nome: "Escolha única", curto: "Escolha", comOpcoes: true },
  { tipo: "multi_select", grupo: "escolha", nome: "Múltipla escolha", curto: "Várias", comOpcoes: true, soConversacional: true },
  { tipo: "yes_no", grupo: "escolha", nome: "Sim / Não", curto: "Sim/Não" },
  { tipo: "select", grupo: "escolha", nome: "Lista suspensa", curto: "Lista", comOpcoes: true },
  // Texto & número
  { tipo: "textarea", grupo: "texto", nome: "Texto longo", curto: "Texto longo", placeholder: "Conte com detalhes…" },
  { tipo: "number", grupo: "texto", nome: "Número", curto: "Número", placeholder: "0" },
  { tipo: "cpf", grupo: "texto", nome: "CPF", curto: "CPF", placeholder: "000.000.000-00" },
  { tipo: "cnpj", grupo: "texto", nome: "CNPJ", curto: "CNPJ", placeholder: "00.000.000/0000-00" },
  { tipo: "cep", grupo: "texto", nome: "CEP", curto: "CEP", placeholder: "00000-000" },
  // Avaliação
  { tipo: "nps", grupo: "nota", nome: "Escala 0–10", curto: "0–10" },
  { tipo: "rating", grupo: "nota", nome: "Nota em estrelas", curto: "Estrelas" },
  // Data & agenda
  { tipo: "date", grupo: "tempo", nome: "Data", curto: "Data" },
  { tipo: "schedule", grupo: "tempo", nome: "Agendar reunião", curto: "Agenda", soConversacional: true },
  // Estrutura
  { tipo: "statement", grupo: "estrutura", nome: "Declaração", curto: "Só texto", soConversacional: true },
  // Legado: a caixa de marcar solta ("Concordo com…"). Continua sendo
  // desenhada e validada; só não é oferecida — o Sim/Não a substitui.
  { tipo: "checkbox", grupo: "escolha", nome: "Caixa de marcar", curto: "Caixa", legado: true },
]

const POR_TIPO: ReadonlyMap<string, DefinicaoDeTipo> = new Map(
  TIPOS_DE_PERGUNTA.map((t) => [t.tipo, t]),
)

/** O tipo "text" vale para qualquer nome desconhecido — como o editor sempre fez. */
export function definicaoDoTipo(tipo: string): DefinicaoDeTipo {
  return POR_TIPO.get(tipo) ?? POR_TIPO.get("text")!
}

export function grupoDoTipo(tipo: string): DefinicaoDeGrupo {
  const g = definicaoDoTipo(tipo).grupo
  return GRUPOS_DE_TIPO.find((x) => x.id === g) ?? GRUPOS_DE_TIPO[2]
}

/** Rótulo curto (espinha, fluxo). Tipo desconhecido volta cru: melhor que "Texto" mentindo. */
export function rotuloCurtoDoTipo(tipo: string): string {
  return POR_TIPO.get(tipo)?.curto ?? tipo
}

/** Nome completo (inspetor, seletor). */
export function nomeDoTipo(tipo: string): string {
  return POR_TIPO.get(tipo)?.nome ?? tipo
}

export function tipoTemOpcoes(tipo: string): boolean {
  return Boolean(POR_TIPO.get(tipo)?.comOpcoes)
}

/**
 * O que o seletor oferece num formato.
 *
 * O formato de página única não desenha `statement` nem `multi_select`
 * nem `schedule` — oferecê-los ali criaria a pergunta que o renderer
 * ignora, o campo fantasma que a espinha existe para impedir. Legados
 * ficam fora nos dois.
 */
export function tiposDisponiveis(
  modo: "classic" | "conversational",
  busca = "",
): Array<{ grupo: DefinicaoDeGrupo; tipos: DefinicaoDeTipo[] }> {
  const q = normalizar(busca)
  return GRUPOS_DE_TIPO.map((grupo) => ({
    grupo,
    tipos: TIPOS_DE_PERGUNTA.filter(
      (t) =>
        t.grupo === grupo.id &&
        !t.legado &&
        (modo === "conversational" || !t.soConversacional) &&
        (!q || normalizar(t.nome).includes(q) || normalizar(t.curto).includes(q)),
    ),
  })).filter((g) => g.tipos.length > 0)
}

/**
 * Com que valores uma pergunta nova nasce.
 *
 * Telefone liga o seletor de país (quase todo telefone aqui é WhatsApp
 * BR e a pessoa espera o +55 pronto); os de escolha nascem com duas
 * opções para a lista do inspetor não abrir vazia — lista vazia parece
 * campo quebrado, e a pessoa não sabe que precisa digitar ali.
 */
export function perguntaNova(tipo: FormBlockType): {
  field_type: FormBlockType
  label: string
  placeholder: string
  required: boolean
  map_to_lead_field: string | null
  options?: string[]
  validation?: Record<string, unknown>
} {
  const def = definicaoDoTipo(tipo)
  return {
    field_type: tipo,
    label: "",
    placeholder: def.placeholder ?? "",
    required: tipo !== "statement",
    map_to_lead_field: def.crm ?? null,
    ...(def.comOpcoes ? { options: ["Opção A", "Opção B"] } : {}),
    ...(tipo === "phone" ? { validation: { countryCode: true } } : {}),
  }
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}
