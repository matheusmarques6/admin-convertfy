"use client"

/**
 * Dialogs do dashboard de funil comercial (visual dark, coerente com a
 * página do funil):
 *
 * - AdSpendDialog: lançamentos manuais de investimento em tráfego
 *   (crm_ad_spend — dia × plataforma × conta).
 * - StageMappingDialog: mapeia etapas do kanban pra etapa canônica do
 *   funil (pipeline_stages.funnel_step) via PATCH da rota de stages.
 */

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  AdSpendEntry,
  ConnectedAdAccount,
  FunnelPipeline,
} from "@/components/crm/funnel-dashboard"

export const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  other: "Outro",
}

const DIALOG =
  "rounded-[16px] border border-white/10 bg-[#0F1420] text-white sm:rounded-[16px]"

const FIELD =
  "h-9 w-full rounded-[10px] border border-white/10 bg-[#0A0E17] px-3 text-[13px] text-white placeholder:text-[#4A5265] focus:border-white/25 focus:outline-none disabled:opacity-40 [color-scheme:dark]"

const BTN_PRIMARY =
  "inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#4666E8] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#3450CE] disabled:pointer-events-none disabled:opacity-50"

const BTN_GHOST =
  "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-[#7C8598] transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-50"

const fmtBRL2 = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown; message?: unknown }
    if (typeof json.error === "string") return json.error
    if (json.error && typeof json.error === "object") {
      const msg = (json.error as { message?: unknown }).message
      if (typeof msg === "string") return msg
    }
    if (typeof json.message === "string") return json.message
  } catch {
    // corpo não-JSON — usa fallback
  }
  return fallback
}

// ─── Lançamentos de investimento ─────────────────────────────────

