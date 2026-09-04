/**
 * Modelos da ConvertIA — todos roteados pelo OpenRouter (ids
 * "vendor/model"). Client-safe: o menu do composer importa daqui.
 *
 * O default segue Claude Opus 4.8 (pedido explícito: o Opus fica como
 * padrão). Mudar o default muda só a conversa NOVA — cada conversa
 * grava o próprio modelo no context.
 *
 * Slug que o OpenRouter não reconhece NÃO derruba a conversa: a rota do
 * chat detecta o 400/404 "model not found" na primeira rodada, cai para
 * o modelo padrão e avisa na resposta (`fallbackFor`). É o que permite
 * listar modelos recém-lançados sem depender de conferir o catálogo a
 * cada deploy.
 */

export interface ConvertiaModel {
  id: string
  name: string
  description: string
  tag: string | null
  /** Agrupamento no menu do composer. */
  group: "claude" | "outros"
  /**
   * Aceita o parâmetro `reasoning` do OpenRouter (raciocínio estendido,
   * usado no modo Análise profunda). Todos os atuais aceitam via
   * normalização do OpenRouter; modelo futuro sem suporte marca false.
   */
  reasoning: boolean
}

export const CONVERTIA_MODELS: ConvertiaModel[] = [
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    description: "Máxima qualidade — análises complexas",
    tag: "padrão",
    group: "claude",
    reasoning: true,
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    description: "Topo da linha Claude 5 — raciocínio mais forte, mais caro",
    tag: "novo",
    group: "claude",
    reasoning: true,
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    description: "Geração 5 — qualidade alta, contexto longo",
    tag: null,
    group: "claude",
    reasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Geração 5 — rápido e capaz",
    tag: null,
    group: "claude",
    reasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    description: "Rápido e capaz — uso diário",
    tag: null,
    group: "claude",
    reasoning: true,
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    description: "OpenAI — geração atual",
    tag: null,
    group: "outros",
    reasoning: true,
  },
  {
    id: "openai/gpt-5.3-chat",
    name: "GPT-5.3",
    description: "OpenAI — alternativa geral",
    tag: null,
    group: "outros",
    reasoning: true,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Google — contexto longo",
    tag: null,
    group: "outros",
    reasoning: true,
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Google — muito barato, respostas rápidas",
    tag: null,
    group: "outros",
    reasoning: true,
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    description: "Custo baixo — tarefas leves",
    tag: null,
    group: "outros",
    reasoning: true,
  },
]

export const CONVERTIA_DEFAULT_MODEL = CONVERTIA_MODELS[0].id

export function resolveConvertiaModel(id: string | null | undefined): ConvertiaModel {
  return CONVERTIA_MODELS.find((m) => m.id === id) ?? CONVERTIA_MODELS[0]
}

/**
 * Erro do OpenRouter que significa "esse slug não existe/não está
 * disponível" — e não "a chamada falhou". É o único caso em que vale
 * repetir com o modelo padrão.
 */
export function isUnknownModelError(status: number, snippet: string): boolean {
  if (status !== 400 && status !== 404) return false
  return /model|not found|no endpoints|invalid/i.test(snippet)
}
