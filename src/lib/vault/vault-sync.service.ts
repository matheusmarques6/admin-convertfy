/**
 * Sync do vault de conhecimento (GitHub → Supabase) — a ponte da fase 1 do
 * Estruturador (ADR adr-estruturador-adaptativo).
 *
 * O runtime NUNCA lê o Obsidian nem o Git: lê as tabelas que este serviço
 * popula. Gatilhos: webhook de push, cron de segurança (30min) e botão
 * manual na aba Conhecimento.
 *
 * Estratégia de leitura do repo: Git Trees API (1 chamada recursiva) +
 * contents raw por arquivo — ~36 arquivos hoje; sem dependência de tar.
 * O SHA do HEAD curto-circuita o no-op (o cron quase sempre cai aqui).
 *
 * Fail-open por arquivo: nota inválida vira `skipped_invalid[{path,motivo}]`
 * na telemetria (`vault_sync_runs`) e a versão ativa anterior CONTINUA
 * servindo. Arquivo removido do repo → is_active=false, nunca DELETE (runs
 * antigas citam os slugs).
 *
 * Env: VAULT_REPO ("owner/repo"), VAULT_GITHUB_TOKEN (PAT fine-grained
 * read-only — única credencial nova do épico), VAULT_BRANCH (default
 * "main"), VAULT_BASE_PATH (default "Admin Convertfy/Emails").
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  docVariantId,
  isApproved,
  isDocActive,
  isVaultHousekeeping,
  parseVaultFile,
  normalizeSecoes,
  type ParsedNote,
  type SkippedNote,
} from "./vault-parser"

const log = logger.child("VaultSync")

const GITHUB_API = "https://api.github.com"

export interface VaultSyncResult {
  status: "synced" | "noop" | "error"
  commitSha: string | null
  filesTotal: number
  upserted: number
  deactivated: number
  skipped: SkippedNote[]
  /**
   * Faxina do vault (`_INDEX.md`, `.obsidian/`, templates): sai do lote
   * ANTES do download e NUNCA vira alerta — não é nota que falhou, é
   * arquivo que nunca seria nota. Contado para responder "por que N
   * arquivos e M notas?" sem acender aviso à toa.
   */
  ignored: string[]
  durationMs: number
  error?: string
}

interface VaultConfig {
  repo: string
  branch: string
  basePath: string
  token: string
}

function readConfig(): VaultConfig | { error: string } {
  const repo = process.env.VAULT_REPO?.trim()
  const token = process.env.VAULT_GITHUB_TOKEN?.trim()
  if (!repo || !repo.includes("/")) return { error: "VAULT_REPO ausente ou inválido (esperado owner/repo)" }
  if (!token) return { error: "VAULT_GITHUB_TOKEN ausente" }
  return {
    repo,
    branch: process.env.VAULT_BRANCH?.trim() || "main",
    basePath: (process.env.VAULT_BASE_PATH?.trim() || "Admin Convertfy/Emails").replace(/\/+$/, ""),
    token,
  }
}

async function gh<T>(cfg: VaultConfig, path: string, raw = false): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`GitHub ${res.status} em ${path}: ${body.slice(0, 200)}`)
  }
  return (raw ? res.text() : res.json()) as Promise<T>
}

/**
 * Por que o GitHub recusou — em vez de "404".
 *
 * Repositório PRIVADO responde 404, não 403, quando o token não o enxerga:
 * é indistinguível de "não existe", de propósito, para não vazar a
 * existência de repos privados. O resultado é que a mesma mensagem cobre
 * "token expirado", "token da conta errada", "repo não liberado no token",
 * "falta permissão Contents" e "branch inexistente" — e a diferença entre
 * elas só se descobre adivinhando. Isto sonda e responde.
 *
 * Roda SÓ depois de uma falha (2 chamadas), e nunca lança: o diagnóstico
 * não pode virar o novo erro.
 */
