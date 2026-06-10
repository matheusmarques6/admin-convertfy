"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { X, Plus, Loader2, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreOption {
  id: string
  store_name: string
  country?: string | null
  is_active?: boolean
}

const TYPES = [
  { k: "data", label: "Data sazonal" },
  { k: "tema", label: "Tema em alta" },
  { k: "performance", label: "Performance" },
  { k: "avulsa", label: "Avulsa" },
] as const

const CHANNELS = ["Email", "Email + SMS", "SMS", "Push"]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewCampaignModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [type, setType] = useState<(typeof TYPES)[number]["k"]>("avulsa")
  const [channel, setChannel] = useState("Email")
  const [sendDate, setSendDate] = useState("")
  const [briefing, setBriefing] = useState("")
  const [storeSearch, setStoreSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    open ? "/api/stores?active=true" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const stores = useMemo(() => storesData?.stores ?? [], [storesData])

  const filtered = useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => s.store_name.toLowerCase().includes(q))
  }, [stores, storeSearch])

  if (!open) return null

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleCreate = async () => {
    if (!title.trim() || selected.size === 0) {
      toast({
        title: "Preencha os campos",
        description: "Nome da campanha e ao menos uma loja-alvo são obrigatórios.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const targets = stores
        .filter((s) => selected.has(s.id))
        .map((s) => ({ store_id: s.id, store_name: s.store_name, country: s.country ?? "BR" }))
      const res = await fetch("/api/admin/campaign-central/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          channel,
          send_date: sendDate || undefined,
          briefing: briefing.trim() || undefined,
          targets,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast({
        title: "Campanha criada",
        description: "Adicionada à fila como aprovada e enviada pro pipeline.",
      })
      setTitle("")
      setBriefing("")
      setSendDate("")
      setSelected(new Set())
      onCreated()
      onClose()
    } catch (err) {
      toast({
        title: "Falha ao criar campanha",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[540px] max-w-full overflow-y-auto rounded-[10px] bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[17px] font-semibold tracking-tight text-foreground">
              Nova campanha
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              Crie uma campanha manual — entra na fila como aprovada por você.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="space-y-1.5">
            <Label>Nome da campanha</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Esquenta Dia dos Namorados"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => {
                const on = type === t.k
                return (
                  <button
                    key={t.k}
                    onClick={() => setType(t.k)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de envio</Label>
              <Input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="h-9 w-full rounded-[6px] border border-border bg-card px-3 text-sm text-foreground"
              >
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Lojas-alvo</Label>
              <span className="text-[11.5px] text-muted-foreground">
                {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Buscar lojas…"
                className="pl-8"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-[6px] border border-border">
              {filtered.length === 0 && (
                <div className="px-3.5 py-3 text-center text-[12px] text-muted-foreground">
                  Nenhuma loja encontrada.
                </div>
              )}
              {filtered.map((s, i) => {
                const on = selected.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                      i < filtered.length - 1 ? "border-b border-border/50" : ""
                    } hover:bg-muted/40`}
                  >
                    <span
                      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] ${
                        on ? "border-primary bg-primary text-white" : "border-border bg-card"
                      }`}
                    >
                      {on && <Check size={11} />}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] font-medium text-foreground/90">
                      {s.store_name}
                    </span>
                    {s.country && <Badge variant="neutral">{String(s.country).toUpperCase()}</Badge>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Objetivo / briefing</Label>
            <Textarea
              rows={3}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="O que essa campanha precisa comunicar? A IA usa isso pra gerar a copy."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 rounded-b-[10px] border-t border-border bg-muted/30 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? (
              <Loader2 size={15} className="mr-1.5 animate-spin" />
            ) : (
              <Plus size={15} className="mr-1.5" />
            )}
            Criar campanha
          </Button>
        </div>
      </div>
    </div>
  )
}
