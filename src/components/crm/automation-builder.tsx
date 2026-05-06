"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type NodeProps,
} from "reactflow"
import "reactflow/dist/style.css"
import {
  Zap,
  GitBranch,
  Clock,
  MessageSquare,
  Sparkles,
  FileText,
  UserCheck,
  type LucideIcon,
} from "lucide-react"
import type { CrmAutomationDAG, CrmNodeType } from "@/types/crm-automation"

interface AutomationBuilderProps {
  initialDag?: CrmAutomationDAG
  onChange?: (dag: CrmAutomationDAG) => void
}

const NODE_TYPES_PALETTE: Array<{ type: CrmNodeType; label: string; icon: LucideIcon; color: string }> = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "var(--crm-warning-fg)" },
  { type: "condition", label: "Condicao", icon: GitBranch, color: "var(--crm-info-fg)" },
  { type: "wait", label: "Esperar", icon: Clock, color: "var(--crm-gray-600)" },
  { type: "action_send_whatsapp", label: "Enviar WhatsApp", icon: MessageSquare, color: "var(--crm-success-fg)" },
  { type: "action_create_activity", label: "Criar atividade", icon: FileText, color: "var(--crm-gray-700)" },
  { type: "action_assign_owner", label: "Atribuir owner", icon: UserCheck, color: "var(--crm-gray-700)" },
  { type: "ai_action", label: "AI Action", icon: Sparkles, color: "var(--crm-brand)" },
]

function CrmFlowNode({ data, selected }: NodeProps<{ label: string; type: CrmNodeType; config: Record<string, unknown>; onSelect: () => void }>) {
  const meta = NODE_TYPES_PALETTE.find((p) => p.type === data.type)
  const Icon = meta?.icon || Zap
  return (
    <div
      onClick={data.onSelect}
      style={{
        background: "var(--crm-gray-0)",
        border: `1px solid ${selected ? "var(--crm-accent)" : "var(--crm-gray-200)"}`,
        borderRadius: "var(--crm-radius-md)",
        padding: "8px 12px",
        minWidth: 180,
        boxShadow: selected ? "0 0 0 3px rgba(37,99,235,0.15)" : "var(--crm-shadow-xs)",
        cursor: "pointer",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "var(--crm-gray-400)" }} />
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center"
          style={{
            background: meta?.color || "var(--crm-gray-700)",
            color: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-sm)",
          }}
        >
          <Icon className="h-3 w-3" />
        </div>
        <div>
          <div
            style={{
              fontSize: "var(--crm-text-xs)",
              color: "var(--crm-gray-500)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: "var(--crm-weight-medium)",
            }}
          >
            {meta?.label || data.type}
          </div>
          <div
            style={{
              fontSize: "var(--crm-text-base)",
              fontWeight: "var(--crm-weight-medium)",
              color: "var(--crm-gray-900)",
            }}
          >
            {data.label || "Sem nome"}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--crm-gray-400)" }} />
    </div>
  )
}

const nodeTypes = { crmNode: CrmFlowNode }

