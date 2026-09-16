/**
 * Raio-X do perfil — a varredura que responde "o que está travando o
 * conteúdo" e entrega a saída pronta para executar.
 *
 * **Não existe um segundo carregador aqui.** O Raio-X lê o MESMO
 * `carregarDashboard` que o Dashboard Social usa: dois montadores
 * divergiriam na primeira mudança e apareceriam como "o painel diz uma
 * coisa e o Raio-X diz outra sobre o mesmo perfil" — que é o defeito que a
 * regra do montador único existe para impedir (o precedente é
 * `agent-executions.service`, REST e SSE pelo mesmo builder).
 *
 * O que este serviço acrescenta é o que o dashboard não tem: os EXTRAS que
 * moram fora da janela de posts (referência curada, kit de marca) e a
 * passagem pelos dois módulos puros — a nota e o diagnóstico.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { carregarDashboard, type DashboardOpts } from "./conteudo-dashboard.service"
import { diagnosticar, desempenhoPorFormato } from "@/lib/conteudo/raio-x/diagnostico"
import { notaDoPerfil } from "@/lib/conteudo/raio-x/nota"
import type { RaioXData } from "@/lib/conteudo/raio-x/tipos"
import { PERFIL_CONSOLIDADO } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { logger } from "@/lib/logger"

type Admin = ReturnType<typeof createAdminClient>

const log = logger.child("ConteudoRaioX")

export type { RaioXData }

/** Dias inclusivos entre duas datas YYYY-MM-DD. */
function diasNoPeriodo(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

/** Último valor não nulo da série — o que existe hoje, não o último ponto. */
function ultimoSnapshot(valores: Array<number | null>): number | null {
  for (let i = valores.length - 1; i >= 0; i--) if (valores[i] != null) return valores[i]
  return null
}

/**
 * Contagens que ficam FORA da janela de posts.
 *
 * Fail-open com o motivo declarado: a tabela de referências ou a de kits
 * podem não existir num ambiente atrasado, e o Raio-X inteiro cair porque
 * uma contagem de apoio falhou seria trocar um buraco por um apagão. O que
 * não pôde ser contado devolve `null` e as lacunas que dependem dele
 * simplesmente não nascem — nunca nascem com número inventado.
 */
async function carregarExtras(admin: Admin, orgId: string): Promise<{ referenciasAtivas: number | null; brandKits: number | null }> {
  const [ref, kit] = await Promise.all([
    admin.from("conteudo_referencias").select("id").eq("org_id", orgId).eq("ativa", true).limit(200),
    admin.from("conteudo_brand_kits").select("channel_id").eq("org_id", orgId).limit(200),
  ])
  if (ref.error) log.warn("raio_x.referencias_indisponiveis", { erro: ref.error.message })
  if (kit.error) log.warn("raio_x.brand_kits_indisponiveis", { erro: kit.error.message })
  return {
    referenciasAtivas: ref.error ? null : (ref.data?.length ?? 0),
    brandKits: kit.error ? null : (kit.data?.length ?? 0),
  }
}

export async function carregarRaioX(admin: Admin, orgId: string, opts: DashboardOpts = {}): Promise<RaioXData> {
  const [dash, extras] = await Promise.all([carregarDashboard(admin, orgId, opts), carregarExtras(admin, orgId)])

  const doRecorte = dash.perfil === PERFIL_CONSOLIDADO ? dash.perfis.filter((p) => p.ativo) : dash.perfis.filter((p) => p.id === dash.perfil)
  // A meta do recorte é a SOMA: com dois perfis selecionados os posts vêm
  // somados, e comparar a soma com a meta de um só reprovaria quem está em dia.
  const metaSemanal = doRecorte.reduce((a, p) => a + (p.metaSemanal || 0), 0)
  const dias = diasNoPeriodo(dash.periodo.start, dash.periodo.end)
  const seguidores = ultimoSnapshot(dash.serieSeguidores.valores)

  const nota = notaDoPerfil({ posts: dash.posts, dias, seguidores, metaSemanal })
  const lacunas = diagnosticar({
    posts: dash.posts,
    dias,
    metaSemanal,
    pilarMix: dash.pilarMix,
    alcanceDelta: dash.kpis.find((k) => k.label === "Alcance")?.delta ?? null,
    // Contagem indisponível vira "não há lacuna", nunca "há zero": o valor
    // que não pôde ser lido não pode acusar ninguém.
    referenciasAtivas: extras.referenciasAtivas ?? 1,
    perfis: extras.brandKits == null ? 0 : doRecorte.length,
    brandKits: extras.brandKits ?? 0,
    rotas: { dashboard: ROUTES.ADMIN.CONTEUDO.DASHBOARD, estudio: ROUTES.ADMIN.CONTEUDO.ESTUDIO },
  })

  return {
    perfil: dash.perfil,
    periodo: dash.periodo,
    perfis: dash.perfis,
    kpis: dash.kpis,
    nota,
    lacunas,
    formatos: desempenhoPorFormato(dash.posts),
    pilarMix: dash.pilarMix,
    posts: dash.posts,
    seguidores,
    metaSemanal,
    cobertura: dash.cobertura,
    sincronizadoEm: dash.sincronizadoEm,
    avisos: dash.avisos,
    extras: { referenciasAtivas: extras.referenciasAtivas ?? 0, brandKits: extras.brandKits ?? 0 },
  }
}