async function diagnosticarAcesso(cfg: VaultConfig): Promise<string> {
  const probe = async (path: string) => {
    try {
      const res = await fetch(`${GITHUB_API}${path}`, {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      })
      const body = res.ok ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null
      return { status: res.status, body }
    } catch {
      return { status: 0, body: null }
    }
  }

  // Formato do token, sem vazar o valor: pega "colei com aspas", "colei
  // pela metade" e "colei o token errado" antes de qualquer teoria.
  const t = cfg.token
  const prefixoConhecido =
    t.startsWith("github_pat_") ? "fine-grained" :
    t.startsWith("ghp_") ? "classic" :
    t.startsWith("ghs_") || t.startsWith("gho_") ? "app/oauth" : null
  const forma = `token: ${prefixoConhecido ?? "prefixo NÃO reconhecido"}, ${t.length} chars`
  if (!prefixoConhecido) {
    return `${forma} — o valor não começa por github_pat_/ghp_. Provável cópia com aspas, espaço ou incompleta.`
  }

  const user = await probe("/user")
  if (user.status === 401) {
    return `${forma} — GitHub 401 em /user: token inválido, revogado ou expirado.`
  }
  if (user.status !== 200) {
    return `${forma} — /user devolveu ${user.status}; não deu para classificar.`
  }
  const login = String(user.body?.login ?? "?")

  const repo = await probe(`/repos/${cfg.repo}`)
  if (repo.status === 404) {
    return `${forma}, conta "${login}" — o token é válido mas NÃO enxerga ${cfg.repo}. Em repo privado isso é 404: ou o repositório não está na lista de "Only select repositories" do token, ou a concessão está pendente de aprovação, ou "${login}" não é quem tem acesso ao repo.`
  }
  if (repo.status === 403) {
    return `${forma}, conta "${login}" — 403 em /repos/${cfg.repo}: o token vê o repositório mas falta permissão (precisa de Contents: Read-only).`
  }
  if (repo.status !== 200) {
    return `${forma}, conta "${login}" — /repos/${cfg.repo} devolveu ${repo.status}.`
  }

  const defaultBranch = String(repo.body?.default_branch ?? "?")
  return `${forma}, conta "${login}" — o repositório ${cfg.repo} está acessível (branch padrão "${defaultBranch}"), então o problema é o branch "${cfg.branch}" ou a permissão Contents: Read-only, que é o que a leitura de commits/arquivos exige.`
}

