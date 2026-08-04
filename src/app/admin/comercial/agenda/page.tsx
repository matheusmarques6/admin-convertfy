"use client"

/**
 * Agenda comercial — calendário mensal das atividades com vencimento.
 *
 * Cada chip é uma atividade (tarefa, ligação, reunião) amarrada a um
 * negócio; clicar abre a ficha. Atrasada = vencida e não concluída
 * (vermelho); concluída fica riscada. Toggle "Só minhas" filtra pelo
 * criador da atividade.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { CheckSquare, ChevronLeft, ChevronRight, Mail, MessageSquare, Phone, StickyNote, Calendar } from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface AgendaItem {
  id: string
  deal_id: string | null
  type: string
  content: string | null
  due_at: string
  done: boolean
  deal_title: string | null
  owner_name: string | null
}

const TYPE_ICON: Record<string, typeof CheckSquare> = {
  task: CheckSquare,
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: StickyNote,
  wa_message: MessageSquare,
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export default function AgendaPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [mine, setMine] = useState(false)

  // Grade: do domingo antes do dia 1 ao sábado depois do fim do mês.
  const gridStart = useMemo(() => {
    const d = new Date(cursor)
    d.setDate(1 - d.getDay())
    return d
  }, [cursor])
  const gridDays = useMemo(() => {
    const days: Date[] = []
    const d = new Date(gridStart)
    // 6 semanas cobrem qualquer mês
    for (let i = 0; i < 42; i++) {
      days.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [gridStart])

  // Folga de ±1 dia na busca: o filtro da API é em UTC e o agrupamento
  // aqui é no fuso local — sem a folga, atividade das 21h+ (UTC-3) do
  // último dia da grade cai fora da janela e some do calendário.
  const from = ymd(new Date(gridDays[0].getTime() - 86_400_000))
  const to = ymd(new Date(gridDays[gridDays.length - 1].getTime() + 86_400_000))

  const { data, isLoading } = useSWR<{ items: AgendaItem[] }>(
    `/api/crm/activities/agenda?from=${from}&to=${to}${mine ? "&mine=true" : ""}`,
    fetcher,
    { keepPreviousData: true },
  )

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>()
    for (const item of data?.items ?? []) {
      const key = ymd(new Date(item.due_at))
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
    return map
  }, [data])

  const todayKey = ymd(new Date())
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  const now = Date.now()

  return (
    <CrmPageShell
      title="Agenda"
      subtitle="Tarefas, ligações e reuniões com vencimento — clique para abrir o negócio"
      actions={
        <div className="flex items-center gap-2">
          <label
            className="inline-flex cursor-pointer select-none items-center gap-1.5"
            style={{ fontSize: 12.5, color: "var(--crm-gray-600)" }}
          >
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4E62D8]"
            />
            Só minhas
          </label>
          <div
            className="inline-flex items-center gap-1 rounded-[6px] border px-1"
            style={{ borderColor: "var(--crm-border)", background: "var(--crm-gray-0)" }}
          >
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center"
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--crm-gray-600)" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className="min-w-[130px] text-center capitalize"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--crm-gray-900)" }}
            >
              {monthLabel}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center"
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--crm-gray-600)" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="crm-button-ghost"
            onClick={() => {
              const n = new Date()
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
            }}
          >
            Hoje
          </button>
        </div>
      }
    >
      <div className="p-4 md:p-6">
        <div
          className="crm-card"
          style={{ padding: 0, overflow: "hidden", opacity: isLoading && !data ? 0.6 : 1 }}
        >
          {/* Cabeçalho dos dias da semana */}
          <div
            className="grid grid-cols-7"
            style={{ borderBottom: "1px solid var(--crm-gray-200)", background: "var(--crm-gray-25)" }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="px-2 py-1.5 text-center"
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--crm-gray-500)",
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Grade */}
          <div className="grid grid-cols-7">
            {gridDays.map((day, i) => {
              const key = ymd(day)
              const items = byDay.get(key) ?? []
              const inMonth = day.getMonth() === cursor.getMonth()
              const isToday = key === todayKey
              return (
                <div
                  key={key}
                  className="min-h-[96px] p-1.5"
                  style={{
                    borderRight: (i + 1) % 7 !== 0 ? "1px solid var(--crm-gray-100)" : undefined,
                    borderBottom: i < 35 ? "1px solid var(--crm-gray-100)" : undefined,
                    background: inMonth ? "var(--crm-gray-0)" : "var(--crm-gray-25)",
                  }}
                >
                  <div
                    className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isToday ? "#fff" : inMonth ? "var(--crm-gray-700)" : "var(--crm-gray-400)",
                      background: isToday ? "var(--crm-brand)" : "transparent",
                    }}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((item) => {
                      const IconCmp = TYPE_ICON[item.type] ?? CheckSquare
                      const overdue = !item.done && new Date(item.due_at).getTime() < now
                      const chip = (
                        <span
                          className="flex items-center gap-1 truncate rounded-[4px] px-1.5 py-0.5"
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            background: item.done
                              ? "var(--crm-gray-100)"
                              : overdue
                                ? "var(--crm-danger-bg, #FEF2F2)"
                                : "var(--crm-gray-100)",
                            color: item.done
                              ? "var(--crm-gray-400)"
                              : overdue
                                ? "var(--crm-danger-fg)"
                                : "var(--crm-gray-700)",
                            textDecoration: item.done ? "line-through" : undefined,
                          }}
                          title={`${item.content ?? item.type}${item.deal_title ? ` — ${item.deal_title}` : ""}${item.owner_name ? ` (${item.owner_name})` : ""}`}
                        >
                          <IconCmp className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {(item.content ?? item.type).slice(0, 42)}
                          </span>
                        </span>
                      )
                      return item.deal_id ? (
                        <Link
                          key={item.id}
                          href={`/admin/comercial/deals/${item.deal_id}/detail`}
                          className="block"
                        >
                          {chip}
                        </Link>
                      ) : (
                        <div key={item.id}>{chip}</div>
                      )
                    })}
                    {items.length > 3 && (
                      <span style={{ fontSize: 10.5, color: "var(--crm-gray-500)", paddingLeft: 4 }}>
                        +{items.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </CrmPageShell>
  )
}
