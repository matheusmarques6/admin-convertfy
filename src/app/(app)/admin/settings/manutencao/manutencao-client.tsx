"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/hooks/use-toast"

interface ResyncStats {
  onboardings_scanned: number
  tasks_deleted: number
  tasks_created: number
  tasks_kept: number
  sub_items_added: number
  errors: Array<{ onboarding_id: string; column_id: string; error: string }>
}

interface MigrationStats {
  scanned: number
  migrated: number
  skipped_already_has_sub_items: number
  skipped_no_template_match: number
  skipped_template_has_no_sub_items: number
  errors: Array<{ task_id: string; error: string }>
}

interface TemplatesResyncStats {
  orgs_scanned: number
  orgs_synced: number
  errors: Array<{ org_id: string; error: string }>
}

export function ManutencaoClient() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-white">
          Manutencao
        </h1>
        <p className="text-[13px] text-slate-500 dark:text-white/55 mt-1">
          Ferramentas administrativas pra reconciliar dados apos mudancas no
          sistema. Owner/manager only.
        </p>
      </header>

      <ResyncTemplatesCard />
      <ResyncOnboardingTasksCard />
      <MigrateSubItemsCard />
    </div>
  )
}

function ResyncTemplatesCard() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TemplatesResyncStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/resync-pipeline-templates", {
        method: "POST",
      })
      const j = await res.json()
      if (!res.ok) {
        const msg = j.error?.message ?? `HTTP ${res.status}`
        setError(msg)
        toast.toast({ variant: "destructive", title: "Falha", description: msg })
      } else {
        setResult(j.data ?? j)
        toast.toast({ title: "Templates re-sincronizados" })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.toast({ variant: "destructive", title: "Falha", description: msg })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-blue-200 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-500/[0.04] p-5">
      <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
        Re-sincronizar templates das colunas (rapido e seguro)
      </h2>
      <p className="text-[12.5px] text-slate-600 dark:text-white/65 mt-1 leading-[1.55]">
        Atualiza checklist_template e deliverables_template das colunas do
        pipeline pra todas as orgs com onboarding ativo. NAO mexe em tasks
        existentes. Use depois de alterar o SEED_COLUMNS (ex: novos campos,
        allow_other, options ampliadas).
      </p>

      <div className="mt-4">
        <Button size="sm" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Re-sincronizar templates
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-[6px] border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3">
          <p className="text-[12px] text-red-700 dark:text-red-300 font-mono">
            {error}
          </p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-[6px] border border-green-200 dark:border-green-900/40 bg-green-50/60 dark:bg-green-500/[0.06] p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-[12.5px] font-medium text-green-800 dark:text-green-300">
              Concluido
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-slate-500 dark:text-white/55">
              Orgs escaneadas
            </dt>
            <dd className="text-slate-900 dark:text-white font-mono tabular-nums">
              {result.orgs_scanned}
            </dd>
            <dt className="text-slate-500 dark:text-white/55">
              Orgs sincronizadas
            </dt>
            <dd className="text-green-700 dark:text-green-300 font-mono tabular-nums">
              {result.orgs_synced}
            </dd>
            <dt className="text-slate-500 dark:text-white/55">Erros</dt>
            <dd
              className={`font-mono tabular-nums ${
                result.errors.length > 0
                  ? "text-red-700 dark:text-red-300"
                  : "text-slate-700 dark:text-white/80"
              }`}
            >
              {result.errors.length}
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}

