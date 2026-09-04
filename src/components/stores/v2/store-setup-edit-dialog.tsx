"use client"

/**
 * Dialog "Editar" do Setup da loja — duas seções que antes eram só
 * leitura: Dados da loja (nome, URL, plataforma, país, idioma, moeda,
 * nicho) e Contrato (MRR, vigência, alerta de receita).
 *
 * Persiste via PATCH /api/admin/stores/[id] (só os campos que
 * mudaram). Quem abre passa `section` para o foco cair na parte certa;
 * as duas ficam visíveis porque o operador costuma corrigir as duas de
 * uma vez ao revisar a loja.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { useToast } from "@/lib/hooks/use-toast"
import { COUNTRIES, PLATFORMS } from "@/lib/constants/onboarding"
import { STORE_CURRENCIES } from "@/lib/constants/currencies"
import {
  STORE_LANGUAGE_OPTIONS,
  languageLabelToCode,
} from "@/lib/i18n/store-language"

export interface StoreSetupEditable {
  store_name?: string | null
  store_url?: string | null
  platform?: string | null
  country?: string | null
  language?: string | null
  currency?: string | null
  niche?: string | null
  mrr_cents?: number | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  alert_revenue_threshold?: number | null
}

type Section = "loja" | "contrato"

interface Props {
  storeId: string
  open: boolean
  section: Section
  initial: StoreSetupEditable
  onOpenChange: (open: boolean) => void
  /** Chamado após salvar — quem abre revalida o overview. */
  onSaved?: () => void
}

const NONE = "_none"

function toForm(initial: StoreSetupEditable) {
  return {
    store_name: initial.store_name ?? "",
    store_url: initial.store_url ?? "",
    platform: initial.platform ?? NONE,
    country: initial.country ?? NONE,
    language: languageLabelToCode(initial.language) ?? NONE,
    currency: initial.currency ?? NONE,
    niche: initial.niche ?? "",
    mrr_cents: initial.mrr_cents ?? 0,
    contract_start_date: initial.contract_start_date?.slice(0, 10) ?? "",
    contract_end_date: initial.contract_end_date?.slice(0, 10) ?? "",
    alert_revenue_threshold:
      initial.alert_revenue_threshold != null ? String(initial.alert_revenue_threshold) : "",
  }
}

export function StoreSetupEditDialog({ storeId, open, section, initial, onOpenChange, onSaved }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState(() => toForm(initial))
  const [saving, setSaving] = useState(false)

  // Reabrir com dados frescos (o overview pode ter mudado).
  useEffect(() => {
    if (open) setForm(toForm(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // Só o que mudou vai no PATCH — o resto da loja fica como está.
  const patch = useMemo(() => {
    const base = toForm(initial)
    const out: Record<string, unknown> = {}
    const opt = (v: string) => (v === NONE ? null : v)
    if (form.store_name !== base.store_name) out.store_name = form.store_name.trim()
    if (form.store_url !== base.store_url) out.store_url = form.store_url.trim() || null
    if (form.platform !== base.platform) out.platform = opt(form.platform)
    if (form.country !== base.country) out.country = opt(form.country)
    if (form.language !== base.language) out.language = opt(form.language)
    if (form.currency !== base.currency) out.currency = opt(form.currency)
    if (form.niche !== base.niche) out.niche = form.niche.trim() || null
    if (form.mrr_cents !== base.mrr_cents) out.mrr_cents = form.mrr_cents > 0 ? form.mrr_cents : null
    if (form.contract_start_date !== base.contract_start_date)
      out.contract_start_date = form.contract_start_date || null
    if (form.contract_end_date !== base.contract_end_date)
      out.contract_end_date = form.contract_end_date || null
    if (form.alert_revenue_threshold !== base.alert_revenue_threshold) {
      const n = Number(form.alert_revenue_threshold.replace(/\D/g, ""))
      out.alert_revenue_threshold = form.alert_revenue_threshold.trim() && n > 0 ? n : null
    }
    return out
  }, [form, initial])

  const dirty = Object.keys(patch).length > 0
  const invalidDates =
    Boolean(form.contract_start_date) &&
    Boolean(form.contract_end_date) &&
    form.contract_end_date < form.contract_start_date

  async function save() {
    if (!dirty) {
      onOpenChange(false)
      return
    }
    if (!form.store_name.trim()) {
      toast({ title: "Nome da loja é obrigatório", variant: "destructive" })
      return
    }
    if (invalidDates) {
      toast({ title: "Fim da vigência antes do início", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || `Erro ${res.status}`)
      toast({ title: "Loja atualizada" })
      onOpenChange(false)
      onSaved?.()
      // O hero (nome/URL/idioma) é server component — precisa do refresh.
      router.refresh()
    } catch (err) {
      toast({
        title: "Falha ao salvar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section === "contrato" ? "Editar contrato" : "Editar dados da loja"}</DialogTitle>
          <DialogDescription>
            Só o que você alterar é salvo. Integrações e credenciais ficam na seção Integrações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Dados da loja
            </legend>
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                autoFocus={section === "loja"}
                value={form.store_name}
                onChange={(e) => set("store_name", e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                placeholder="minhaloja.com.br"
                value={form.store_url}
                onChange={(e) => set("store_url", e.target.value)}
                inputMode="url"
              />
              <p className="text-[11px] text-slate-500">Sem &quot;https://&quot; também vale — normalizamos ao salvar.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plataforma</Label>
                <Select value={form.platform} onValueChange={(v) => set("platform", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— (não definida)</SelectItem>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— (não definida)</SelectItem>
                    {STORE_CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>País principal</Label>
                <Select value={form.country} onValueChange={(v) => set("country", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— (não definido)</SelectItem>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Idioma</Label>
                <Select value={form.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— (não definido)</SelectItem>
                    {STORE_LANGUAGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nicho / segmento</Label>
              <Input
                placeholder="Ex.: moda feminina, suplementos…"
                value={form.niche}
                onChange={(e) => set("niche", e.target.value)}
                maxLength={240}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Contrato
            </legend>
            <div className="space-y-1.5">
              <Label>MRR (mensalidade)</Label>
              <CurrencyInput
                autoFocus={section === "contrato"}
                value={form.mrr_cents}
                onValueChange={(cents) => set("mrr_cents", cents)}
                showPreview={false}
              />
              <p className="text-[11px] text-slate-500">
                Valor de referência do contrato — a cobrança real vem das assinaturas do cliente.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início da vigência</Label>
                <Input
                  type="date"
                  value={form.contract_start_date}
                  onChange={(e) => set("contract_start_date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fim da vigência</Label>
                <Input
                  type="date"
                  value={form.contract_end_date}
                  onChange={(e) => set("contract_end_date", e.target.value)}
                  min={form.contract_start_date || undefined}
                />
              </div>
            </div>
            {invalidDates && (
              <p className="text-[11px] text-red-600">O fim da vigência não pode ser antes do início.</p>
            )}
            <div className="space-y-1.5">
              <Label>Alerta de receita (R$/mês)</Label>
              <Input
                inputMode="numeric"
                placeholder="Ex.: 50000"
                value={form.alert_revenue_threshold}
                onChange={(e) => set("alert_revenue_threshold", e.target.value.replace(/[^\d]/g, ""))}
              />
              <p className="text-[11px] text-slate-500">
                Receita mensal abaixo deste valor dispara alerta na loja. Vazio = sem alerta.
              </p>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !dirty || invalidDates}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
