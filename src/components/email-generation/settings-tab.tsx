"use client"

/**
 * Aba Configurações do hub de Geração de Emails (maquete EG).
 *
 * Parâmetros globais do pipeline em `email_generation_settings`:
 * card Pipeline (QA Vision, Refino tipográfico, máx. blocos + comportamento),
 * card Custo & modelos (modelo padrão, câmbio, alerta de custo) e
 * card Notificações (erro/sucesso + lista de emails).
 */

import { useState } from "react"
import useSWR from "swr"
import { Check, Loader2, Settings, X } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import type { EmailGenerationSettings } from "@/types/email-generation"
import { C, F } from "./ui/eg-theme"
import {
  EGBtn,
  EGCard,
  EGInput,
  EGLabel,
  EGSecTitle,
  EGSelect,
  EGToggle,
} from "./ui/eg-atoms"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// A org sai do usuário autenticado, no servidor. Aqui havia um UUID
// sintético fixo que não pertence a nenhuma organização — o pipeline lê a
// settings pela org REAL da loja, então nada salvo nesta tela chegava a ser
// lido. Ver o comentário na rota.

/** "5,45" | "5.45" | "" → número ou null (inválido → null). */
function parseDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

function SettingRow({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.g800,
            fontFamily: F.sans,
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: C.g500, fontFamily: F.sans }}>
            {sub}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export function SettingsTab() {
  const { data, mutate, isLoading } = useSWR<{
    settings?: EmailGenerationSettings | null
    data?: { settings?: EmailGenerationSettings | null }
  }>("/api/admin/email-generation-settings", fetcher)
  const settings = data?.settings ?? data?.data?.settings ?? null

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<EmailGenerationSettings>>({})
  const [emailInput, setEmailInput] = useState("")
  // Campos numéricos editados como texto (aceitam vírgula decimal).
  const [rateText, setRateText] = useState<string | null>(null)
  const [alertText, setAlertText] = useState<string | null>(null)

  const merged = {
    auto_trigger: form.auto_trigger ?? settings?.auto_trigger ?? false,
    max_parallel: form.max_parallel ?? settings?.max_parallel ?? 3,
    generate_images: form.generate_images ?? settings?.generate_images ?? true,
    notify_on_error: form.notify_on_error ?? settings?.notify_on_error ?? true,
    notify_on_success:
      form.notify_on_success ?? settings?.notify_on_success ?? false,
    notify_emails: form.notify_emails ?? settings?.notify_emails ?? [],
    qa_vision_enabled:
      form.qa_vision_enabled !== undefined
        ? form.qa_vision_enabled
        : settings?.qa_vision_enabled ?? null,
    blueprint_mode: form.blueprint_mode ?? settings?.blueprint_mode ?? "auto",
    merge_verifier_mode:
      form.merge_verifier_mode ?? settings?.merge_verifier_mode ?? "on_flag",
    estruturador_mode:
      form.estruturador_mode ?? settings?.estruturador_mode ?? "off",
    montador_mode: form.montador_mode ?? settings?.montador_mode ?? "off",
    refiner_enabled: form.refiner_enabled ?? settings?.refiner_enabled ?? true,
    max_blocks_per_email:
      form.max_blocks_per_email ?? settings?.max_blocks_per_email ?? 9,
    default_model:
      form.default_model !== undefined
        ? form.default_model
        : settings?.default_model ?? null,
  }

  const rateValue =
    rateText ?? (settings?.usd_brl_rate != null ? String(settings.usd_brl_rate) : "")
  const alertValue =
    alertText ??
    (settings?.cost_alert_usd != null ? String(settings.cost_alert_usd) : "")

  const dirty =
    Object.keys(form).length > 0 || rateText !== null || alertText !== null

  const save = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      if (rateText !== null) payload.usd_brl_rate = parseDecimal(rateText)
      if (alertText !== null) payload.cost_alert_usd = parseDecimal(alertText)
      const res = await fetch("/api/admin/email-generation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      setForm({})
      setRateText(null)
      setAlertText(null)
      mutate()
      toast({ title: "Configurações salvas" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configurações" })
    } finally {
      setSaving(false)
    }
  }

  const addEmail = () => {
    const email = emailInput.trim()
    if (!email || !email.includes("@")) return
    const current = merged.notify_emails
    if (!current.includes(email)) {
      setForm((f) => ({ ...f, notify_emails: [...current, email] }))
    }
    setEmailInput("")
  }

  const removeEmail = (email: string) => {
    setForm((f) => ({
      ...f,
      notify_emails: merged.notify_emails.filter((e) => e !== email),
    }))
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: 40,
          color: C.g400,
        }}
      >
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <EGSecTitle
        icon={<Settings size={18} />}
        title="Configurações"
        sub="Parâmetros globais do pipeline de geração de emails."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          alignItems: "start",
          maxWidth: 980,
        }}
      >
        <EGCard title="Pipeline">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SettingRow
              title="QA Vision"
              sub="Revisão visual automática do HTML"
            >
              <div style={{ width: 170, flexShrink: 0 }}>
                <EGSelect
                  value={
                    merged.qa_vision_enabled === null
                      ? "default"
                      : merged.qa_vision_enabled
                        ? "on"
                        : "off"
                  }
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      qa_vision_enabled: v === "default" ? null : v === "on",
                    }))
                  }
                  options={[
                    { value: "default", label: "Padrão do servidor" },
                    { value: "on", label: "Ligado" },
                    { value: "off", label: "Desligado" },
                  ]}
                />
              </div>
            </SettingRow>
            <SettingRow
              title="Blueprint"
              sub="Rota da estrutura: Auto = determinístico quando as variantes cobrem 100%, senão LLM"
            >
              <div style={{ width: 170, flexShrink: 0 }}>
                <EGSelect
                  value={merged.blueprint_mode}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      blueprint_mode: v as "auto" | "llm" | "deterministic",
                    }))
                  }
                  options={[
                    { value: "auto", label: "Auto (híbrido)" },
                    { value: "llm", label: "Sempre LLM" },
                    { value: "deterministic", label: "Sempre determinístico" },
                  ]}
                />
              </div>
            </SettingRow>
            <SettingRow
              title="Estruturador"
              sub="Decide a estrutura editorial do email antes do Curador. Observar = roda e grava o embasamento sem mudar nada; Decidir = a estrutura dele manda na escolha das variantes (e a arquitetura passa a ser refeita a cada geração, em vez de reaproveitada)"
            >
              <div style={{ width: 170, flexShrink: 0 }}>
                <EGSelect
                  value={merged.estruturador_mode}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      estruturador_mode: v as "off" | "shadow" | "on",
                    }))
                  }
                  options={[
                    { value: "off", label: "Desligado" },
                    { value: "shadow", label: "Observar (shadow)" },
                    { value: "on", label: "Decidir (on)" },
                  ]}
                />
              </div>
            </SettingRow>
            <SettingRow
              title="Montador"
              sub="Desligado = a variante que o Curador escolheu para cada posição vai direto para a montagem por código, sem outro agente no meio. Ligado = o Montador escolhe entre os finalistas do Curador olhando o email inteiro"
            >
              <div style={{ width: 170, flexShrink: 0 }}>
                <EGSelect
                  value={merged.montador_mode}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      montador_mode: v as "off" | "on",
                    }))
                  }
                  options={[
                    { value: "off", label: "Desligado" },
                    { value: "on", label: "Ligado" },
                  ]}
                />
              </div>
            </SettingRow>
            <SettingRow
              title="Verificador de merge"
              sub="Audita o merge de copy e tria a fila do agente de exceção. Se acusar = só quando o merge deixa slot sobrando/copy órfã"
            >
              <div style={{ width: 170, flexShrink: 0 }}>
                <EGSelect
                  value={merged.merge_verifier_mode}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      merge_verifier_mode: v as "always" | "on_flag" | "off",
                    }))
                  }
                  options={[
                    { value: "on_flag", label: "Se acusar (padrão)" },
                    { value: "always", label: "Sempre" },
                    { value: "off", label: "Desligado" },
                  ]}
                />
              </div>
            </SettingRow>
            {/* Toggle "Refino tipográfico" removido: o Refinador foi
                substituído pelo agente Cores & Botões (split do HTML agent,
                migration 20261039). A coluna refiner_enabled fica inerte. */}
            <SettingRow
              title="Trigger automático"
              sub="Iniciar geração automaticamente ao criar emails"
            >
              <EGToggle
                on={merged.auto_trigger}
                onChange={(v) => setForm((f) => ({ ...f, auto_trigger: v }))}
              />
            </SettingRow>
            <SettingRow
              title="Gerar imagens"
              sub="Incluir geração de imagens no pipeline. Desligado: reaproveita as imagens da última geração de cada bloco (blocos sem imagem anterior saem sem imagem)"
            >
              <EGToggle
                on={merged.generate_images}
                onChange={(v) => setForm((f) => ({ ...f, generate_images: v }))}
              />
            </SettingRow>
            <div>
              <EGLabel hint="3–15">Máx. blocos por email</EGLabel>
              <EGInput
                type="number"
                min={3}
                max={15}
                value={merged.max_blocks_per_email}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    max_blocks_per_email: Math.max(
                      3,
                      Math.min(15, parseInt(v) || 9),
                    ),
                  }))
                }
                style={{ width: 100 }}
              />
            </div>
            <div>
              <EGLabel hint="1–10">Execuções paralelas</EGLabel>
              <EGInput
                type="number"
                min={1}
                max={10}
                value={merged.max_parallel}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    max_parallel: Math.max(1, Math.min(10, parseInt(v) || 3)),
                  }))
                }
                style={{ width: 100 }}
              />
            </div>
          </div>
        </EGCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <EGCard title="Custo & modelos">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <EGLabel hint='vazio = padrão de cada agente; com "/" roteia via OpenRouter'>
                  Modelo padrão
                </EGLabel>
                <EGInput
                  mono
                  value={merged.default_model ?? ""}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, default_model: v.trim() || null }))
                  }
                  placeholder="anthropic/claude-sonnet-4.6"
                />
              </div>
              <div>
                <EGLabel hint="vazio = cotação online (cache 1h)">
                  Câmbio US$ → R$
                </EGLabel>
                <EGInput
                  value={rateValue}
                  onChange={setRateText}
                  placeholder="5,45"
                  style={{ width: 120 }}
                />
              </div>
              <div>
                <EGLabel hint="vazio = sem alerta">
                  Alerta de custo / execução (US$)
                </EGLabel>
                <EGInput
                  value={alertValue}
                  onChange={setAlertText}
                  placeholder="1,00"
                  style={{ width: 120 }}
                />
              </div>
            </div>
          </EGCard>

          <EGCard title="Notificações">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SettingRow
                title="Notificar em erros"
                sub="Enviar email quando uma geração falhar"
              >
                <EGToggle
                  on={merged.notify_on_error}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, notify_on_error: v }))
                  }
                />
              </SettingRow>
              <SettingRow
                title="Notificar em sucesso"
                sub="Enviar email quando a geração concluir com sucesso"
              >
                <EGToggle
                  on={merged.notify_on_success}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, notify_on_success: v }))
                  }
                />
              </SettingRow>
              <div>
                <EGLabel>Emails para notificação</EGLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <EGInput
                    type="email"
                    value={emailInput}
                    onChange={setEmailInput}
                    placeholder="email@exemplo.com"
                  />
                  <EGBtn variant="secondary" onClick={addEmail}>
                    Adicionar
                  </EGBtn>
                </div>
                {merged.notify_emails.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {merged.notify_emails.map((email) => (
                      <span
                        key={email}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 11.5,
                          background: C.g100,
                          color: C.g600,
                          padding: "2px 9px",
                          borderRadius: 999,
                          fontFamily: F.sans,
                        }}
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: C.g400,
                            display: "flex",
                            padding: 0,
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </EGCard>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <EGBtn variant="dark" onClick={save} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Check size={15} />
          )}
          Salvar configurações
        </EGBtn>
      </div>
    </div>
  )
}