function ResyncOnboardingTasksCard() {
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ResyncStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/resync-onboarding-tasks", {
        method: "POST",
      })
      const j = await res.json()
      if (!res.ok) {
        const msg = j.error?.message ?? `HTTP ${res.status}`
        setError(msg)
        toast.toast({ variant: "destructive", title: "Falha", description: msg })
      } else {
        setResult(j.data ?? j)
        toast.toast({ title: "Resync concluido" })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.toast({ variant: "destructive", title: "Falha", description: msg })
    } finally {
      setRunning(false)
      setConfirming(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-[6px] bg-red-100 dark:bg-red-500/[0.12] flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            Reconciliar tasks legadas de onboarding (destrutivo)
          </h2>
          <p className="text-[12.5px] text-slate-600 dark:text-white/65 mt-1 leading-[1.55]">
            Apaga tasks com slug antigo (mesmo se concluidas) em onboardings
            em progresso e cria as tasks novas conforme o template atual.
            Use depois de atualizar SEED_COLUMNS pra propagar o template
            novo pros onboardings em andamento.
          </p>
          <ul className="text-[12px] text-slate-500 dark:text-white/55 mt-3 space-y-1 list-disc pl-4">
            <li>So toca onboardings status=in_progress</li>
            <li>So toca tasks da current_version (historico preservado)</li>
            <li>Deliverables vinculados a tasks deletadas vao junto (cascade)</li>
            <li>Recomendado rodar em horario de baixa atividade</li>
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            {!confirming ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={running}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Reconciliar tasks legadas
              </Button>
            ) : (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={run}
                  disabled={running}
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Executando...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-1.5" />
                      Confirmar (irreversivel)
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={running}
                >
                  Cancelar
                </Button>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-[6px] border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3">
              <p className="text-[12px] text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">
                {error}
              </p>
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-[6px] border border-green-200 dark:border-green-900/40 bg-green-50/60 dark:bg-green-500/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-[12.5px] font-medium text-green-800 dark:text-green-300">
                  Resync concluido
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                <dt className="text-slate-500 dark:text-white/55">
                  Onboardings escaneados
                </dt>
                <dd className="text-slate-900 dark:text-white font-mono tabular-nums">
                  {result.onboardings_scanned}
                </dd>
                <dt className="text-slate-500 dark:text-white/55">
                  Tasks deletadas
                </dt>
                <dd className="text-red-700 dark:text-red-300 font-mono tabular-nums">
                  {result.tasks_deleted}
                </dd>
                <dt className="text-slate-500 dark:text-white/55">
                  Tasks criadas
                </dt>
                <dd className="text-green-700 dark:text-green-300 font-mono tabular-nums">
                  {result.tasks_created}
                </dd>
                <dt className="text-slate-500 dark:text-white/55">
                  Tasks mantidas
                </dt>
                <dd className="text-slate-700 dark:text-white/80 font-mono tabular-nums">
                  {result.tasks_kept}
                </dd>
                <dt className="text-slate-500 dark:text-white/55">
                  Sub-items adicionados
                </dt>
                <dd className="text-slate-700 dark:text-white/80 font-mono tabular-nums">
                  {result.sub_items_added}
                </dd>
                <dt className="text-slate-500 dark:text-white/55">Erros</dt>
                <dd
                  className={`font-mono tabular-nums ${
                    result.errors.length > 0
                      ? "text-red-700 dark:text-red-300"
                      : "text-slate-700 dark:text-white/80"
                  }`}
                >
                  {result.errors.length}
                </dd>
              </dl>
              {result.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="text-[11.5px] text-red-700 dark:text-red-300 cursor-pointer">
                    Ver erros
                  </summary>
                  <pre className="mt-2 text-[11px] font-mono text-red-700 dark:text-red-300 max-h-40 overflow-auto bg-red-100/50 dark:bg-red-950/30 rounded-[4px] p-2">
                    {JSON.stringify(result.errors, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MigrateSubItemsCard() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<MigrationStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/migrate-onboarding-tasks", {
        method: "POST",
      })
      const j = await res.json()
      if (!res.ok) {
        const msg = j.error?.message ?? `HTTP ${res.status}`
        setError(msg)
        toast.toast({ variant: "destructive", title: "Falha", description: msg })
      } else {
        setResult(j.data ?? j)
        toast.toast({ title: "Migracao concluida" })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.toast({ variant: "destructive", title: "Falha", description: msg })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1117] p-5">
      <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
        Migrar sub-items das tasks legadas (seguro)
      </h2>
      <p className="text-[12.5px] text-slate-600 dark:text-white/65 mt-1 leading-[1.55]">
        Aditivo e idempotente. So adiciona <code className="font-mono text-[11px] bg-slate-100 dark:bg-white/[0.06] px-1 rounded-[3px]">metadata.sub_items</code>{" "}
        em tasks cujos slugs batem com o template novo mas ainda nao tem
        sub-items. Use se voce nao quer mexer em tasks ja completadas.
      </p>

      <div className="mt-4">
        <Button size="sm" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Migrando...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Migrar sub-items
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-[6px] border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3">
          <p className="text-[12px] text-red-700 dark:text-red-300 font-mono">
            {error}
          </p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-[6px] border border-green-200 dark:border-green-900/40 bg-green-50/60 dark:bg-green-500/[0.06] p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-[12.5px] font-medium text-green-800 dark:text-green-300">
              Migracao concluida
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-slate-500 dark:text-white/55">Escaneadas</dt>
            <dd className="text-slate-900 dark:text-white font-mono tabular-nums">
              {result.scanned}
            </dd>
            <dt className="text-slate-500 dark:text-white/55">Migradas</dt>
            <dd className="text-green-700 dark:text-green-300 font-mono tabular-nums">
              {result.migrated}
            </dd>
            <dt className="text-slate-500 dark:text-white/55">Erros</dt>
            <dd
              className={`font-mono tabular-nums ${
                result.errors.length > 0
                  ? "text-red-700 dark:text-red-300"
                  : "text-slate-700 dark:text-white/80"
              }`}
            >
              {result.errors.length}
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}
