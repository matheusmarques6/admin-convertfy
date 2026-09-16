/**
 * Espionagem — lê o perfil público de um concorrente pela Graph API.
 *
 * O endpoint é `business_discovery`, e ele tem dois limites que a tela é
 * obrigada a declarar, porque são eles que definem o que dá para concluir:
 *
 * 1. **Só funciona com conta Business ou Creator.** Perfil pessoal ou
 *    privado devolve erro — e a mensagem precisa dizer isso, senão "não
 *    encontrado" é lido como "o perfil não existe".
 * 2. **Entrega curtidas e comentários, e mais nada.** Sem alcance, sem
 *    salvos, sem compartilhamentos. Toda taxa daqui é PARCIAL, e é por isso
 *    que a comparação com o nosso perfil é feita na mesma fórmula parcial
 *    dos dois lados — usar a nossa fórmula completa contra a parcial dele
 *    inflaria o nosso lado por construção.
 *
 * A resposta é guardada por `TTL_MS` no `config.conteudo.espionagem` do
 * canal (JSONB, sem migration — o mesmo lugar de `follower_history` e do
 * cursor de backfill). Quota da Graph API é por hora e por usuário: reabrir
 * a mesma busca três vezes não pode custar três chamadas.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { channelIgConfig, graph, loadIgChannels, type ChannelRow } from "./conteudo-instagram-sync.service"
import { analisarRival, compararComONosso, formatoDoRival, temaDaLegenda, type AnaliseDoRival, type PostRival } from "@/lib/conteudo/espionagem/analise"
import type { EspionagemResultado } from "@/lib/conteudo/espionagem/tipos"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

type Admin = ReturnType<typeof createAdminClient>

const log = logger.child("ConteudoEspionagem")

/** Quanto tempo a varredura de um handle vale antes de custar outra chamada. */
export const TTL_MS = 6 * 60 * 60_000
/** Quantos posts a Graph API devolve por varredura. */
const LIMITE_POSTS = 30

export type { EspionagemResultado }

/**
 * Recusa ESPERADA da varredura (conta pessoal, handle inválido, sem canal).
 * Estende `AppError` com 422 para o envelope de erro da casa cuidar dela —
 * um segundo formato de erro faria o cliente precisar de um segundo leitor.
 */
export class EspionagemError extends AppError {
  constructor(code: string, message: string) {
    super(message, 422, code)
    this.name = "EspionagemError"
  }
}

