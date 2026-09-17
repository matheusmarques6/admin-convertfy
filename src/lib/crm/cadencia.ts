/**
 * Cadência de toques da prospecção ativa (T1 → T2 → T3).
 *
 * O operador clica "Enviar T1" e seis coisas têm de acontecer juntas:
 * escolher o script certo pro segmento, trocar as variáveis, abrir o
 * WhatsApp, registrar a atividade, contar a tentativa e mover o card.
 * Aqui mora só a parte que decide — I/O fica na rota.
 *
 * Puro porque cada regra erra em silêncio: script do segmento errado
 * fala da mentoria com quem nunca ouviu falar do Luan, variável não
 * substituída manda "Oi {nome}" pra um cliente, e o atalho inexistente
 * mandaria mensagem VAZIA.
 */

import { segmentoCurto } from "./prospeccao"

export const TOQUES = ["T1", "T2", "T3"] as const
export type Toque = (typeof TOQUES)[number]

/** Etapa em que o card cai depois de cada toque. */
export const ETAPA_DO_TOQUE: Record<Toque, string> = {
  T1: "T1 · Abordado",
  T2: "T2 · Follow-up com valor",
  T3: "T3 · Último toque",
}

/** Atalhos de T1, um por segmento de entrada. */
const ATALHO_T1_POR_LETRA: Record<string, string> = {
  A: "/t1a",
  B: "/t1b",
  C: "/t1c",
  D: "/t1d",
}

/**
 * Qual resposta rápida usar. T1 depende do SEGMENTO — é o ângulo
 * inteiro da abordagem, e o script do A cita a mentoria do Luan, que
 * só faz sentido pra quem comprou. Segmento desconhecido cai no `/t1d`
 * (o mais neutro: "já tem loja rodando?"), nunca no do aluno.
 *
 * A letra vem de `segmentoCurto`, não do primeiro caractere:
 * "Aguardando liberação Luan" também começa com A e pegaria o script
 * do aluno. Os 23 leads dessa coluna guardam esse segmento depois que
 * o Luan libera, então o engano sairia pra gente de verdade.
 */
export function atalhoDoToque(toque: Toque, segmento: string | null): string {
  if (toque !== "T1") return toque === "T2" ? "/t2" : "/t3"
  const curto = segmentoCurto(segmento)
  if (!curto || curto.length !== 1) return "/t1d"
  return ATALHO_T1_POR_LETRA[curto.toUpperCase()] ?? "/t1d"
}

/**
 * Primeiro nome, que é como se fala no WhatsApp. Nome vazio devolve
 * string vazia — quem decide o que fazer com isso é quem monta o
 * texto, e um "Oi ," é melhor tratado lá do que inventado aqui.
 */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim().replace(/\s+/g, " ")
  if (!limpo) return ""
  const primeiro = limpo.split(" ")[0]
  // Nome todo em caixa alta vem da planilha; "JOÃO" soa como grito.
  if (primeiro === primeiro.toUpperCase() && primeiro.length > 1) {
    return primeiro.charAt(0) + primeiro.slice(1).toLowerCase()
  }
  return primeiro
}

export interface VariaveisDoToque {
  nome?: string | null
  hora?: string | null
}

/**
 * Troca `{nome}` e `{hora}` no corpo da resposta rápida.
 *
 * O composer do inbox insere `reply.body` CRU — nenhuma substituição
 * existia. Sem isto o cliente recebe "Oi {nome}, tudo bem?".
 *
 * Três casos, e a diferença entre os dois últimos é o que importa:
 *
 * - **Valor conhecido** → substitui.
 * - **Chave FORNECIDA e vazia** (`nome: null` num contato sem nome) →
 *   apaga junto com o espaço que sobraria: "Oi {nome}, tudo bem?" vira
 *   "Oi, tudo bem?", nunca "Oi , tudo bem?".
 * - **Chave NÃO FORNECIDA** (o composer não sabe a hora combinada) →
 *   o placeholder FICA, como lembrete visível de preencher. Apagá-lo
 *   deixaria "confirmando amanhã às." sem ninguém perceber.
 *
 * Variável desconhecida fica como está — apagá-la esconderia um erro
 * de cadastro do script.
 */
export function preencherVariaveis(corpo: string, vars: VariaveisDoToque): string {
  const valores: Record<string, string | undefined> = {
    nome: "nome" in vars ? primeiroNome(vars.nome) : undefined,
    hora: "hora" in vars ? (vars.hora ?? "").trim() : undefined,
  }
  return corpo
    .replace(/\s*\{(nome|hora)\}/g, (inteiro, chave: string) => {
      const v = valores[chave]
      if (v === undefined) return inteiro // não fornecida: fica o placeholder
      if (!v) return "" // fornecida e vazia: some com o espaço
      // Preserva o espaço que havia antes da variável.
      return inteiro.startsWith(" ") || inteiro.startsWith("\t") ? ` ${v}` : v
    })
    .replace(/^[ \t]+/gm, (m, offset: number) => (offset === 0 ? "" : m))
    .trim()
}

/**
 * Link do WhatsApp com o texto já escrito. `wa.me` exige só dígitos e
 * o texto em `encodeURIComponent` — um `&` ou `#` cru no script cortaria
 * a mensagem no meio sem erro nenhum.
 */
export function linkDoWhatsApp(telefone: string, texto: string): string | null {
  const digitos = telefone.replace(/\D/g, "")
  if (digitos.length < 10) return null
  const base = `https://wa.me/${digitos}`
  const t = texto.trim()
  return t ? `${base}?text=${encodeURIComponent(t)}` : base
}

/**
 * Qual toque vem agora, a partir de quantos já saíram. Acima de 3 não
 * existe T4: a cadência acaba no T3 e quem decide o resto é o job de
 * SLA (move pra "Perdido · sem resposta").
 */
export function proximoToque(tentativas: number): Toque | null {
  if (tentativas <= 0) return "T1"
  if (tentativas === 1) return "T2"
  if (tentativas === 2) return "T3"
  return null
}

/** Rótulo do botão, pra tela não ter de saber a regra. */
export function rotuloDoBotao(toque: Toque | null): string {
  return toque ? `Enviar ${toque}` : "Cadência concluída"
}

/**
 * Texto final do toque. Devolve o motivo quando não dá pra montar —
 * mandar mensagem vazia ou com `{nome}` cru é pior que não mandar.
 */
export type MontagemDoToque =
  | { ok: true; texto: string; atalho: string }
  | { ok: false; motivo: "script_ausente" | "script_vazio"; atalho: string }

export function montarToque(
  toque: Toque,
  segmento: string | null,
  scripts: Record<string, string | undefined>,
  vars: VariaveisDoToque,
): MontagemDoToque {
  const atalho = atalhoDoToque(toque, segmento)
  const corpo = scripts[atalho]
  if (corpo == null) return { ok: false, motivo: "script_ausente", atalho }
  const texto = preencherVariaveis(corpo, vars)
  if (!texto) return { ok: false, motivo: "script_vazio", atalho }
  return { ok: true, texto, atalho }
}

export const EXPLICACAO_DA_MONTAGEM: Record<
  "script_ausente" | "script_vazio",
  string
> = {
  script_ausente:
    "A resposta rápida deste toque não existe. Cadastre-a em Respostas rápidas antes de abordar.",
  script_vazio: "A resposta rápida deste toque está vazia.",
}
