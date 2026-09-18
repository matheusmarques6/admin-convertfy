/**
 * A régua do salvamento automático e do que o cabeçalho diz sobre ele.
 *
 * O editor salvava só por ⌘S e pelo botão. O handoff pede autosave de
 * 700 ms — e com ele vem um risco que o botão não tinha: a gravação
 * dispara SOZINHA, então precisa saber quando NÃO deve. Estas regras
 * vivem fora da tela porque cada uma erra em silêncio:
 *
 * - **Antes da hidratação nada é "edição".** O estado sai vazio e recebe
 *   o banco num efeito; disparar ali gravaria um formulário em branco por
 *   cima do real, no primeiro milissegundo.
 * - **Fluxo indisponível não salva sozinho.** O save já omite o rascunho
 *   nesse caso, mas um autosave silencioso gravaria os CAMPOS e deixaria
 *   a impressão de que está tudo salvo enquanto a lógica no ar continua
 *   inalcançável — melhor que o operador salve à mão, vendo o aviso.
 * - **Save em voo não empilha outro.** A resposta do primeiro traz os
 *   ids das perguntas novas; um segundo PATCH antes dela reenviaria a
 *   pergunta sem id e ela seria apagada e recriada com outro id.
 *   Fica marcado como "pendente" e roda quando o primeiro terminar.
 */

export const AUTOSAVE_MS = 700

export type EstadoDoSave =
  | { tipo: "nunca" }
  | { tipo: "pendente" }
  | { tipo: "salvando" }
  | { tipo: "salvo"; em: Date }
  | { tipo: "erro"; mensagem: string }

export function podeSalvarSozinho(o: {
  hidratado: boolean
  fluxoIndisponivel: boolean
  emVoo: boolean
}): "salva" | "espera" | "nao" {
  if (!o.hidratado) return "nao"
  if (o.fluxoIndisponivel) return "nao"
  if (o.emVoo) return "espera"
  return "salva"
}

/** O texto curto ao lado do ✓ — o tooltip do handoff ("Salvo agora"). */
export function textoDoSave(estado: EstadoDoSave, agora: Date = new Date()): string {
  switch (estado.tipo) {
    case "nunca":
      return "Sem alterações"
    case "pendente":
      return "Alterações não salvas"
    case "salvando":
      return "Salvando…"
    case "erro":
      return `Não salvou: ${estado.mensagem}`
    case "salvo": {
      const s = Math.max(0, Math.round((agora.getTime() - estado.em.getTime()) / 1000))
      if (s < 10) return "Salvo agora"
      if (s < 60) return `Salvo há ${s} s`
      const m = Math.round(s / 60)
      if (m < 60) return `Salvo há ${m} min`
      return `Salvo às ${estado.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    }
  }
}

/**
 * O selo de versão do cabeçalho.
 *
 * Três estados e nenhum deles é o `status` cru: "publicado" não diz se
 * o que está no ar é o que se vê no editor. `rascunhoPendente` vem de
 * `has_unpublished_changes` OU de edição local ainda não publicada —
 * o selo precisa acender no primeiro caractere digitado, não no save.
 */
export function seloDeVersao(o: {
  status: "draft" | "published" | "archived"
  versao: number
  rascunhoPendente: boolean
}): { texto: string; tom: "ar" | "pendente" | "rascunho" | "arquivado" } {
  if (o.status === "archived") return { texto: "Arquivado", tom: "arquivado" }
  if (o.status !== "published" || o.versao <= 0) return { texto: "Rascunho", tom: "rascunho" }
  return o.rascunhoPendente
    ? { texto: `v${o.versao} · rascunho pendente`, tom: "pendente" }
    : { texto: `v${o.versao} · no ar`, tom: "ar" }
}