/** `@Turbo.Partners ` → `turbo.partners`. Vazio ou inválido lança. */
export function normalizarHandle(bruto: string): string {
  const h = (bruto ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
  if (!h) throw new EspionagemError("handle_vazio", "Digite o @ do perfil que você quer analisar.")
  if (!/^[a-z0-9._]{1,30}$/.test(h)) throw new EspionagemError("handle_invalido", `“${bruto}” não parece um @ do Instagram.`)
  return h
}

interface BdMedia {
  id?: string
  caption?: string | null
  like_count?: number | null
  comments_count?: number | null
  media_type?: string | null
  media_product_type?: string | null
  permalink?: string | null
  thumbnail_url?: string | null
  media_url?: string | null
  timestamp?: string | null
}

interface BdResposta {
  business_discovery?: {
    id?: string
    username?: string
    name?: string | null
    biography?: string | null
    profile_picture_url?: string | null
    followers_count?: number | null
    media_count?: number | null
    media?: { data?: BdMedia[] }
  }
}

function caminho(igUserId: string, handle: string): string {
  const campos = [
    "followers_count",
    "media_count",
    "name",
    "biography",
    "profile_picture_url",
    `media.limit(${LIMITE_POSTS}){id,caption,like_count,comments_count,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp}`,
  ].join(",")
  return `/${igUserId}?fields=business_discovery.username(${encodeURIComponent(handle)}){${campos}}`
}

/**
 * Nossa taxa parcial (curtidas + comentários ÷ seguidores), média por post,
 * dos últimos 90 dias.
 *
 * É a MESMA forma da taxa do rival de propósito. `null` sem seguidores ou
 * sem post: número que não dá para calcular não vira zero.
 */
async function taxaNossaParcial(admin: Admin, orgId: string, canalIds: string[]): Promise<number | null> {
  if (canalIds.length === 0) return null
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [midias, diario] = await Promise.all([
    admin.from("conteudo_ig_media").select("like_count, comments_count").in("channel_id", canalIds).gte("published_at", desde).limit(500),
    admin.from("conteudo_ig_daily").select("follower_count, day").in("channel_id", canalIds).order("day", { ascending: false }).limit(20),
  ])
  if (midias.error || diario.error) return null
  const seguidores = (diario.data ?? []).map((d) => d.follower_count).find((v): v is number => v != null) ?? null
  const posts = midias.data ?? []
  if (!seguidores || seguidores <= 0 || posts.length === 0) return null
  const taxas = posts.map((p) => (((p.like_count ?? 0) + (p.comments_count ?? 0)) / seguidores) * 100)
  return taxas.reduce((a, b) => a + b, 0) / taxas.length
}

interface CacheEntrada {
  em: string
  analise: AnaliseDoRival
}

function lerCache(canal: ChannelRow, handle: string): CacheEntrada | null {
  const conteudo = (canal.config as Record<string, unknown> | null)?.conteudo as Record<string, unknown> | undefined
  const esp = conteudo?.espionagem as Record<string, CacheEntrada> | undefined
  const e = esp?.[handle]
  if (!e?.em || !e.analise) return null
  return Date.now() - Date.parse(e.em) < TTL_MS ? e : null
}

async function gravarCache(admin: Admin, canal: ChannelRow, handle: string, analise: AnaliseDoRival): Promise<void> {
  const config = { ...((canal.config as Record<string, unknown> | null) ?? {}) }
  const conteudo = { ...((config.conteudo as Record<string, unknown> | undefined) ?? {}) }
  const esp = { ...((conteudo.espionagem as Record<string, CacheEntrada> | undefined) ?? {}) }
  // Só os 12 handles mais recentes: o config do canal é lido em todo sync e
  // engordá-lo sem teto é custo em toda leitura, não só aqui.
  const entradas = Object.entries({ ...esp, [handle]: { em: new Date().toISOString(), analise } })
    .sort((a, b) => (b[1].em ?? "").localeCompare(a[1].em ?? ""))
    .slice(0, 12)
  conteudo.espionagem = Object.fromEntries(entradas)
  config.conteudo = conteudo
  const { error } = await admin.from("crm_channels").update({ config }).eq("id", canal.id)
  if (error) log.warn("espionagem.cache_nao_gravado", { erro: error.message })
}

export async function espionarPerfil(admin: Admin, orgId: string, handleBruto: string, opts: { forcar?: boolean } = {}): Promise<EspionagemResultado> {
  const handle = normalizarHandle(handleBruto)
  const canais = await loadIgChannels(admin, orgId)
  const canal = canais.find((c) => channelIgConfig(c).access_token && channelIgConfig(c).instagram_business_account_id)
  if (!canal) {
    throw new EspionagemError(
      "sem_canal",
      "Nenhum canal Instagram conectado com token. A varredura usa a API oficial e precisa de uma conta Business conectada em Comercial → Canais.",
    )
  }

  const config = channelIgConfig(canal)
  const canalIds = canais.map((c) => c.id)

  const cache = opts.forcar ? null : lerCache(canal, handle)
  if (cache) {
    const nossa = await taxaNossaParcial(admin, orgId, canalIds)
    return {
      analise: cache.analise,
      comparacao: compararComONosso(cache.analise.taxaMediana, nossa),
      taxaNossaParcial: nossa,
      varridoEm: cache.em,
      doCache: true,
    }
  }

  const r = await graph<BdResposta>(config, caminho(config.instagram_business_account_id as string, handle))
  if (!r.ok) {
    // O #110 e o "does not exist" do business_discovery significam, quase
    // sempre, conta pessoal ou privada — e não "perfil inexistente".
    const bruto = r.error.message
    const contaPessoal = /110|does not exist|not a business|cannot be found/i.test(bruto)
    throw new EspionagemError(
      contaPessoal ? "perfil_nao_elegivel" : r.error.code,
      contaPessoal
        ? `@${handle} não pôde ser lido: a API oficial só devolve perfis Business ou Creator públicos. Perfil pessoal ou privado fica fora — e isso não quer dizer que ele não exista.`
        : bruto,
    )
  }

  const bd = r.data.business_discovery
  if (!bd) throw new EspionagemError("perfil_nao_elegivel", `@${handle} não devolveu dados. A API oficial só lê perfis Business ou Creator públicos.`)

  const posts: PostRival[] = (bd.media?.data ?? []).map((m, i) => ({
    id: m.id ?? `${handle}-${i}`,
    fmt: formatoDoRival(m.media_type ?? null, m.media_product_type ?? null),
    head: temaDaLegenda(m.caption ?? null),
    legenda: m.caption ?? null,
    curtidas: m.like_count ?? null,
    comentarios: m.comments_count ?? null,
    permalink: m.permalink ?? null,
    // A URL do CDN da Meta expira; a thumb é só para a lista e nunca é
    // gravada em lugar nenhum (diferente da referência, que é regravada).
    thumb: m.thumbnail_url ?? m.media_url ?? null,
    publicadoEm: m.timestamp ?? null,
    // `business_discovery` não devolve `children_count`: número de slides
    // fica null em vez de virar palpite.
    slides: null,
  }))

  const analise = analisarRival(
    {
      handle: bd.username ?? handle,
      nome: bd.name ?? null,
      bio: bd.biography ?? null,
      avatar: bd.profile_picture_url ?? null,
      seguidores: bd.followers_count ?? null,
      posts: bd.media_count ?? null,
    },
    posts,
  )

  await gravarCache(admin, canal, handle, analise)
  const nossa = await taxaNossaParcial(admin, orgId, canalIds)
  return {
    analise,
    comparacao: compararComONosso(analise.taxaMediana, nossa),
    taxaNossaParcial: nossa,
    varridoEm: new Date().toISOString(),
    doCache: false,
  }
}
