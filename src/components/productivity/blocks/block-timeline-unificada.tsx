"use client"

import { BlockSection, EmptyState, MiniSpinner, useFetch, C } from "./_shared"

type Actor = { id: string; name: string; email: string; avatar_url?: string | null } | null

type TimelineHistoryItem = {
  type: "history"
  id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  actor: Actor
}

type TimelineCommentItem = {
  type: "comment"
  id: string
  content: string
  mentions: string[]
  attachments: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
  author: Actor
}

type TimelineItem = TimelineHistoryItem | TimelineCommentItem

const ACTION_LABELS: Record<string, string> = {
  created: "criou a task",
  status_changed: "mudou o status",
  assigned: "atribuiu responsável",
  completed: "marcou como concluída",
  deliverable_status_changed: "atualizou entregável",
  commented: "comentou",
}

const ACTION_COLORS: Record<string, string> = {
  created: C.gray500,
  status_changed: C.brandBlue,
  assigned: C.brandBlue,
  completed: C.green,
  deliverable_status_changed: C.brandBlueLight,
  escalated: C.amber,
}

function actionLabel(item: TimelineHistoryItem): string {
  const base = ACTION_LABELS[item.action] ?? item.action
  if (item.action === "status_changed" && item.new_value?.status) {
    return `mudou status para "${item.new_value.status}"`
  }
  if (item.action === "deliverable_status_changed" && item.new_value?.label) {
    return `entregável "${item.new_value.label}": ${item.new_value.status}`
  }
  return base
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function Avatar({ actor, color = C.brandBlue }: { actor: Actor; color?: string }) {
  if (actor?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={actor.avatar_url}
        alt={actor.name}
        style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0 }}
      />
    )
  }
  const initials = (actor?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: `${color}20`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

export function BlockTimelineUnificada({ taskId }: { taskId: string }) {
  const { data, loading } = useFetch<{ timeline: TimelineItem[] }>(
    `/api/tasks/${taskId}/timeline`,
  )

  if (loading) {
    return (
      <BlockSection title="Histórico & Comentários">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
          <MiniSpinner />
          Carregando timeline...
        </div>
      </BlockSection>
    )
  }

  const timeline = data?.timeline ?? []

  if (timeline.length === 0) {
    return (
      <BlockSection title="Histórico & Comentários">
        <EmptyState
          title="Sem atividade ainda"
          description="Eventos do sistema e comentários aparecerão aqui em ordem cronológica."
        />
      </BlockSection>
    )
  }

  return (
    <BlockSection title="Histórico & Comentários">
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {timeline.map((item, i) => {
          const isLast = i === timeline.length - 1
          if (item.type === "comment") {
            return (
              <li
                key={`comment-${item.id}`}
                style={{
                  position: "relative",
                  paddingLeft: 32,
                  paddingBottom: isLast ? 0 : 14,
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 2 }}>
                  <Avatar actor={item.author} color={C.brandBlue} />
                </div>
                {!isLast && (
                  <div
                    style={{
                      position: "absolute",
                      left: 11,
                      top: 28,
                      bottom: -2,
                      width: 1,
                      background: C.gray200,
                    }}
                  />
                )}
                <div style={{ fontSize: 12, color: C.gray500, marginBottom: 2 }}>
                  <strong style={{ color: C.gray900, fontWeight: 600 }}>
                    {item.author?.name ?? "Usuário"}
                  </strong>{" "}
                  comentou · {timeAgo(item.created_at)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: C.gray900,
                    background: C.gray50,
                    padding: "8px 10px",
                    borderRadius: 4,
                    border: `1px solid ${C.gray100}`,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {item.content}
                </div>
              </li>
            )
          }

          // history
          const color = ACTION_COLORS[item.action] ?? C.gray500
          return (
            <li
              key={`history-${item.id}`}
              style={{
                position: "relative",
                paddingLeft: 32,
                paddingBottom: isLast ? 0 : 12,
                fontSize: 12,
                color: C.gray700,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 5,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: color,
                  border: "2px solid #fff",
                  boxShadow: `0 0 0 1px ${color}40`,
                }}
              />
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    left: 11,
                    top: 18,
                    bottom: -2,
                    width: 1,
                    background: C.gray200,
                  }}
                />
              )}
              <span style={{ color: C.gray900, fontWeight: 600 }}>
                {item.actor?.name ?? "Sistema"}
              </span>{" "}
              {actionLabel(item)} ·{" "}
              <span style={{ color: C.gray500 }}>{timeAgo(item.created_at)}</span>
            </li>
          )
        })}
      </ul>
    </BlockSection>
  )
}