/** Roda o sync completo. `force` ignora o curto-circuito de SHA. */
export async function syncVault(opts: {
  trigger: "webhook" | "cron" | "manual"
  force?: boolean
}): Promise<VaultSyncResult> {
  const t0 = Date.now()
  const admin = createAdminClient()
  const cfg = readConfig()

  const finish = async (r: Omit<VaultSyncResult, "durationMs">): Promise<VaultSyncResult> => {
    const durationMs = Date.now() - t0
    // Telemetria SEMPRE — inclusive noop e erro de config. É o que responde
    // "por que minha edição não valeu?" na aba Conhecimento.
    await admin.from("vault_sync_runs").insert({
      trigger: opts.trigger,
      commit_sha: r.commitSha,
      files_total: r.filesTotal,
      upserted: r.upserted,
      deactivated: r.deactivated,
      skipped_invalid: r.skipped,
      ignored: r.ignored,
      duration_ms: durationMs,
      error: r.error ?? null,
    }).then(({ error }) => {
      if (error) log.error("sync.telemetry_failed", { error: error.message })
    })
    return { ...r, durationMs }
  }

  if ("error" in cfg) {
    log.error("sync.config_missing", { error: cfg.error })
    return finish({ status: "error", commitSha: null, filesTotal: 0, upserted: 0, deactivated: 0, skipped: [], ignored: [], error: cfg.error })
  }

  try {
    // 1. HEAD do branch + curto-circuito por SHA.
    const head = await gh<{ sha: string }>(cfg, `/repos/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`)
    const sha = head.sha

    const { data: state } = await admin
      .from("vault_sync_state").select("last_commit_sha").eq("id", "default").maybeSingle()
    if (!opts.force && state?.last_commit_sha === sha) {
      return finish({ status: "noop", commitSha: sha, filesTotal: 0, upserted: 0, deactivated: 0, skipped: [], ignored: [] })
    }

    // 2. Árvore recursiva → arquivos .md sob a base.
    const tree = await gh<{ tree: Array<{ path: string; type: string }>; truncated: boolean }>(
      cfg, `/repos/${cfg.repo}/git/trees/${sha}?recursive=1`,
    )
    if (tree.truncated) log.warn("sync.tree_truncated", { repo: cfg.repo })

    const prefix = `${cfg.basePath}/`
    const mdFiles = tree.tree.filter(
      (e) => e.type === "blob" && e.path.startsWith(prefix) && e.path.endsWith(".md"),
    )
    // Faxina sai ANTES do download: economiza uma requisição ao GitHub por
    // arquivo e, principalmente, não vira "nota pulada" na tela.
    const ignored: string[] = []
    const files = mdFiles.filter((e) => {
      const rel = e.path.slice(prefix.length)
      if (isVaultHousekeeping(rel)) {
        ignored.push(rel)
        return false
      }
      return true
    })

    // 3. Baixa e parseia cada arquivo (concorrência limitada).
    const notes: ParsedNote[] = []
    const skipped: SkippedNote[] = []
    const CONC = 8
    for (let i = 0; i < files.length; i += CONC) {
      await Promise.all(
        files.slice(i, i + CONC).map(async (f) => {
          const rel = f.path.slice(prefix.length)
          try {
            const content = await gh<string>(
              cfg,
              `/repos/${cfg.repo}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
              true,
            )
            const r = parseVaultFile(rel, content)
            if (r.note) notes.push(r.note)
            else if (r.skipped) skipped.push(r.skipped)
          } catch (err) {
            skipped.push({ path: rel, motivo: `download falhou: ${err instanceof Error ? err.message : String(err)}` })
          }
        }),
      )
    }

    // 4. Upserts por tipo.
    let upserted = 0
    const seen = {
      intents: new Set<string>(),
      refs: new Set<string>(),
      learnings: new Set<string>(),
      docs: new Set<string>(),
    }

    for (const n of notes) {
      const fm = n.frontmatter
      const active = isApproved(fm)
      const base = {
        status: (fm.status as string) ?? "pendente",
        is_active: active,
        frontmatter: fm,
        body_md: n.body,
        file_path: n.filePath,
        synced_commit_sha: sha,
        updated_at: new Date().toISOString(),
      }

      if (n.tipo === "componente_doc") {
        // Vault de componentes (Curador, 31/08) — tabela própria, ativação
        // própria (isDocActive: catálogo gerado também serve; lacuna nunca).
        const kind = n.docKind ?? "outro"
        seen.docs.add(`${kind} ${n.slug}`)
        const { error } = await admin.from("email_vault_docs").upsert(
          {
            kind,
            grupo: n.docGrupo ?? null,
            slug: n.slug,
            variant_id: docVariantId(fm),
            ...base,
            is_active: isDocActive(kind, fm),
          },
          { onConflict: "kind,slug" },
        )
        if (error) skipped.push({ path: n.filePath, motivo: `upsert falhou: ${error.message}` })
        else upserted++
      } else if (n.tipo === "intencao" || n.tipo === "progressao") {
        const flow = n.flowType as string
        seen.intents.add(`${flow} ${n.slug}`)
        const { error } = await admin.from("email_intents").upsert(
          {
            flow_type: flow,
            kind: n.tipo === "progressao" ? "progressao" : "intencao",
            email_number: typeof fm.email_number === "number" ? fm.email_number : null,
            slug: n.slug,
            ...base,
          },
          { onConflict: "flow_type,slug" },
        )
        if (error) skipped.push({ path: n.filePath, motivo: `upsert falhou: ${error.message}` })
        else upserted++
      } else if (n.tipo === "estrutura") {
        const flow = n.flowType as string
        seen.refs.add(`${flow} ${n.slug}`)
        const secoes = (fm.secoes as string[]) ?? []
        const norm = normalizeSecoes(secoes)
        const { error } = await admin.from("email_structure_refs").upsert(
          {
            flow_type: flow,
            slug: n.slug,
            emails: (fm.emails as number[]) ?? [],
            escopo: (fm.escopo as string) ?? null,
            loja: (fm.loja as string) ?? null,
            amostra: (fm.amostra as string) ?? null,
            procedencia: (fm.procedencia as string) ?? null,
            secoes,
            secoes_normalizadas: norm.secoes,
            absorcoes: norm.absorcoes,
            performance: (fm.performance as object) ?? null,
            ...base,
          },
          { onConflict: "flow_type,slug" },
        )
        if (error) skipped.push({ path: n.filePath, motivo: `upsert falhou: ${error.message}` })
        else upserted++
      } else {
        // aprendizado — flow null = _global; UNIQUE é por índice com
        // COALESCE, fora do alcance do onConflict do PostgREST (mesmo caso
        // das metas do CRM): busca-e-decide.
        const flowKey = n.flowType ?? null
        seen.learnings.add(`${flowKey ?? "_global"} ${n.slug}`)
        const row = {
          flow_type: flowKey,
          slug: n.slug,
          aplica_a: (fm.aplica_a as string[]) ?? [],
          origem_estrutura: (fm.origem_estrutura as string) ?? null,
          autor: (fm.autor as string) ?? null,
          ...base,
        }
        const q = admin.from("email_learnings").select("id").eq("slug", n.slug)
        const { data: existing } = flowKey === null
          ? await q.is("flow_type", null).maybeSingle()
          : await q.eq("flow_type", flowKey).maybeSingle()
        const { error } = existing
          ? await admin.from("email_learnings").update(row).eq("id", existing.id)
          : await admin.from("email_learnings").insert(row)
        if (error) skipped.push({ path: n.filePath, motivo: `upsert falhou: ${error.message}` })
        else upserted++
      }
    }

    // 5. Desativa o que sumiu do repo (nunca DELETE). Só linhas cujo par
    //    (flow, slug) não veio nesta passada E que ainda estão ativas.
    let deactivated = 0
    const deactivate = async (
      table: "email_intents" | "email_structure_refs" | "email_learnings",
      seenSet: Set<string>,
      globalKey = false,
    ) => {
      const { data } = await admin.from(table).select("id, flow_type, slug").eq("is_active", true)
      const stale = (data ?? []).filter((r) => {
        const key = `${globalKey ? (r.flow_type ?? "_global") : r.flow_type} ${r.slug}`
        return !seenSet.has(key)
      })
      for (const r of stale) {
        const { error } = await admin.from(table)
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", r.id)
        if (!error) deactivated++
      }
    }
    await deactivate("email_intents", seen.intents)
    await deactivate("email_structure_refs", seen.refs)
    await deactivate("email_learnings", seen.learnings, true)

    // email_vault_docs tem chave (kind, slug) — varredura própria. Tabela
    // ausente (migration 20261093 não aplicada) degrada com warn: o sync das
    // demais tabelas nunca pode parar por causa do vault de componentes.
    {
      const { data, error } = await admin
        .from("email_vault_docs")
        .select("id, kind, slug")
        .eq("is_active", true)
      if (error) {
        log.warn("sync.vault_docs_sweep_skipped", { error: error.message })
      } else {
        const stale = (data ?? []).filter((r) => !seen.docs.has(`${r.kind} ${r.slug}`))
        for (const r of stale) {
          const { error: e } = await admin
            .from("email_vault_docs")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", r.id)
          if (!e) deactivated++
        }
      }
    }

    // 6. Estado.
    await admin.from("vault_sync_state").upsert({
      id: "default",
      repo: cfg.repo,
      branch: cfg.branch,
      last_commit_sha: sha,
      last_synced_at: new Date().toISOString(),
    })

    log.info("sync.done", {
      trigger: opts.trigger, sha: sha.slice(0, 8),
      files: files.length, upserted, deactivated, skipped: skipped.length,
    })
    return finish({ status: "synced", commitSha: sha, filesTotal: files.length, upserted, deactivated, skipped, ignored })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 401/403/404 do GitHub não dizem nada sozinhos — sonda e explica.
    const detalhe =
      "error" in cfg ? "" : / 40[134] /.test(` ${msg} `) || /GitHub 40[134]/.test(msg)
        ? ` · ${await diagnosticarAcesso(cfg)}`
        : ""
    log.error("sync.failed", { trigger: opts.trigger, error: msg, diagnostico: detalhe })
    return finish({
      status: "error", commitSha: null, filesTotal: 0, upserted: 0, deactivated: 0,
      skipped: [], ignored: [], error: `${msg}${detalhe}`,
    })
  }
}
