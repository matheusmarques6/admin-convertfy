/**
 * Loop do worker: reivindica, processa, bate o heartbeat, repete.
 *
 * O claim é atômico (`transcricoes_claim`, FOR UPDATE SKIP LOCKED): duas
 * instâncias ou duas execuções sobrepostas não pegam a mesma linha, e a
 * transcrição não é cobrada duas vezes.
 */

import { hostname } from "node:os"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"

import { processar, type LinhaTranscricao } from "./pipeline.ts"
import { ferramentasDisponiveis } from "./media.ts"

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }))

function exigir(nome: string): string {
  const v = process.env[nome]
  if (!v) {
    console.error(`Falta a variável ${nome}.`)
    process.exit(1)
  }
  return v
}

const SUPABASE_URL = exigir("SUPABASE_URL")
const SERVICE_ROLE = exigir("SUPABASE_SERVICE_ROLE_KEY")
const WORKER_ID = process.env.WORKER_ID || hostname()
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000)
/** Quanto tempo o claim vale antes de outra instância poder retomar. */
const CLAIM_TTL_S = Number(process.env.CLAIM_TTL_S || 3600)

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let parando = false
let processando = 0

async function heartbeat(): Promise<void> {
  // O rodapé da biblioteca lê daqui. Heartbeat velho e a tela diz que o
  // serviço pode estar fora, em vez de exibir um horário sem significado.
  const { error } = await db.from("transcricoes_worker").upsert(
    {
      id: WORKER_ID,
      visto_em: new Date().toISOString(),
      versao: process.env.WORKER_VERSAO || "1.0.0",
      em_processamento: processando,
      detalhe: { node: process.version },
    },
    { onConflict: "id" },
  )
  if (error) log("heartbeat falhou", { erro: error.message })
}

/**
 * Renova o claim enquanto a etapa longa roda. Sem isso, um download de 40
 * minutos com TTL de 60 expiraria e outra instância começaria do zero em
 * cima da mesma linha.
 */
function renovarClaim(id: string, token: string): () => void {
  const timer = setInterval(() => {
    void db
      .from("transcricoes")
      .update({ claim_expira_em: new Date(Date.now() + CLAIM_TTL_S * 1000).toISOString() })
      .eq("id", id)
      .eq("claim_token", token)
  }, Math.max(30_000, (CLAIM_TTL_S * 1000) / 3))
  return () => clearInterval(timer)
}

async function reivindicar(): Promise<{ linha: LinhaTranscricao; token: string } | null> {
  const token = randomUUID()
  const { data, error } = await db.rpc("transcricoes_claim", {
    p_token: token,
    p_ttl_seg: CLAIM_TTL_S,
    p_limite: 1,
  })
  if (error) {
    log("claim falhou", { erro: error.message })
    return null
  }
  const linhas = (data ?? []) as LinhaTranscricao[]
  return linhas.length ? { linha: linhas[0], token } : null
}

async function ciclo(): Promise<boolean> {
  const alvo = await reivindicar()
  if (!alvo) return false

  processando = 1
  const parar = renovarClaim(alvo.linha.id, alvo.token)
  try {
    await processar(db, alvo.linha)
  } catch (e) {
    // `processar` já registra a falha na linha; aqui é a rede de segurança
    // para não derrubar o loop inteiro.
    log("erro não tratado", { id: alvo.linha.id, erro: e instanceof Error ? e.message : String(e) })
  } finally {
    parar()
    processando = 0
  }
  return true
}

async function main(): Promise<void> {
  const ferramentas = await ferramentasDisponiveis()
  log("worker iniciado", { WORKER_ID, ...ferramentas, proxy: Boolean(process.env.HTTP_PROXY) })
  if (!ferramentas.ytdlp || !ferramentas.ffmpeg) {
    // Sem os binários, links e vídeos não processam. Falha alto: um worker
    // que aceita trabalho e nunca entrega é pior que um que não sobe.
    console.error("yt-dlp e ffmpeg são obrigatórios; verifique a imagem.")
    process.exit(1)
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY é obrigatória para transcrever.")
    process.exit(1)
  }

  await heartbeat()
  const timerHb = setInterval(() => void heartbeat(), 60_000)

  while (!parando) {
    let trabalhou = false
    try {
      trabalhou = await ciclo()
    } catch (e) {
      log("ciclo falhou", { erro: e instanceof Error ? e.message : String(e) })
    }
    // Com fila cheia, encadeia sem esperar; vazia, dorme o intervalo.
    if (!trabalhou) await new Promise((r) => setTimeout(r, POLL_MS))
  }

  clearInterval(timerHb)
  log("worker encerrado")
}

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    log("encerrando", { sinal, processando })
    parando = true
    // O item em andamento continua com o claim ativo; quando ele expirar
    // outra instância retoma da etapa em que a linha parou.
    setTimeout(() => process.exit(0), processando ? 30_000 : 0)
  })
}

void main()