export function AdSpendDialog({
  open,
  onOpenChange,
  entries,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: AdSpendEntry[]
  onChanged: () => void
}) {
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [platform, setPlatform] = useState("meta")
  const [accountName, setAccountName] = useState("")
  const [amount, setAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedAmount = Number(amount.trim().replace(",", "."))
  const canSubmit =
    !saving && amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount >= 0

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/crm/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          platform,
          account_name: accountName.trim(),
          amount: parsedAmount,
        }),
      })
      if (!res.ok) {
        setError(await readApiError(res, "Não foi possível salvar o lançamento."))
        return
      }
      setAmount("")
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/crm/ad-spend/${id}`, { method: "DELETE" })
      if (!res.ok) {
        setError(await readApiError(res, "Não foi possível remover o lançamento."))
        return
      }
      onChanged()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG, "max-w-xl")}>
        <DialogHeader>
          <DialogTitle className="text-white">Investimento em tráfego</DialogTitle>
          <DialogDescription className="text-[#7C8598]">
            Lance o valor investido por dia, plataforma e conta de anúncio. Esses valores
            alimentam CPL, CPA e ROAS do funil.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[130px_130px_minmax(0,1fr)_110px]">
          <input
            type="date"
            className={FIELD}
            value={day}
            max={format(new Date(), "yyyy-MM-dd")}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Dia"
          />
          <select
            className={cn(FIELD, "appearance-none")}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Plataforma"
          >
            {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            className={FIELD}
            placeholder="Conta (opcional)"
            value={accountName}
            maxLength={120}
            onChange={(e) => setAccountName(e.target.value)}
            aria-label="Conta de anúncio"
          />
          <input
            type="text"
            inputMode="decimal"
            className={cn(FIELD, "text-right tabular-nums")}
            placeholder="R$ 0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
            aria-label="Valor investido"
          />
        </div>

        {error && <p className="text-[12px] text-[#F87171]">{error}</p>}

        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={!canSubmit}>
            {saving ? "Salvando…" : "Adicionar lançamento"}
          </button>
        </div>

        <div className="max-h-[280px] overflow-y-auto rounded-[10px] border border-white/[0.08]">
          {entries.length === 0 ? (
            <p className="p-3 text-[12.5px] text-[#7C8598]">
              Nenhum lançamento no período selecionado.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.07em] text-[#5A6478]">
                  <th className="px-3 py-2 font-semibold">Dia</th>
                  <th className="px-3 py-2 font-semibold">Plataforma</th>
                  <th className="px-3 py-2 font-semibold">Conta</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  <th className="w-9 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-3 py-1.5 text-[#C6CDDB] tabular-nums">
                      {format(new Date(`${e.day}T12:00:00`), "dd/MM/yyyy")}
                    </td>
                    <td className="px-3 py-1.5 text-[#C6CDDB]">
                      {PLATFORM_LABELS[e.platform] ?? e.platform}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-1.5 text-[#7C8598]">
                      {e.account_name || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-white tabular-nums">
                      {fmtBRL2(e.amount)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        disabled={deletingId === e.id}
                        className="text-[#5A6478] transition-colors hover:text-[#F87171] disabled:opacity-40"
                        aria-label="Remover lançamento"
                      >
                        <Icon icon={Trash2} size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Conexão Meta Ads ────────────────────────────────────────────

const UTM_TEMPLATE =
  "utm_source=meta-ads&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}+-+{{placement}}"

export function MetaAdsDialog({
  open,
  onOpenChange,
  accounts,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: ConnectedAdAccount[]
  onChanged: () => void
}) {
  const [accountId, setAccountId] = useState("")
  const [businessId, setBusinessId] = useState("")
  const [token, setToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showUtm, setShowUtm] = useState(false)

  const connected = accounts.length > 0
  // Conta conectada é o caso comum depois do primeiro uso: o passo a
  // passo some e o diálogo fica curto. Sem conta, ele aparece inteiro.
  const formVisible = !connected || showForm
  const canConnect = !saving && accountId.trim() !== "" && token.trim().length >= 20

  const connect = async () => {
    if (!canConnect) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/crm/ad-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId.trim(),
          business_id: businessId.trim() || null,
          access_token: token.trim(),
        }),
      })
      if (!res.ok) {
        setError(await readApiError(res, "Não foi possível conectar a conta."))
        return
      }
      setToken("")
      setAccountId("")
      setBusinessId("")
      setShowForm(false)
      setNotice("Conta conectada. Sincronize para trazer os dados.")
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const sync = async (id: string) => {
    setSyncingId(id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/crm/ad-accounts/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      })
      if (!res.ok) {
        setError(await readApiError(res, "Falha ao sincronizar."))
        return
      }
      const json = (await res.json()) as { result?: { rows?: number } }
      setNotice(`Pronto: ${json.result?.rows ?? 0} registros dos últimos 30 dias.`)
      onChanged()
    } finally {
      setSyncingId(null)
    }
  }

  const disconnect = async (id: string) => {
    setError(null)
    setNotice(null)
    const res = await fetch(`/api/crm/ad-accounts/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setError(await readApiError(res, "Não foi possível desconectar."))
      return
    }
    onChanged()
  }

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(UTM_TEMPLATE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("O navegador bloqueou a cópia. Selecione o texto manualmente.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG, "max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="text-white">
            {connected ? "Meta Ads" : "Conectar Meta Ads"}
          </DialogTitle>
          <DialogDescription className="text-[#7C8598]">
            {connected
              ? "Gasto e criativos vêm desta conta. A sincronização roda sozinha todo dia."
              : "Traz gasto, entrega e criativos da sua conta de anúncios para o funil."}
          </DialogDescription>
        </DialogHeader>

        {/* Contas conectadas */}
        {connected && (
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-white/[0.08] bg-[#0A0E17] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
                    <Icon
                      icon={a.last_sync_status === "error" ? AlertCircle : CheckCircle2}
                      size={16}
                      className={
                        a.last_sync_status === "error" ? "text-[#F87171]" : "text-[#34D399]"
                      }
                    />
                    <span className="truncate">{a.account_name || a.account_id}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#7C8598]">
                    {a.last_synced_at
                      ? `Última sincronização ${format(new Date(a.last_synced_at), "dd/MM 'às' HH:mm")}`
                      : "Ainda não sincronizado"}
                  </div>
                  {a.last_sync_error && (
                    <div className="mt-0.5 text-[11px] text-[#F87171]">{a.last_sync_error}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => sync(a.id)}
                    disabled={syncingId === a.id}
                    className={cn(BTN_GHOST, "px-2")}
                  >
                    <Icon
                      icon={RefreshCw}
                      size={16}
                      className={cn(syncingId === a.id && "animate-spin")}
                    />
                    {syncingId === a.id ? "Sincronizando" : "Sincronizar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => disconnect(a.id)}
                    className={cn(BTN_GHOST, "px-2 hover:text-[#F87171]")}
                    aria-label={`Desconectar ${a.account_name || a.account_id}`}
                  >
                    <Icon icon={Trash2} size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Passo a passo — só enquanto não há conta conectada */}
        {!connected && (
          <ol className="space-y-2">
            <SetupStep
              n={1}
              title="Gere um token no Business Manager"
              href="https://business.facebook.com/settings/system-users"
              linkLabel="Usuários do sistema"
            >
              Crie um usuário do sistema, clique em <B>Gerar novo token</B>, escolha seu
              app e marque a permissão <B>ads_read</B>.
            </SetupStep>

            <SetupStep
              n={2}
              title="Dê acesso à conta de anúncio"
              href="https://business.facebook.com/settings/system-users"
              linkLabel="Atribuir ativos"
            >
              No mesmo usuário, em <B>Ativos → Contas de anúncios</B>, adicione a conta que
              você quer acompanhar. Sem isso o token não enxerga os dados.
            </SetupStep>

            <SetupStep
              n={3}
              title="Copie o ID da conta"
              href="https://adsmanager.facebook.com/adsmanager"
              linkLabel="Gerenciador de Anúncios"
            >
              O ID aparece no seletor de contas e começa com <B>act_</B>.
            </SetupStep>
          </ol>
        )}

        {/* Formulário */}
        {formVisible ? (
          <div className="space-y-2 rounded-[10px] border border-white/[0.08] bg-[#0A0E17] p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
              <input
                type="text"
                className={FIELD}
                placeholder="act_123456789"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-label="ID da conta de anúncio"
              />
              <input
                type="text"
                className={FIELD}
                placeholder="Business ID (opcional)"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                aria-label="Business ID"
              />
            </div>
            <input
              type="password"
              className={FIELD}
              placeholder="Cole o token aqui"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              aria-label="Token de acesso"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10.5px] text-[#5A6478]">
                O token é criptografado antes de ser gravado.
              </p>
              <div className="flex items-center gap-1">
                {connected && (
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={connect}
                  disabled={!canConnect}
                >
                  {saving ? "Validando…" : "Conectar"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="self-start text-[12px] font-medium text-[#7C8598] transition-colors hover:text-white"
          >
            + Conectar outra conta
          </button>
        )}

        {error && <p className="text-[12px] text-[#F87171]">{error}</p>}
        {notice && <p className="text-[12px] text-[#34D399]">{notice}</p>}

        {/* Padrão de UTM — recolhido, é referência e não passo */}
        <div className="rounded-[10px] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setShowUtm((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-[11.5px] font-semibold text-white">
              Padrão de UTM dos anúncios
            </span>
            <Icon
              icon={ChevronDown}
              size={16}
              className={cn("text-[#7C8598] transition-transform", showUtm && "rotate-180")}
            />
          </button>
          {showUtm && (
            <div className="border-t border-white/[0.06] px-3 py-2.5">
              <p className="mb-2 text-[11px] leading-relaxed text-[#7C8598]">
                Cole no campo <B>Parâmetros de URL</B> dos seus anúncios. É por esses nomes
                que o gasto de cada criativo encontra os leads e as vendas.
              </p>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[10.5px] leading-relaxed text-[#8FA0C8]">
                  {UTM_TEMPLATE}
                </code>
                <button
                  type="button"
                  onClick={copyTemplate}
                  className="shrink-0 text-[11px] font-medium text-[#7C8598] transition-colors hover:text-white"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Destaque de termo dentro das instruções. */
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-[#C6CDDB]">{children}</span>
}

/** Passo do setup: número, o que fazer e para onde ir. */
function SetupStep({
  n,
  title,
  href,
  linkLabel,
  children,
}: {
  n: number
  title: string
  href: string
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10.5px] font-bold text-[#8FA0C8] tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-semibold text-white">{title}</span>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#8FA0C8] underline-offset-2 hover:text-white hover:underline"
          >
            {linkLabel}
            <Icon icon={ExternalLink} customSize={11} />
          </a>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#7C8598]">{children}</p>
      </div>
    </li>
  )
}

// ─── Mapeamento de etapas do funil ───────────────────────────────

const STEP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "— fora do funil" },
  { value: "mql", label: "MQL" },
  { value: "agendamento", label: "Agendamento" },
  { value: "reuniao", label: "Reunião" },
  { value: "venda", label: "Venda" },
]

export function StageMappingDialog({
  open,
  onOpenChange,
  pipelines,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelines: FunnelPipeline[]
  onSaved: () => void
}) {
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const original = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of pipelines) {
      for (const s of p.stages) map[s.id] = s.funnel_step ?? ""
    }
    return map
  }, [pipelines])

  useEffect(() => {
    if (open) {
      setMapping(original)
      setError(null)
    }
  }, [open, original])

  const dirty = useMemo(
    () => Object.keys(mapping).some((id) => (mapping[id] ?? "") !== (original[id] ?? "")),
    [mapping, original],
  )

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      for (const p of pipelines) {
        for (const s of p.stages) {
          const next = mapping[s.id] ?? ""
          if (next === (original[s.id] ?? "")) continue
          const res = await fetch(`/api/crm/pipelines/${p.id}/stages/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ funnel_step: next === "" ? null : next }),
          })
          if (!res.ok) {
            setError(`Falha ao salvar a etapa "${s.name}".`)
            return
          }
        }
      }
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG, "max-w-xl")}>
        <DialogHeader>
          <DialogTitle className="text-white">Etapas do funil</DialogTitle>
          <DialogDescription className="text-[#7C8598]">
            Diga qual etapa canônica do funil cada coluna do kanban representa. Etapas de
            ganho já contam como Venda automaticamente. O topo (Leads) vem dos leads
            criados no período.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {pipelines.map((p) => (
            <div key={p.id}>
              <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-white">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: p.color || "#4A5265" }}
                />
                {p.name}
              </div>
              <div className="space-y-1.5">
                {p.stages
                  .filter((s) => s.stage_type === "open" || s.stage_type === "won")
                  .map((s) => (
                    <div
                      key={s.id}
                      className="grid grid-cols-[minmax(0,1fr)_170px] items-center gap-2"
                    >
                      <span className="truncate text-[12.5px] text-[#7C8598]">
                        {s.name}
                        {s.stage_type === "won" && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#34D399]">
                            ganho
                          </span>
                        )}
                      </span>
                      <select
                        className={cn(FIELD, "appearance-none")}
                        value={mapping[s.id] ?? ""}
                        onChange={(e) =>
                          setMapping((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        aria-label={`Etapa do funil de ${s.name}`}
                      >
                        {STEP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {pipelines.length === 0 && (
            <p className="text-[12.5px] text-[#7C8598]">
              Nenhum pipeline de vendas encontrado.
            </p>
          )}
        </div>

        {error && <p className="text-[12px] text-[#F87171]">{error}</p>}

        <DialogFooter>
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar mapeamento"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
