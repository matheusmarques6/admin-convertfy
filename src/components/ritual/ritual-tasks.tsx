"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRight, Check, Plus, Paperclip, MoreHorizontal, Calendar, Trash2,
} from "lucide-react"

const C = {
  brand: "#4E62D8",
  white: "#FFFFFF",
  g25: "#FAFBFC",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#4B5563",
  g700: "#374151",
  g900: "#111827",
  border: "rgba(0,0,0,0.08)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
  pos: "#065F46",
  posBg: "#ECFDF5",
  posBorder: "#A7F3D0",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
  purpleBorder: "#DDD6FE",
  info: "#2137B6",
  infoBg: "#EEF0FB",
  infoBorder: "#C7CDEF",
}

const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

const TONE_MAP: Record<string, { bg: string; color: string; border: string; dot: string; label: string; avatarBg: string; avatarC: string }> = {
  risk: { bg: C.negBg, color: C.neg, border: C.negBorder, dot: "#B91C1C", label: "Em risco", avatarBg: "#FEF2F2", avatarC: "#991B1B" },
  attention: { bg: C.warnBg, color: C.warn, border: C.warnBorder, dot: "#B45309", label: "Em atenção", avatarBg: "#FFFBEB", avatarC: "#92400E" },
  renewal: { bg: C.purpleBg, color: C.purple, border: C.purpleBorder, dot: "#7C3AED", label: "Renovação", avatarBg: "#F3E8FF", avatarC: "#7C3AED" },
  rampup: { bg: C.infoBg, color: C.info, border: C.infoBorder, dot: "#4E62D8", label: "Ramp-up", avatarBg: "#EEF0FB", avatarC: "#4E62D8" },
  healthy: { bg: C.posBg, color: C.pos, border: C.posBorder, dot: "#065F46", label: "Saudável", avatarBg: "#ECFDF5", avatarC: "#065F46" },
}

const PRIO_MAP: Record<string, { bg: string; color: string; border: string; label: string }> = {
  high: { bg: C.negBg, color: C.neg, border: C.negBorder, label: "Alta" },
  med: { bg: C.warnBg, color: C.warn, border: C.warnBorder, label: "Média" },
  low: { bg: C.g100, color: C.g600, border: C.g200, label: "Baixa" },
}

interface TaskItem {
  id: string
  title: string
  ownerName: string
  ownerRole: string
  dueDate: string
  priority: "high" | "med" | "low"
  origin: string
  approved: boolean
  discarded: boolean
}

interface TaskBlock {
  storeId: string
  storeName: string
  state: string
  summary: string
  tasks: TaskItem[]
}

const MOCK_BLOCKS: TaskBlock[] = [
  {
    storeId: "s03", storeName: "Garauto", state: "attention",
    summary: "Atacar primeiro o welcome flow (52% do problema) com A/B de subject.",
    tasks: [
      { id: "t01", title: "Lançar A/B de subject no welcome flow", ownerName: "Mariana Costa", ownerRole: "Designer", dueDate: "Ter 20/05", priority: "high", origin: '"Vamos no A/B de subject primeiro..."', approved: true, discarded: false },
      { id: "t02", title: "Refresh visual do header (nova cor + CTA)", ownerName: "Mariana Costa", ownerRole: "Designer", dueDate: "Qui 22/05", priority: "med", origin: '"Refresh do header agenda pra semana que vem..."', approved: true, discarded: false },
      { id: "t03", title: "Ajustar gatilho do cart abandoned pra 30min", ownerName: "Pedro Ramos", ownerRole: "Ops", dueDate: "Seg 19/05", priority: "high", origin: '"O gatilho de 4h tá matando recuperação..."', approved: true, discarded: false },
      { id: "t04", title: "Avaliar segmentação engaged vs novos no welcome", ownerName: "Jean Carlos", ownerRole: "Estrategista", dueDate: "Qua 21/05", priority: "low", origin: '"Vale a pena segmentar entre engaged e novo..."', approved: true, discarded: false },
    ],
  },
  {
    storeId: "s01", storeName: "Salvini Labs", state: "risk",
    summary: "Limpar lista quente (1.8k inativos) pra proteger reputação.",
    tasks: [
      { id: "t05", title: "Limpar 1.847 contatos inativos da lista quente", ownerName: "Pedro Ramos", ownerRole: "Ops", dueDate: "Seg 19/05", priority: "high", origin: '"Tem que limpar antes do provedor marcar como spam..."', approved: true, discarded: false },
      { id: "t06", title: "Pausar fluxo de reativação até nova lista", ownerName: "Pedro Ramos", ownerRole: "Ops", dueDate: "Hoje", priority: "high", origin: '"Pausa o reativação agora..."', approved: true, discarded: false },
      { id: "t07", title: "Replanejar pacote de campanhas da semana", ownerName: "Jean Carlos", ownerRole: "Estrategista", dueDate: "Qua 21/05", priority: "med", origin: '"Jean repensa o pacote da semana..."', approved: true, discarded: false },
    ],
  },
  {
    storeId: "s02", storeName: "Donaris Joias", state: "renewal",
    summary: "Preparar proposta de renovação 12m com desconto em 2 entregáveis extras.",
    tasks: [
      { id: "t08", title: "Montar proposta de renovação 12m + 2 extras", ownerName: "Jean Carlos", ownerRole: "Estrategista", dueDate: "Seg 19/05", priority: "high", origin: '"Monta a proposta com 2 extras de cortesia..."', approved: true, discarded: false },
      { id: "t09", title: "Agendar call de renovação com Camila", ownerName: "Ryan Fernando", ownerRole: "CS", dueDate: "Hoje", priority: "high", origin: '"Já agenda pra terça, sem deixar a coisa esfriar..."', approved: true, discarded: false },
    ],
  },
  {
    storeId: "s04", storeName: "Dr. Groot", state: "rampup",
    summary: "Solicitação aberta: cliente quer trocar template do welcome.",
    tasks: [
      { id: "t10", title: "Mockup novo template do welcome (4 versões)", ownerName: "Mariana Costa", ownerRole: "Designer", dueDate: "Ter 20/05", priority: "med", origin: '"Faz uns 4 mockups pra Helena escolher..."', approved: true, discarded: false },
      { id: "t11", title: "Call com Helena pra apresentar mockups", ownerName: "Jean Carlos", ownerRole: "Estrategista", dueDate: "Qua 21/05", priority: "med", origin: '"Quarta a Helena vê os mockups..."', approved: true, discarded: false },
    ],
  },
]

