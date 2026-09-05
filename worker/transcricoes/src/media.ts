/**
 * yt-dlp e ffmpeg — as duas ferramentas que obrigam o worker a ser um
 * container.
 *
 * As duas reportam progresso REAL (bytes baixados, tempo processado), e é
 * daí que sai a porcentagem das etapas 0 e 1. A etapa 2 não tem
 * equivalente, e por isso não mostra número.
 */

import { spawn } from "node:child_process"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

export interface SaidaProcesso {
  code: number
  stdout: string
  stderr: string
}

/**
 * Roda o binário coletando a saída. `onLinha` recebe cada linha de stderr
 * (é por onde as duas ferramentas reportam progresso).
 */
export function rodar(
  cmd: string,
  args: string[],
  opts: { onLinha?: (linha: string) => void; timeoutMs?: number; cwd?: string } = {},
): Promise<SaidaProcesso> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: process.env })
    let stdout = ""
    let stderr = ""
    let restoErr = ""

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          p.kill("SIGKILL")
          reject(new Error(`${cmd} excedeu ${Math.round(opts.timeoutMs! / 1000)}s`))
        }, opts.timeoutMs)
      : null

    p.stdout.on("data", (d: Buffer) => {
      stdout += d.toString()
      // A saída de um vídeo longo pode ser megabytes: guardar tudo estoura a
      // memória do container sem necessidade.
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000)
    })
    p.stderr.on("data", (d: Buffer) => {
      const texto = d.toString()
      stderr += texto
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000)
      if (!opts.onLinha) return
      restoErr += texto
      // yt-dlp usa \r para reescrever a linha de progresso no lugar.
      const linhas = restoErr.split(/[\r\n]+/)
      restoErr = linhas.pop() ?? ""
      for (const l of linhas) if (l.trim()) opts.onLinha(l.trim())
    })
    p.on("error", (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    p.on("close", (code) => {
      if (timer) clearTimeout(timer)
      if (restoErr.trim() && opts.onLinha) opts.onLinha(restoErr.trim())
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

// ── yt-dlp ──────────────────────────────────────────────────────────────

export interface MetadadosVideo {
  titulo: string | null
  canal: string | null
  duracaoSeg: number | null
  thumbUrl: string | null
  publicadoEm: string | null
  extensao: string | null
}

function argsProxy(): string[] {
  // YouTube, Instagram e TikTok bloqueiam IP de datacenter. Isso é rotina em
  // produção, não exceção: o proxy é o slot previsto para contornar.
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
  return proxy ? ["--proxy", proxy] : []
}

const ARGS_BASE = [
  "--no-playlist",
  "--no-warnings",
  "--no-progress",
  // Um UA de navegador reduz (não elimina) a chance de bloqueio.
  "--user-agent",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
]

/** Lê metadados sem baixar — é a prévia do modal "Nova transcrição". */
export async function lerMetadados(url: string): Promise<MetadadosVideo> {
  const r = await rodar("yt-dlp", [...ARGS_BASE, ...argsProxy(), "--dump-json", "--no-download", url], {
    timeoutMs: 60_000,
  })
  if (r.code !== 0) throw new Error(r.stderr.trim() || `yt-dlp saiu com ${r.code}`)
  const json = JSON.parse(r.stdout.trim().split("\n")[0]) as Record<string, unknown>
  const data = typeof json.upload_date === "string" ? json.upload_date : null
  return {
    titulo: typeof json.title === "string" ? json.title : null,
    canal: (typeof json.uploader === "string" && json.uploader) || (typeof json.channel === "string" ? json.channel : null),
    duracaoSeg: typeof json.duration === "number" ? Math.round(json.duration) : null,
    thumbUrl: typeof json.thumbnail === "string" ? json.thumbnail : null,
    // yt-dlp devolve YYYYMMDD; sem hora, meia-noite UTC é o mais honesto.
    publicadoEm: data && /^\d{8}$/.test(data) ? `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}T00:00:00Z` : null,
    extensao: typeof json.ext === "string" ? json.ext : null,
  }
}

const RE_PROGRESSO = /\[download\]\s+([\d.]+)%/

/**
 * Baixa o vídeo. `onProgresso` recebe 0..100 real (yt-dlp reporta bytes).
 * Devolve o caminho do arquivo baixado.
 */
export async function baixar(
  url: string,
  destino: string,
  onProgresso?: (pct: number) => void,
): Promise<string> {
  await mkdir(destino, { recursive: true })
  const saida = join(destino, "media.%(ext)s")
  const r = await rodar(
    "yt-dlp",
    [
      ...ARGS_BASE.filter((a) => a !== "--no-progress"),
      ...argsProxy(),
      "--newline",
      // Prefere um arquivo já mesclado; áudio sozinho serve, o vídeo é só
      // para o player.
      "-f",
      "bv*[height<=720]+ba/b[height<=720]/b",
      "--merge-output-format",
      "mp4",
      "-o",
      saida,
      url,
    ],
    {
      timeoutMs: 45 * 60_000,
      onLinha: (l) => {
        const m = l.match(RE_PROGRESSO)
        if (m && onProgresso) onProgresso(Math.min(100, Math.round(Number(m[1]))))
      },
    },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim() || `yt-dlp saiu com ${r.code}`)

  const arquivos = (await readdir(destino)).filter((f) => f.startsWith("media."))
  if (!arquivos.length) throw new Error("yt-dlp terminou sem produzir arquivo")
  return join(destino, arquivos[0])
}

// ── ffmpeg ──────────────────────────────────────────────────────────────

const RE_TEMPO = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/

/**
 * Extrai áudio mono 16 kHz FLAC — o formato nativo do ASR. Estéreo
 * desperdiça banda e alguns provedores cobram por canal.
 *
 * `onProgresso` usa o `time=` do ffmpeg contra a duração conhecida.
 */
export async function extrairAudio(
  entrada: string,
  saida: string,
  duracaoSeg: number | null,
  onProgresso?: (pct: number) => void,
): Promise<void> {
  const r = await rodar(
    "ffmpeg",
    ["-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", saida],
    {
      timeoutMs: 40 * 60_000,
      onLinha: (l) => {
        if (!onProgresso || !duracaoSeg || duracaoSeg <= 0) return
        const m = l.match(RE_TEMPO)
        if (!m) return
        const seg = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        onProgresso(Math.max(0, Math.min(100, Math.round((seg / duracaoSeg) * 100))))
      },
    },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim().slice(-800) || `ffmpeg saiu com ${r.code}`)
}

/** Um frame para a thumb do upload (o link já traz a do próprio serviço). */
export async function extrairFrame(entrada: string, saida: string, duracaoSeg: number | null): Promise<void> {
  // Vídeo com menos de 3 s: frame do meio, senão o -ss cai depois do fim e
  // o ffmpeg devolve arquivo vazio.
  const em = duracaoSeg != null && duracaoSeg < 3 ? Math.max(0, duracaoSeg / 2) : 3
  const r = await rodar(
    "ffmpeg",
    ["-y", "-ss", String(em), "-i", entrada, "-vframes", "1", "-vf", "scale=640:-1", saida],
    { timeoutMs: 60_000 },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim().slice(-400) || "ffmpeg não extraiu o frame")
}

/**
 * Divide o áudio em pedaços de `segundos`. Devolve os caminhos EM ORDEM —
 * a ordem é o que dá o offset de cada pedaço, e errar o offset invalida
 * todos os timestamps a partir do segundo (o sintoma só aparece em vídeo
 * longo).
 */
export async function dividirAudio(entrada: string, destino: string, segundos: number): Promise<string[]> {
  await mkdir(destino, { recursive: true })
  const r = await rodar(
    "ffmpeg",
    ["-y", "-i", entrada, "-f", "segment", "-segment_time", String(segundos), "-c", "copy", join(destino, "parte_%03d.flac")],
    { timeoutMs: 20 * 60_000 },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim().slice(-400) || "ffmpeg não dividiu o áudio")
  const partes = (await readdir(destino)).filter((f) => f.startsWith("parte_")).sort()
  if (!partes.length) throw new Error("a divisão do áudio não produziu pedaços")
  return partes.map((f) => join(destino, f))
}

export async function tamanho(caminho: string): Promise<number> {
  return (await stat(caminho)).size
}

export async function pastaTemp(id: string): Promise<string> {
  const base = process.env.TMPDIR || tmpdir()
  const p = join(base, `tr-${id}`)
  await mkdir(p, { recursive: true })
  return p
}

export async function limpar(caminho: string): Promise<void> {
  await rm(caminho, { recursive: true, force: true }).catch(() => {})
}

export async function ferramentasDisponiveis(): Promise<{ ytdlp: boolean; ffmpeg: boolean }> {
  const check = async (cmd: string, arg: string) => {
    try {
      const r = await rodar(cmd, [arg], { timeoutMs: 15_000 })
      return r.code === 0
    } catch {
      return false
    }
  }
  return { ytdlp: await check("yt-dlp", "--version"), ffmpeg: await check("ffmpeg", "-version") }
}
