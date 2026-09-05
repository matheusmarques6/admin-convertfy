/**
 * Exportação TXT, SRT e Markdown — puro, mesmo formato no servidor e nos
 * testes. Roda no servidor (a rota devolve o arquivo) porque o texto
 * inteiro de uma aula de 47 min não precisa viajar até o cliente só para
 * ser concatenado lá.
 */

import type { Bloco, Locutor, TopicoDetectado } from "./types"

export type FormatoExport = "txt" | "srt" | "md"

export const EXTENSAO: Record<FormatoExport, string> = { txt: "txt", srt: "srt", md: "md" }
export const MIME: Record<FormatoExport, string> = {
  txt: "text/plain; charset=utf-8",
  srt: "application/x-subrip; charset=utf-8",
  md: "text/markdown; charset=utf-8",
}

export interface DadosExport {
  titulo: string
  canal: string | null
  urlOriginal: string | null
  publicadoEm: string | null
  duracaoSeg: number | null
  blocos: Bloco[]
  locutores: Locutor[]
  topicos: TopicoDetectado[]
}

const mm = (seg: number) => {
  const t = Math.max(0, Math.round(seg))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const dd = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`
}

/** 00:01:36,000 — o formato do SRT exige hora, vírgula e milissegundos. */
export function tempoSrt(seg: number): string {
  const total = Math.max(0, seg)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const ms = Math.round((total - Math.floor(total)) * 1000)
  const dd = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${dd(h)}:${dd(m)}:${dd(s)},${dd(ms, 3)}`
}

function nomeDoLocutor(locutores: Locutor[], rotulo: string | null): string | null {
  if (!rotulo) return null
  return locutores.find((l) => l.rotuloOriginal === rotulo)?.nome ?? rotulo
}

export function paraTxt(d: DadosExport): string {
  const linhas: string[] = [d.titulo]
  const meta = [d.canal, d.publicadoEm ? dataCurta(d.publicadoEm) : null, d.duracaoSeg ? mm(d.duracaoSeg) : null]
    .filter(Boolean)
    .join(" · ")
  if (meta) linhas.push(meta)
  if (d.urlOriginal) linhas.push(d.urlOriginal)
  linhas.push("")

  let ultimo: string | null = null
  for (const b of d.blocos) {
    const nome = nomeDoLocutor(d.locutores, b.locutor)
    // O nome só aparece quando o autor MUDA: repetir a cada fala vira
    // parede de rótulo e atrapalha quem lê o texto corrido.
    if (nome && nome !== ultimo) {
      linhas.push(`[${mm(b.s)}] ${nome}`)
      ultimo = nome
    } else if (!nome) {
      linhas.push(`[${mm(b.s)}]`)
      ultimo = null
    }
    linhas.push(b.texto)
    linhas.push("")
  }
  return linhas.join("\n").trimEnd() + "\n"
}

export function paraSrt(d: DadosExport): string {
  const partes: string[] = []
  d.blocos.forEach((b, i) => {
    const nome = nomeDoLocutor(d.locutores, b.locutor)
    // Legenda sem fim (provedor que não devolveu `end`) recebe 2 s para não
    // virar um bloco de duração zero que nenhum player mostra.
    const fim = b.fim > b.s ? b.fim : b.s + 2
    partes.push(
      String(i + 1),
      `${tempoSrt(b.s)} --> ${tempoSrt(fim)}`,
      nome ? `${nome}: ${b.texto}` : b.texto,
      "",
    )
  })
  return partes.join("\n")
}

export function paraMarkdown(d: DadosExport): string {
  const linhas: string[] = [`# ${d.titulo}`, ""]
  const meta = [
    d.canal ? `**Canal:** ${d.canal}` : null,
    d.publicadoEm ? `**Publicado:** ${dataCurta(d.publicadoEm)}` : null,
    d.duracaoSeg ? `**Duração:** ${mm(d.duracaoSeg)}` : null,
    d.urlOriginal ? `**Original:** ${d.urlOriginal}` : null,
  ].filter(Boolean)
  if (meta.length) linhas.push(meta.join(" · "), "")

  const topicos = [...d.topicos].sort((a, b) => a.s - b.s)
  if (topicos.length) {
    linhas.push("## Tópicos", "")
    for (const t of topicos) linhas.push(`- \`${mm(t.s)}\` ${t.titulo}`)
    linhas.push("")
  }

  // Os tópicos viram cabeçalhos: é o que faz o arquivo navegável no editor.
  let proximo = 0
  let ultimo: string | null = null
  for (const b of d.blocos) {
    while (proximo < topicos.length && b.s >= topicos[proximo].s) {
      linhas.push("", `## ${topicos[proximo].titulo}`, "")
      proximo++
      ultimo = null
    }
    const nome = nomeDoLocutor(d.locutores, b.locutor)
    if (nome && nome !== ultimo) {
      linhas.push(`**${nome}** \`${mm(b.s)}\``, "")
      ultimo = nome
    }
    linhas.push(`${!nome ? `\`${mm(b.s)}\` ` : ""}${b.texto}`, "")
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

export function exportar(formato: FormatoExport, d: DadosExport): string {
  if (formato === "srt") return paraSrt(d)
  if (formato === "md") return paraMarkdown(d)
  return paraTxt(d)
}

/** Nome de arquivo seguro a partir do título (sem acento, sem barra). */
export function nomeArquivo(titulo: string, formato: FormatoExport): string {
  const base =
    titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .toLowerCase() || "transcricao"
  return `${base}.${EXTENSAO[formato]}`
}

function dataCurta(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR")
}

/**
 * Citação de trecho para a área de transferência: texto, timestamp e link
 * absoluto. É o "Copiar com timestamp e link" do menu de seleção.
 */
export function citacaoComTimestamp(p: {
  texto: string
  s: number
  titulo: string
  url: string
}): string {
  return `"${p.texto.trim()}"\n\n— ${p.titulo}, ${mm(p.s)}\n${p.url}`
}

/** URL absoluta de um ponto da transcrição (`?t=MM:SS`). */
export function linkComTimestamp(base: string, id: string, s: number): string {
  const raiz = base.replace(/\/+$/, "")
  return `${raiz}/admin/transcricoes/${id}?t=${encodeURIComponent(mm(s))}`
}