const DISCARDED = [
  { txt: "Discutir migração pro Klaviyo (Salvini)", why: "Sem decisão final" },
  { txt: "Bruno mencionou férias do Marcos", why: "Não-acionável" },
  { txt: "Comentário sobre ferramenta de A/B", why: "Off-topic" },
]

export function RitualTasksClient({ sessionId }: { sessionId?: string }) {
  const router = useRouter()
  const [blocks, setBlocks] = useState(MOCK_BLOCKS)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  const approvedCount = useMemo(() => blocks.reduce((a, b) => a + b.tasks.filter((t) => t.approved && !t.discarded).length, 0), [blocks])
  const rejectedCount = useMemo(() => blocks.reduce((a, b) => a + b.tasks.filter((t) => t.discarded).length, 0), [blocks])

  function toggleTask(blockIdx: number, taskIdx: number) {
    setBlocks((prev) =>
      prev.map((b, bi) =>
        bi !== blockIdx ? b : {
          ...b,
          tasks: b.tasks.map((t, ti) =>
            ti !== taskIdx ? t : { ...t, approved: !t.approved }
          ),
        }
      ),
    )
  }

  async function handleApproveAll() {
    if (!sessionId) return
    setApproving(true)
    setApproveError(null)
    try {
      const approvedTasks = blocks.flatMap((b) =>
        b.tasks
          .filter((t) => t.approved && !t.discarded)
          .map((t) => ({
            title: t.title,
            store_id: b.storeId,
            assignee_id: null,
            due_date: null,
            priority: t.priority === "high" ? "high" as const : t.priority === "low" ? "low" as const : "medium" as const,
            origin_quote: t.origin,
          })),
      )

      if (approvedTasks.length === 0) {
        setApproveError("Nenhuma task aprovada para criar.")
        setApproving(false)
        return
      }

      const res = await fetch(`/api/ritual/sessions/${sessionId}/approve-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tasks: approvedTasks }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const result = await res.json()
      router.push("/admin/operacional/ritual")
    } catch (e) {
      setApproveError((e as Error).message)
      setApproving(false)
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
      <div style={{ padding: "20px 32px 0", flexShrink: 0 }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.g500, marginBottom: 12 }}>
          <span>Workflows</span>
          <ChevronRight size={12} style={{ color: C.g300 }} />
          <span>Pipelines CS</span>
          <ChevronRight size={12} style={{ color: C.g300 }} />
          <span>Ritual de sexta</span>
          <ChevronRight size={12} style={{ color: C.g300 }} />
          <span style={{ color: C.g900, fontWeight: 500 }}>Tasks geradas</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: C.g900, letterSpacing: "-0.02em" }}>
                Tasks da semana geradas pela IA
              </h1>
              <BadgeInline tone="info" dot label="aguardando aprovação" />
            </div>
            <div style={{ fontSize: 13, color: C.g500 }}>
              Revise, edite ou aprove. Após aprovação, lojas avançam para a Etapa 2 (Em otimização) do kanban semanal.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 500,
              color: C.g700, background: C.white,
              border: `1px solid ${C.g300}`, borderRadius: 8, cursor: "pointer",
            }}>Salvar rascunho</button>
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={approving}
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 600,
                color: "#fff", background: C.brand,
                border: "none", borderRadius: 8,
                cursor: approving ? "wait" : "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              <Check size={15} /> {approving ? "Aprovando..." : `Aprovar ${approvedCount} e mover lojas`}
            </button>
          </div>
        </div>

        {approveError && (
          <div style={{ marginTop: 8, padding: "8px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12.5, color: "#991B1B" }}>
            {approveError}
          </div>
        )}

        {/* KPI bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "10px 14px",
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
          marginTop: 16, fontSize: 12.5,
        }}>
          <KPIChip dot="#10B981" value={approvedCount} label="aprovadas" />
          <span style={{ color: C.g300 }}>·</span>
          <KPIChip dot={C.g300} value={rejectedCount} label="rejeitadas" />
          <span style={{ color: C.g300 }}>·</span>
          <KPIChip dot={C.warn} value={0} label="editadas" />
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <GhostBtn>Por loja</GhostBtn>
            <GhostBtn>Por responsável</GhostBtn>
            <GhostBtn>Por prioridade</GhostBtn>
          </span>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {blocks.map((b) => (
            <FilterChip key={b.storeId} state={b.state}>{b.storeName}</FilterChip>
          ))}
          <span style={{ color: C.g300, alignSelf: "center", margin: "0 4px" }}>·</span>
          <FilterChip>Designer</FilterChip>
          <FilterChip>Ops</FilterChip>
          <FilterChip>Estrategista</FilterChip>
          <FilterChip>CS</FilterChip>
        </div>
      </div>

      {/* Tasks list + sidebar */}
      <div style={{ padding: "20px 32px 40px", display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {blocks.map((block, blockIdx) => (
            <TaskBlockCard key={block.storeId} block={block} blockIdx={blockIdx} onToggleTask={toggleTask} />
          ))}
        </div>

        {/* Side: discarded */}
        <aside style={{
          width: 280, flexShrink: 0, alignSelf: "flex-start",
          background: C.white, border: `1px dashed ${C.border}`, borderRadius: 12,
          padding: 14, position: "sticky", top: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Trash2 size={14} style={{ color: C.g400 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.g700 }}>Tasks descartadas pela IA</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: C.g500, ...TNUM }}>{DISCARDED.length}</span>
          </div>
          <div style={{ fontSize: 11, color: C.g500, marginBottom: 12 }}>
            Coisas que apareceram na conversa mas a IA julgou não-acionáveis. Toque para reverter.
          </div>
          {DISCARDED.map((d, i) => (
            <div key={i} style={{
              padding: "8px 10px", marginBottom: 6,
              background: C.g25, border: `1px solid ${C.border}`,
              borderRadius: 6, cursor: "pointer",
            }}>
              <div style={{ fontSize: 12, color: C.g700, lineHeight: 1.4 }}>{d.txt}</div>
              <div style={{ fontSize: 10.5, color: C.g400, marginTop: 3 }}>{d.why}</div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

function TaskBlockCard({ block, blockIdx, onToggleTask }: { block: TaskBlock; blockIdx: number; onToggleTask: (bi: number, ti: number) => void }) {
  const tone = TONE_MAP[block.state] ?? TONE_MAP.healthy!
  return (
    <section style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: "hidden", boxShadow: C.shadowSm,
    }}>
      <header style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
        padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
        background: C.g25,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8,
          background: tone.avatarBg, color: tone.avatarC,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700,
        }}>{block.storeName[0]}</div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.g900 }}>{block.storeName}</span>
            <BadgeInline tone={block.state === "risk" ? "neg" : block.state === "attention" ? "warn" : block.state === "renewal" ? "purple" : "info"} dot label={tone.label} />
            <span style={{ fontSize: 11, color: C.g400 }}>·</span>
            <span style={{ fontSize: 11.5, color: C.g500, ...TNUM }}>{block.tasks.length} tasks</span>
          </div>
          <div style={{ fontSize: 12, color: C.g500, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600, color: C.g600 }}>Decisão da call:</strong> {block.summary}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <GhostBtn icon={<Plus size={12} />}>Adicionar</GhostBtn>
        </div>
      </header>

      <div>
        {block.tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} isFirst={i === 0} onToggle={() => onToggleTask(blockIdx, i)} />
        ))}
      </div>
    </section>
  )
}

function TaskRow({ task, isFirst, onToggle }: { task: TaskItem; isFirst: boolean; onToggle: () => void }) {
  const prio = PRIO_MAP[task.priority] ?? PRIO_MAP.med!
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "32px 1fr auto auto auto 24px",
      gap: 14, alignItems: "center", padding: "14px 18px",
      borderTop: isFirst ? "none" : `1px solid ${C.g100}`,
    }}>
      {/* Checkbox */}
      <div
        onClick={onToggle}
        style={{
          width: 20, height: 20, borderRadius: 5,
          border: `1.5px solid ${C.brand}`, background: task.approved ? C.brand : C.white,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "#fff", cursor: "pointer",
        }}
      >{task.approved && <Check size={12} />}</div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: C.g900, marginBottom: 6, lineHeight: 1.4 }}>
          {task.title}
        </div>
        <div style={{
          display: "inline-flex", alignItems: "flex-start", gap: 6,
          padding: "5px 10px", background: C.g25,
          border: `1px dashed ${C.border}`, borderRadius: 6,
          fontSize: 11, color: C.g500, fontStyle: "italic",
          maxWidth: "100%",
        }}>
          <Paperclip size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{
            fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 520,
          }}>{task.origin}</span>
          <span style={{ color: C.brand, marginLeft: 4, fontStyle: "normal", cursor: "pointer", flexShrink: 0 }}>ver trecho</span>
        </div>
      </div>

      {/* Owner */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: C.g50, borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer" }}>
        <MiniAvatar name={task.ownerName} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.g900, lineHeight: 1.2 }}>{task.ownerName.split(" ")[0]}</div>
          <div style={{ fontSize: 10, color: C.g400 }}>{task.ownerRole}</div>
        </div>
      </div>

      {/* Due */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: C.g50, borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer" }}>
        <Calendar size={13} style={{ color: C.g500 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: C.g700, ...TNUM }}>{task.dueDate}</span>
      </div>

      {/* Priority */}
      <span style={{
        display: "inline-flex", alignItems: "center",
        fontSize: 11, fontWeight: 600, padding: "3px 9px",
        color: prio.color, background: prio.bg,
        border: `1px solid ${prio.border}`, borderRadius: 999,
      }}>{prio.label}</span>

      <MoreHorizontal size={15} style={{ color: C.g400, cursor: "pointer" }} />
    </div>
  )
}

/* ────────── Micro ────────── */

function BadgeInline({ tone, dot, label }: { tone: string; dot?: boolean; label: string }) {
  const map: Record<string, { bg: string; color: string; border: string; dotColor: string }> = {
    pos: { bg: C.posBg, color: C.pos, border: C.posBorder, dotColor: "#10B981" },
    neg: { bg: C.negBg, color: C.neg, border: C.negBorder, dotColor: "#EF4444" },
    warn: { bg: C.warnBg, color: C.warn, border: C.warnBorder, dotColor: "#F59E0B" },
    purple: { bg: C.purpleBg, color: C.purple, border: C.purpleBorder, dotColor: C.purple },
    info: { bg: C.infoBg, color: C.info, border: C.infoBorder, dotColor: C.brand },
  }
  const t = map[tone] ?? map.pos!
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px",
      color: t.color, background: t.bg,
      border: `1px solid ${t.border}`, borderRadius: 999,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dotColor }} />}
      {label}
    </span>
  )
}

function KPIChip({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
      <strong style={{ fontWeight: 600, color: C.g900, ...TNUM }}>{value}</strong>
      <span style={{ color: C.g500 }}>{label}</span>
    </span>
  )
}

function FilterChip({ state, children }: { state?: string; children: React.ReactNode }) {
  const dot = state ? TONE_MAP[state]?.dot : undefined
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 10px", background: C.white, color: C.g700,
      border: `1px solid ${C.border}`,
      borderRadius: 999, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
      {children}
    </span>
  )
}

function GhostBtn({ children, icon, onClick }: { children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "5px 10px", fontSize: 11.5, fontWeight: 500,
      color: C.g700, background: "transparent",
      border: `1px solid ${C.border}`, borderRadius: 6,
      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {icon}
      {children}
    </button>
  )
}

function MiniAvatar({ name }: { name: string }) {
  const initial = (name[0] || "?").toUpperCase()
  const colors = [
    { bg: "#DBEAFE", c: "#1E40AF" },
    { bg: "#FEF3C7", c: "#92400E" },
    { bg: "#D1FAE5", c: "#065F46" },
    { bg: "#E0E7FF", c: "#4338CA" },
    { bg: "#FCE7F3", c: "#9D174D" },
  ]
  const hash = name.split("").reduce((h, c) => h + c.charCodeAt(0), 0)
  const col = colors[hash % colors.length]!
  return (
    <div style={{
      width: 22, height: 22, borderRadius: "50%",
      background: col.bg, color: col.c,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 700,
    }}>{initial}</div>
  )
}