export function AutomationBuilder({ initialDag, onChange }: AutomationBuilderProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const initialNodes: Node[] = useMemo(() => {
    return (initialDag?.nodes || [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 250, y: 50 },
        config: { trigger_type: "deal_stage_change" },
      },
    ]).map((n) => ({
      id: n.id,
      type: "crmNode",
      position: n.position || { x: 250, y: 50 },
      data: {
        label: (n.config?.label as string) || nodeLabel(n.type as CrmNodeType, n.config),
        type: n.type as CrmNodeType,
        config: n.config,
        onSelect: () => setSelectedNodeId(n.id),
      },
    }))
  }, [initialDag])

  const initialEdges: Edge[] = useMemo(() => {
    return (initialDag?.edges || []).map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.condition || undefined,
      type: "smoothstep",
      animated: true,
    }))
  }, [initialDag])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Mantem o callback em ref pra evitar re-runs do useEffect quando o
  // parent passa um onChange novo a cada render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Single source of truth: serializa o DAG sempre que nodes/edges mudam.
  // Substitui o padrao anterior de setTimeout(emit, 0) que sofria de
  // stale-closure (chamada com nodes/edges do render anterior).
  // Skipa o primeiro render pra nao sobrescrever o initialDag.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const dag: CrmAutomationDAG = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type as CrmNodeType,
        position: n.position,
        config: n.data.config || {},
      })),
      edges: edges.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        condition: typeof e.label === "string" ? e.label : undefined,
      })),
    }
    onChangeRef.current?.(dag)
  }, [nodes, edges])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: "smoothstep", animated: true }, eds))
    },
    [setEdges],
  )

  const addNode = (type: CrmNodeType) => {
    const id = `${type}-${Date.now()}`
    const newNode: Node = {
      id,
      type: "crmNode",
      position: { x: 250 + Math.random() * 100, y: 200 + nodes.length * 100 },
      data: {
        label: nodeLabel(type),
        type,
        config: {},
        onSelect: () => setSelectedNodeId(id),
      },
    }
    setNodes((nds) => [...nds, newNode])
  }

  const updateNodeConfig = (nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n
        const newConfig = { ...n.data.config, ...patch }
        return {
          ...n,
          data: {
            ...n.data,
            config: newConfig,
            label: nodeLabel(n.data.type, newConfig),
          },
        }
      }),
    )
  }

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setSelectedNodeId(null)
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="flex h-full" style={{ fontFamily: "var(--crm-font-sans)" }}>
      {/* Left palette */}
      <aside
        className="border-r overflow-auto"
        style={{
          width: 200,
          borderColor: "var(--crm-gray-200)",
          background: "var(--crm-gray-0)",
        }}
      >
        <div className="p-3">
          <h3
            style={{
              fontSize: "var(--crm-text-xs)",
              color: "var(--crm-gray-500)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: "var(--crm-weight-medium)",
              marginBottom: "var(--crm-space-3)",
            }}
          >
            Adicionar node
          </h3>
          <div className="space-y-1">
            {NODE_TYPES_PALETTE.map((p) => (
              <button
                key={p.type}
                onClick={() => addNode(p.type)}
                className="w-full text-left flex items-center gap-2 hover:bg-[color:var(--crm-gray-100)]"
                style={{
                  padding: "6px 8px",
                  borderRadius: "var(--crm-radius-sm)",
                  border: "1px solid var(--crm-gray-200)",
                  background: "var(--crm-gray-0)",
                  fontSize: "var(--crm-text-sm)",
                  color: "var(--crm-gray-800)",
                  cursor: "pointer",
                }}
              >
                <p.icon className="h-3.5 w-3.5 shrink-0" style={{ color: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative" style={{ background: "var(--crm-gray-50)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--crm-gray-300)" />
          <Controls />
        </ReactFlow>
      </div>

      {/* Right inspector */}
      {selectedNode && (
        <aside
          className="border-l overflow-auto"
          style={{
            width: 320,
            borderColor: "var(--crm-gray-200)",
            background: "var(--crm-gray-0)",
          }}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3
                style={{
                  fontSize: "var(--crm-text-md)",
                  fontWeight: "var(--crm-weight-medium)",
                  color: "var(--crm-gray-900)",
                }}
              >
                Configurar node
              </h3>
              <button
                onClick={() => deleteNode(selectedNode.id)}
                style={{
                  fontSize: "var(--crm-text-xs)",
                  color: "var(--crm-danger-fg)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
              >
                Excluir
              </button>
            </div>
            <NodeInspector
              type={selectedNode.data.type}
              config={selectedNode.data.config}
              onChange={(patch) => updateNodeConfig(selectedNode.id, patch)}
            />
          </div>
        </aside>
      )}
    </div>
  )
}

function NodeInspector({
  type,
  config,
  onChange,
}: {
  type: CrmNodeType
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  if (type === "trigger") {
    return (
      <div className="space-y-3">
        <Field label="Tipo de trigger">
          <select
            className="crm-input w-full"
            value={(config.trigger_type as string) || "deal_stage_change"}
            onChange={(e) => onChange({ trigger_type: e.target.value })}
          >
            <option value="deal_stage_change">Deal mudou de etapa</option>
            <option value="deal_created">Deal criado</option>
            <option value="lead_created">Lead criado</option>
            <option value="thread_message_received">Mensagem recebida</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        {config.trigger_type === "deal_stage_change" && (
          <Field label="Stage destino (opcional)">
            <input
              className="crm-input w-full"
              placeholder="UUID da stage"
              value={(config.to_stage_id as string) || ""}
              onChange={(e) => onChange({ to_stage_id: e.target.value })}
            />
          </Field>
        )}
      </div>
    )
  }

  if (type === "condition") {
    return (
      <div className="space-y-3">
        <Field label="Expressao">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="$.deal.value > 1000"
            value={(config.expression as string) || ""}
            onChange={(e) => onChange({ expression: e.target.value })}
          />
        </Field>
        <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          Operadores: == != &gt; &lt; &gt;= &lt;= contains in
        </p>
      </div>
    )
  }

  if (type === "wait") {
    return (
      <Field label="Aguardar (segundos)">
        <input
          type="number"
          className="crm-input w-full"
          min={1}
          value={(config.seconds as number) || 60}
          onChange={(e) => onChange({ seconds: parseInt(e.target.value, 10) })}
        />
      </Field>
    )
  }

  if (type === "action_send_whatsapp") {
    return (
      <div className="space-y-3">
        <Field label="Channel ID *">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="UUID do channel"
            value={(config.channel_id as string) || ""}
            onChange={(e) => onChange({ channel_id: e.target.value })}
          />
        </Field>
        <Field label="Para (telefone E.164 ou path)">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="$.lead.phone ou +5511..."
            value={(config.to as string) || ""}
            onChange={(e) => onChange({ to: e.target.value })}
          />
        </Field>
        <Field label="Template do corpo">
          <textarea
            className="crm-input w-full"
            style={{ height: "auto", minHeight: 80, padding: 10 }}
            placeholder="Ola {{lead.name}}, vi que voce..."
            value={(config.body_template as string) || ""}
            onChange={(e) => onChange({ body_template: e.target.value })}
          />
        </Field>
      </div>
    )
  }

  if (type === "action_create_activity") {
    return (
      <div className="space-y-3">
        <Field label="Tipo">
          <select
            className="crm-input w-full"
            value={(config.type as string) || "note"}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            <option value="note">Nota</option>
            <option value="task">Task</option>
            <option value="system">Sistema</option>
          </select>
        </Field>
        <Field label="Conteudo">
          <textarea
            className="crm-input w-full"
            style={{ height: "auto", minHeight: 60, padding: 10 }}
            placeholder="Lead {{lead.name}} qualificado..."
            value={(config.content_template as string) || ""}
            onChange={(e) => onChange({ content_template: e.target.value })}
          />
        </Field>
        <Field label="Vence em (horas)">
          <input
            type="number"
            className="crm-input w-full"
            value={(config.due_in_hours as number) || 0}
            onChange={(e) => onChange({ due_in_hours: parseInt(e.target.value, 10) || 0 })}
          />
        </Field>
      </div>
    )
  }

  if (type === "action_assign_owner") {
    return (
      <div className="space-y-3">
        <Field label="Estrategia">
          <select
            className="crm-input w-full"
            value={(config.strategy as string) || "round_robin"}
            onChange={(e) => onChange({ strategy: e.target.value })}
          >
            <option value="round_robin">Round-robin (menos carregado)</option>
            <option value="specific">Usuario especifico</option>
          </select>
        </Field>
        {config.strategy === "specific" && (
          <Field label="User ID">
            <input
              className="crm-input w-full"
              style={{ fontFamily: "var(--crm-font-mono)" }}
              placeholder="UUID do profile"
              value={(config.user_id as string) || ""}
              onChange={(e) => onChange({ user_id: e.target.value })}
            />
          </Field>
        )}
      </div>
    )
  }

  if (type === "ai_action") {
    return (
      <div className="space-y-3">
        <Field label="AI Action ID">
          <input
            className="crm-input w-full"
            style={{ fontFamily: "var(--crm-font-mono)" }}
            placeholder="UUID do AI Action"
            value={(config.ai_action_id as string) || ""}
            onChange={(e) => onChange({ ai_action_id: e.target.value })}
          />
        </Field>
        <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
          Crie AI Actions na pagina dedicada e cole o ID aqui.
        </p>
        <Field label="Input mapping (JSON)">
          <textarea
            className="crm-input w-full"
            style={{ height: "auto", minHeight: 70, padding: 10, fontFamily: "var(--crm-font-mono)" }}
            placeholder='{"lead_message": "$.thread.last_message_preview"}'
            value={JSON.stringify(config.input_mapping || {}, null, 2)}
            onChange={(e) => {
              try {
                onChange({ input_mapping: JSON.parse(e.target.value) })
              } catch {
                // ignore parse errors during typing
              }
            }}
          />
        </Field>
      </div>
    )
  }

  return <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>Sem configuracoes.</p>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        style={{
          display: "block",
          fontSize: "var(--crm-text-xs)",
          color: "var(--crm-gray-600)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

function nodeLabel(type: CrmNodeType, config?: Record<string, unknown>): string {
  switch (type) {
    case "trigger":
      return (config?.trigger_type as string) || "Trigger"
    case "condition":
      return ((config?.expression as string) || "Sem condicao").slice(0, 40)
    case "wait":
      return `Esperar ${config?.seconds || 60}s`
    case "action_send_whatsapp":
      return "Enviar WhatsApp"
    case "action_create_activity":
      return `Criar ${(config?.type as string) || "nota"}`
    case "action_assign_owner":
      return "Atribuir owner"
    case "ai_action":
      return "AI Action"
    default:
      return type
  }
}
