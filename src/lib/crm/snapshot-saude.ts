/**
 * O snapshot do CRM escreveu alguma coisa?
 *
 * Medido em 16/09: **`crm_org_snapshots`, `crm_pipeline_snapshots` e
 * `crm_lead_funnel_snapshots` estavam com ZERO linhas** — as três, desde
 * sempre. O cron diário (`0 6 * * *`) rodava, respondia `200 {success:
 * true, orgs: 0, pipelines: 0}` e não gravava nada, porque
 * `computeAllOrgSnapshots` selecionava as organizações com
 * `.eq("type", "agency")` e a ÚNICA organização do banco é
 * `type: 'internal'`. O laço percorria uma lista vazia.
 *
 * O custo não aparecia em lugar nenhum: `/admin/crm/reports` é
 * "snapshot-first" e lê essas tabelas direto, então a tela inteira
 * mostrava vazio como se não houvesse histórico; os deltas do painel de
 * CS ficavam `null` "porque ainda não há snapshot"; e o `dashboard/sales`
 * comparava o valor aberto de hoje com um passado que nunca foi gravado.
 *
 * É o padrão que esta parte do sistema repete: **zero devolvido com
 * `success: true` se lê como "não havia o que fazer"**. Daqui em diante
 * o cron precisa dizer a diferença entre "a org não tem pipeline" e
 * "ninguém foi processado".
 */

export interface ResumoDoSnapshot {
  /** Organizações que o serviço percorreu. */
  orgs: number
  /** Linhas gravadas em cada tabela. */
  escritos: { pipeline: number; org: number; funil: number }
  /** Falhas de escrita, com a causa crua. */
  erros: string[]
}

export interface VeredictoDoSnapshot {
  ok: boolean
  /** Texto de gente — vai para o log e para a resposta do cron. */
  motivo: string
}

/**
 * PURA. Decide se a rodada foi um sucesso.
 *
 * Zero organização é FALHA, não vazio: o banco tem pelo menos a da casa,
 * e chegar a zero significa que o filtro está errado — foi exatamente o
 * que aconteceu por meses. Organização percorrida sem nenhuma linha
 * gravada também é falha: o snapshot da org é incondicional (ele grava
 * até com a carteira vazia), então zero ali só acontece quando a escrita
 * falhou em silêncio.
 *
 * Erro de escrita é falha mesmo com outras linhas gravando — meia
 * fotografia publicada como fotografia é pior que nenhuma.
 */
export function avaliarSnapshot(r: ResumoDoSnapshot): VeredictoDoSnapshot {
  if (r.erros.length > 0) {
    return { ok: false, motivo: `falha ao gravar: ${r.erros.slice(0, 3).join(" · ")}` }
  }
  if (r.orgs === 0) {
    return {
      ok: false,
      motivo:
        "nenhuma organização foi processada — o filtro da consulta não encontrou nada, e o banco tem pelo menos a organização da casa",
    }
  }
  const total = r.escritos.pipeline + r.escritos.org + r.escritos.funil
  if (total === 0) {
    return {
      ok: false,
      motivo: `${r.orgs} organização(ões) percorrida(s) e nenhuma linha gravada`,
    }
  }
  return {
    ok: true,
    motivo: `${r.escritos.org} org · ${r.escritos.pipeline} pipeline · ${r.escritos.funil} funil`,
  }
}
