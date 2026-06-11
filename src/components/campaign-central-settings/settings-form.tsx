"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import Link from "next/link"
import { Save, Loader2, RotateCcw, Sparkles, ExternalLink, AlertTriangle, Megaphone, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"

interface Settings {
  org_id: string
  date_window_days: number
  max_trends_per_cluster: number
  max_web_searches_per_cluster: number
  max_stores_per_cluster: number
  max_concurrent_clusters: number
  benchmark_min_recipients: number
  benchmark_top_n: number
  health_critical_threshold: number
  health_warn_threshold: number
  revenue_drop_pct: number
  auto_cycle_enabled: boolean
  trends_enabled: boolean
  updated_at?: string
}

const DEFAULTS: Omit<Settings, "org_id"> = {
  date_window_days: 25,
  max_trends_per_cluster: 6,
  max_web_searches_per_cluster: 5,
  max_stores_per_cluster: 6,
  max_concurrent_clusters: 3,
  benchmark_min_recipients: 500,
  benchmark_top_n: 8,
  health_critical_threshold: 40,
  health_warn_threshold: 55,
  revenue_drop_pct: -20,
  auto_cycle_enabled: true,
  trends_enabled: true,
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const URL = "/api/admin/campaign-central/settings"

function Field({
  label,
  hint,
  unit,
  children,
}: {
  label: string
  hint?: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[260px_1fr] sm:gap-4 sm:items-start">
      <div>
        <Label className="text-[13px] font-semibold">{label}</Label>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {unit && <span className="text-[12px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string
  icon: typeof Sparkles
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[8px] border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Icon size={18} className="mt-0.5 text-muted-foreground" />
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </section>
  )
}

export function CampaignCentralSettingsForm() {
  const { toast } = useToast()
  const { data, isLoading } = useSWR<{ settings: Settings }>(URL, fetcher, {
    revalidateOnFocus: false,
  })
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const original = data?.settings
  const state = form ?? original ?? null

  const dirty =
    !!state &&
    !!original &&
    JSON.stringify({ ...state, updated_at: 0 }) !==
      JSON.stringify({ ...original, updated_at: 0 })

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!state) return
    setForm({ ...state, [key]: value })
  }

  const handleSave = async () => {
    if (!state) return
    setSaving(true)
    try {
      const { org_id: _o, updated_at: _u, ...patch } = state
      void _o
      void _u
      const res = await fetch(URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      await mutate(URL)
      setForm(null)
      toast({ title: "Settings salvas", description: "Próximo ciclo já usa os novos parâmetros." })
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

  const handleReset = async () => {
    if (!state) return
    setResetting(true)
    try {
      const res = await fetch(URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEFAULTS),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      await mutate(URL)
      setForm(null)
      toast({ title: "Defaults restaurados" })
    } catch (err) {
      toast({
        title: "Falha ao resetar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setResetting(false)
    }
  }

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Carregando settings…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span>Configurações</span>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-medium text-foreground">Central de Campanhas</span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Central de Campanhas
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Parâmetros operacionais do motor de sugestões. Mudanças entram em vigor no próximo
            ciclo (botão Re-gerar ou cron semanal).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleReset} disabled={resetting || saving}>
            {resetting ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <RotateCcw size={14} className="mr-1.5" />
            )}
            Restaurar padrões
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving || resetting}>
            {saving ? (
              <Loader2 size={15} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={15} className="mr-1.5" />
            )}
            Salvar alterações
          </Button>
        </div>
      </div>

      {/* Agentes */}
      <Section
        title="Agentes de IA"
        icon={Sparkles}
        description="Prompts versionados — model, temperature, system + user template editáveis com histórico e rollback."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=agents`}
            className="group flex items-start gap-3 rounded-[6px] border border-border bg-muted/30 px-4 py-3 hover:border-primary/40"
          >
            <Megaphone size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-foreground">
                  Sugestões de campanha
                </span>
                <ExternalLink
                  size={13}
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Prompt do agente que gera sugestões por cluster (país × nichos). Editar em
                Email Generation → aba Agentes → tipo &quot;Campanhas&quot;.
              </p>
            </div>
          </Link>
          <Link
            href={`${ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION}?tab=agents`}
            className="group flex items-start gap-3 rounded-[6px] border border-border bg-muted/30 px-4 py-3 hover:border-primary/40"
          >
            <Zap size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-foreground">
                  Trends (web search)
                </span>
                <ExternalLink
                  size={13}
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Prompt do agente que captura tendências por país via web search em idioma local.
                Mesmo lugar dos outros agentes.
              </p>
            </div>
          </Link>
        </div>
      </Section>

      {/* Ciclo */}
      <Section
        title="Ciclo e janela"
        icon={Sparkles}
        description="Como o motor varre as lojas e por quanto tempo à frente o calendário é considerado."
      >
        <Field
          label="Janela do calendário"
          hint="Quantos dias à frente o agente vê datas comemorativas. Aumentar pega oportunidades mais cedo, mas o foco fica menos preciso."
          unit="dias"
        >
          <Input
            type="number"
            min={7}
            max={90}
            value={state.date_window_days}
            onChange={(e) => update("date_window_days", parseInt(e.target.value) || 25)}
            className="w-24"
          />
        </Field>

        <Field
          label="Lojas por cluster"
          hint="Cluster é (país × nicho). Limita lojas/cluster pra evitar prompt longo demais. Acima do limite, divide em sub-clusters."
        >
          <Input
            type="number"
            min={2}
            max={12}
            value={state.max_stores_per_cluster}
            onChange={(e) => update("max_stores_per_cluster", parseInt(e.target.value) || 6)}
            className="w-24"
          />
        </Field>

        <Field
          label="Clusters em paralelo"
          hint="Quantas chamadas IA rodam ao mesmo tempo. Mais = mais rápido, mais token concorrente."
        >
          <Input
            type="number"
            min={1}
            max={5}
            value={state.max_concurrent_clusters}
            onChange={(e) => update("max_concurrent_clusters", parseInt(e.target.value) || 3)}
            className="w-24"
          />
        </Field>

        <Field
          label="Cron automático (segunda 01h UTC)"
          hint="Liga/desliga o ciclo semanal. Botão Re-gerar continua funcionando."
        >
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={state.auto_cycle_enabled}
              onChange={(e) => update("auto_cycle_enabled", e.target.checked)}
              className="size-4 accent-primary"
            />
            {state.auto_cycle_enabled ? "Ativo" : "Desligado"}
          </label>
        </Field>
      </Section>

      {/* Trends */}
      <Section
        title="Trends"
        icon={Zap}
        description="Captura de tendências culturais/virais por país. Cada cluster faz 1 chamada de web search no idioma local."
      >
        <Field label="Captura de trends" hint="Desligar pula o coletor de tendências por completo — sugestões tipo 'tema' não aparecem.">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={state.trends_enabled}
              onChange={(e) => update("trends_enabled", e.target.checked)}
              className="size-4 accent-primary"
            />
            {state.trends_enabled ? "Habilitada" : "Desabilitada"}
          </label>
        </Field>

        <Field
          label="Trends por cluster (alvo)"
          hint="Quantidade-alvo que o agente devolve por cluster. Mais = mais opções, mas mais ruído."
        >
          <Input
            type="number"
            min={1}
            max={12}
            value={state.max_trends_per_cluster}
            onChange={(e) => update("max_trends_per_cluster", parseInt(e.target.value) || 6)}
            className="w-24"
            disabled={!state.trends_enabled}
          />
        </Field>

        <Field
          label="Web searches por cluster"
          hint="Quantas buscas a IA pode fazer pra capturar trends. Limite teto, ela decide se usa todas."
        >
          <Input
            type="number"
            min={1}
            max={10}
            value={state.max_web_searches_per_cluster}
            onChange={(e) =>
              update("max_web_searches_per_cluster", parseInt(e.target.value) || 5)
            }
            className="w-24"
            disabled={!state.trends_enabled}
          />
        </Field>
      </Section>

      {/* Benchmark */}
      <Section
        title="Benchmark de emails (Omnisend)"
        icon={Sparkles}
        description={`Quais campanhas viram "emails campeões da rede" pro agente usar como referência.`}
      >
        <Field
          label="Recipients mínimo"
          hint="Email com menos destinatários do que isso é ignorado (open rate vira ruído estatístico)."
          unit="destinatários"
        >
          <Input
            type="number"
            min={0}
            value={state.benchmark_min_recipients}
            onChange={(e) =>
              update("benchmark_min_recipients", parseInt(e.target.value) || 500)
            }
            className="w-32"
          />
        </Field>

        <Field
          label="Top N emails"
          hint="Quantos emails campeões mostrar (ranqueados por open rate)."
        >
          <Input
            type="number"
            min={3}
            max={20}
            value={state.benchmark_top_n}
            onChange={(e) => update("benchmark_top_n", parseInt(e.target.value) || 8)}
            className="w-24"
          />
        </Field>
      </Section>

      {/* Atenção */}
      <Section
        title="Lojas em atenção"
        icon={AlertTriangle}
        description='Thresholds pra uma loja entrar como "em atenção". O agente prioriza ângulos type=performance pra essas lojas.'
      >
        <Field
          label="Health crítico"
          hint="Score abaixo disso = loja crítica (vermelho)."
        >
          <Input
            type="number"
            min={0}
            max={100}
            value={state.health_critical_threshold}
            onChange={(e) =>
              update("health_critical_threshold", parseInt(e.target.value) || 40)
            }
            className="w-24"
          />
        </Field>

        <Field
          label="Health de alerta"
          hint="Score abaixo disso (mas acima do crítico) = warn (amarelo)."
        >
          <Input
            type="number"
            min={0}
            max={100}
            value={state.health_warn_threshold}
            onChange={(e) =>
              update("health_warn_threshold", parseInt(e.target.value) || 55)
            }
            className="w-24"
          />
        </Field>

        <Field
          label="Queda de receita 7d vs 30d"
          hint="Queda em % gatilha sinal de receita. Use número negativo (ex: -20 = queda de 20%)."
          unit="%"
        >
          <Input
            type="number"
            min={-90}
            max={0}
            value={state.revenue_drop_pct}
            onChange={(e) => update("revenue_drop_pct", parseInt(e.target.value) || -20)}
            className="w-24"
          />
        </Field>
      </Section>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={handleReset} disabled={resetting || saving}>
          {resetting ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RotateCcw size={14} className="mr-1.5" />
          )}
          Restaurar padrões
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving || resetting}>
          {saving ? (
            <Loader2 size={15} className="mr-1.5 animate-spin" />
          ) : (
            <Save size={15} className="mr-1.5" />
          )}
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
