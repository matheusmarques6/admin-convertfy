/**
 * Papel narrativo de cada frame — é como a copy sai DA ESPINHA e não da
 * pauta solta: a capa recebe a headline, o CTA o comment gate, e os frames
 * do meio recebem hook → mecanismo → prova → aplicação → direção →
 * fechamento, na proporção que o número de frames permite. Os três últimos
 * antes do CTA sempre preparam o CTA (regra do manual): direção e
 * fechamento nunca são cortados enquanto houver 3 frames no meio.
 */

export type PapelFrame = "headline" | "hook" | "mecanismo" | "prova" | "aplicacao" | "direcao" | "fechamento" | "cta"

export const PAPEL_LABEL: Record<PapelFrame, string> = {
  headline: "Capa",
  hook: "Hook",
  mecanismo: "Mecanismo",
  prova: "Prova",
  aplicacao: "Aplicação",
  direcao: "Direção",
  fechamento: "Fechamento",
  cta: "CTA",
}

export const PAPEL_INSTRUCAO: Record<PapelFrame, string> = {
  headline: "A headline escolhida e o subtítulo, exatamente como aprovados (ajuste só para caber).",
  hook: "Contextualiza a tensão da headline em uma cena concreta. Fecha em gancho, nunca em afirmação fechada.",
  mecanismo: "Por que o fenômeno acontece: o motor por trás, com o dado ou a causa. Uma ideia por slide.",
  prova: "Evidência com número + fonte + ano (da espinha). Sem fonte, o número sai como [confirmar].",
  aplicacao: "Traduz para a loja do leitor: a conta com os números dele, o que muda na prática.",
  direcao: "O próximo passo lógico, sem venda. Prepara o CTA.",
  fechamento: "Virada temática genuína — nunca resumo do que veio antes. Deixa a tensão que o CTA resolve.",
  cta: "Comment gate: \"Comente PALAVRA\" + o que a pessoa recebe no direct. Frase-ponte que liga o último insight ao CTA.",
}

const MEIO_BASE: PapelFrame[] = ["hook", "mecanismo", "prova", "aplicacao", "direcao", "fechamento"]
/** Quem entra a mais quando há mais de 6 frames no meio, nesta ordem. */
const EXTRAS: PapelFrame[] = ["mecanismo", "prova", "aplicacao", "mecanismo", "prova"]
/** Quem sai primeiro quando há menos de 6 (os 3 finais ficam enquanto der). */
const CORTE: PapelFrame[] = ["aplicacao", "mecanismo", "fechamento", "direcao", "prova"]

export function papeisDoMeio(n: number): PapelFrame[] {
  if (n <= 0) return []
  if (n === 1) return ["hook"]
  if (n >= MEIO_BASE.length) {
    const out = [...MEIO_BASE]
    let i = 0
    while (out.length < n) {
      const extra = EXTRAS[i % EXTRAS.length]
      // insere depois da última ocorrência do papel, para manter a ordem narrativa
      const pos = out.lastIndexOf(extra)
      out.splice(pos + 1, 0, extra)
      i += 1
    }
    return out
  }
  const out = [...MEIO_BASE]
  for (const c of CORTE) {
    if (out.length <= n) break
    const pos = out.indexOf(c)
    if (pos >= 0) out.splice(pos, 1)
  }
  return out
}

export function papeisDosFrames(frames: Array<{ frameId: string; tipo: string }>): Array<{ frameId: string; papel: PapelFrame }> {
  if (!frames.length) return []
  const primeiro = frames[0]
  const ultimo = frames[frames.length - 1]
  const capa = primeiro.tipo === "capa" ? primeiro : null
  const cta = frames.length > 1 && ultimo.tipo === "cta" ? ultimo : null
  const meio = frames.filter((f) => f !== capa && f !== cta)
  const papeis = papeisDoMeio(meio.length)
  const out: Array<{ frameId: string; papel: PapelFrame }> = []
  if (capa) out.push({ frameId: capa.frameId, papel: "headline" })
  meio.forEach((f, i) => out.push({ frameId: f.frameId, papel: papeis[i] ?? "mecanismo" }))
  if (cta) out.push({ frameId: cta.frameId, papel: "cta" })
  return out
}
