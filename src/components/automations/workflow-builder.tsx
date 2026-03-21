"use client"

import { useState, useCallback, useMemo } from "react"
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
  MarkerType,
  NodeTypes,
  Handle,
  Position,
} from "reactflow"
import "reactflow/dist/style.css"
import {
  Zap,
  Mail,
  MessageSquare,
  Phone,
  Webhook,
  Clock,
  Trash2,
  Settings,
  Users,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  Target,
  GitBranch,
  Shuffle,
  Code,
  HelpCircle,
  Crown,
  TrendingDown,
  ArrowRight,
  PlusCircle,
  ScrollText,
  Bell,
  Tag,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Trigger types — aligned with AutomationTriggerType
const triggerTypes = [
  { type: "new_client", label: "Novo Cliente cadastrado", icon: Users, color: "#22c55e" },
  { type: "client_status_changed", label: "Status de cliente alterado", icon: RefreshCw, color: "#22c55e" },
  { type: "payment_confirmed", label: "Pagamento confirmado", icon: DollarSign, color: "#22c55e" },
  { type: "payment_overdue", label: "Pagamento vencido", icon: AlertCircle, color: "#22c55e" },
  { type: "meeting_overdue", label: "Reunião atrasada", icon: Calendar, color: "#22c55e" },
  { type: "meeting_upcoming", label: "Reunião próxima", icon: Clock, color: "#22c55e" },
  { type: "report_overdue", label: "Relatório atrasado", icon: FileText, color: "#22c55e" },
  { type: "contract_expiring", label: "Contrato expirando", icon: ScrollText, color: "#22c55e" },
  { type: "revenue_dropped", label: "Queda de receita", icon: TrendingDown, color: "#22c55e" },
  { type: "deal_moved", label: "Deal movido", icon: ArrowRight, color: "#22c55e" },
  { type: "deal_created", label: "Deal criado", icon: PlusCircle, color: "#22c55e" },
  { type: "deal_won", label: "Deal ganho", icon: Target, color: "#22c55e" },
  { type: "deal_lost", label: "Deal perdido", icon: Target, color: "#22c55e" },
  { type: "scheduled_date", label: "Data agendada", icon: Calendar, color: "#22c55e" },
]

// Action types — aligned with AutomationActionType
const actionTypes = [
  { type: "send_email", label: "Enviar E-mail", icon: Mail, color: "#3b82f6" },
  { type: "send_whatsapp", label: "Enviar WhatsApp", icon: MessageSquare, color: "#22c55e" },
  { type: "send_sms", label: "Enviar SMS", icon: Phone, color: "#8b5cf6" },
  { type: "create_task", label: "Criar Tarefa", icon: PlusCircle, color: "#f59e0b" },
  { type: "send_notification", label: "Enviar Notificação", icon: Bell, color: "#f59e0b" },
  { type: "update_field", label: "Atualizar Campo", icon: RefreshCw, color: "#6366f1" },
  { type: "update_status", label: "Atualizar Status", icon: ArrowRight, color: "#6366f1" },
  { type: "add_tag", label: "Adicionar Tag", icon: Tag, color: "#14b8a6" },
  { type: "remove_tag", label: "Remover Tag", icon: Tag, color: "#ef4444" },
  { type: "create_invoice", label: "Criar Fatura", icon: DollarSign, color: "#f59e0b" },
  { type: "schedule_meeting", label: "Agendar Reunião", icon: Calendar, color: "#3b82f6" },
  { type: "webhook", label: "Enviar Webhook", icon: Webhook, color: "#6b7280", premium: true },
]

// Logic types
const logicTypes = [
  { type: "condition", label: "Condição", icon: GitBranch, color: "#3b82f6" },
  { type: "condition_multiple", label: "Condição múltipla", icon: GitBranch, color: "#8b5cf6" },
  { type: "randomizer", label: "Randomizador", icon: Shuffle, color: "#ef4444" },
  { type: "execute_script", label: "Executar", icon: Code, color: "#f59e0b" },
]

// Custom Node: Trigger (green)
function TriggerNode({ data, selected }: { data: { label: string; type: string; config?: Record<string, unknown> }; selected: boolean }) {
  return (
    <div className={cn(
      "relative rounded-xl shadow-lg min-w-[180px] transition-all",
      selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
    )}>
      {/* Green top bar */}
      <div className="h-2 bg-emerald-500 rounded-t-xl" />

      <div className="bg-card border border-t-0 rounded-b-xl px-4 py-3">
        <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" />

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Gatilho</p>
            <p className="font-medium text-sm truncate">{data.label || "Selecione..."}</p>
          </div>
        </div>
      </div>

      {/* Next step label */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
        Próxima etapa
      </div>
    </div>
  )
}

// Custom Node: Action
function ActionNode({ data, selected }: { data: { label: string; type: string; config?: Record<string, unknown> }; selected: boolean }) {
  const action = actionTypes.find(a => a.type === data.type)
  const color = action?.color || "#3b82f6"

  return (
    <div className={cn(
      "relative rounded-xl shadow-lg min-w-[180px] transition-all",
      selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
    )}>
      {/* Colored top bar */}
      <div className="h-2 rounded-t-xl" style={{ backgroundColor: color }} />

      <div className="bg-card border border-t-0 rounded-b-xl px-4 py-3">
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !border-background" style={{ backgroundColor: color }} />
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !border-background" style={{ backgroundColor: color }} />

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
            {action?.icon ? <action.icon className="h-4 w-4" style={{ color }} /> : <Mail className="h-4 w-4" style={{ color }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Ação</p>
            <p className="font-medium text-sm truncate">{data.label}</p>
          </div>
        </div>

        {/* Config preview */}
        {data.type === "send_whatsapp" && (data.config as { message?: string })?.message && (
          <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground line-clamp-2">
            {(data.config as { message?: string }).message}
          </div>
        )}
      </div>

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
        Próxima etapa
      </div>
    </div>
  )
}

// Custom Node: Delay (orange)
function DelayNode({ data, selected }: { data: { label: string; config?: Record<string, unknown> }; selected: boolean }) {
  const minutes = (data.config as { minutes?: number })?.minutes || 0
  const displayTime = minutes >= 60
    ? `${Math.floor(minutes / 60)} hora${Math.floor(minutes / 60) > 1 ? 's' : ''}`
    : `${minutes} minuto${minutes !== 1 ? 's' : ''}`

  return (
    <div className={cn(
      "relative rounded-xl shadow-lg min-w-[140px] transition-all",
      selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
    )}>
      <div className="h-2 bg-orange-500 rounded-t-xl" />

      <div className="bg-card border border-t-0 rounded-b-xl px-4 py-3">
        <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-background" />
        <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-background" />

        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10">
            <Clock className="h-3 w-3 text-orange-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Aguardar</p>
            <p className="font-medium text-sm">{displayTime}</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
        Próxima etapa
      </div>
    </div>
  )
}

// Custom Node: Condition (blue)
function ConditionNode({ data, selected }: { data: { label: string; type: string; config?: Record<string, unknown> }; selected: boolean }) {
  return (
    <div className={cn(
      "relative rounded-xl shadow-lg min-w-[160px] transition-all",
      selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
    )}>
      <div className="h-2 bg-blue-500 rounded-t-xl" />

      <div className="bg-card border border-t-0 rounded-b-xl px-4 py-3">
        <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
        <Handle type="source" position={Position.Bottom} id="yes" className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background !left-[30%]" />
        <Handle type="source" position={Position.Bottom} id="no" className="!bg-red-500 !w-3 !h-3 !border-2 !border-background !left-[70%]" />

        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <GitBranch className="h-3 w-3 text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Condição</p>
            <p className="font-medium text-sm">{data.label || "Configurar..."}</p>
          </div>
        </div>

        {/* Condition labels */}
        <div className="flex justify-between mt-2 text-[10px]">
          <span className="text-emerald-500">Atende ✓</span>
          <span className="text-red-500">Não atende ✗</span>
        </div>
      </div>
    </div>
  )
}

// Custom Node: Randomizer (red)
function RandomizerNode({ data, selected }: { data: { label: string; config?: Record<string, unknown> }; selected: boolean }) {
  const percentA = (data.config as { percentA?: number })?.percentA || 50
  const percentB = 100 - percentA

  return (
    <div className={cn(
      "relative rounded-xl shadow-lg min-w-[140px] transition-all",
      selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
    )}>
      <div className="h-2 bg-red-500 rounded-t-xl" />

      <div className="bg-card border border-t-0 rounded-b-xl px-4 py-3">
        <Handle type="target" position={Position.Top} className="!bg-red-500 !w-3 !h-3 !border-2 !border-background" />
        <Handle type="source" position={Position.Bottom} id="a" className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background !left-[30%]" />
        <Handle type="source" position={Position.Bottom} id="b" className="!bg-violet-500 !w-3 !h-3 !border-2 !border-background !left-[70%]" />

        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-500/10">
            <Shuffle className="h-3 w-3 text-red-500" />
          </div>
          <p className="font-medium text-sm">Randomizador</p>
        </div>

        {/* Percentage labels */}
        <div className="flex justify-between mt-2 text-[10px]">
          <span className="text-blue-500">A · {percentA}%</span>
          <span className="text-violet-500">B · {percentB}%</span>
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  delay: DelayNode,
  condition: ConditionNode,
  randomizer: RandomizerNode,
}

interface WorkflowBuilderProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onChange?: (nodes: Node[], edges: Edge[]) => void
}

export function WorkflowBuilder({ initialNodes = [], initialEdges = [], onChange }: WorkflowBuilderProps) {
  const defaultNodes: Node[] = initialNodes.length > 0 ? initialNodes : [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 400, y: 50 },
      data: { label: "Selecione um gatilho", type: "" },
    },
  ]

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [selectedTrigger, setSelectedTrigger] = useState(initialNodes?.[0]?.data?.type || "")

  // Trigger conditions
  const [conditions, setConditions] = useState({
    removeOnNewCart: true,
    removeOnNewOrder: true,
    removeOnPaidOrder: true,
  })

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: "smoothstep",
        animated: false,
        style: {
          strokeWidth: 2,
          stroke: "var(--muted-foreground)",
          strokeDasharray: "5 5",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setIsPanelOpen(true)
  }, [])

  const addNode = useCallback((type: string, nodeData: { type: string; label: string }) => {
    const lastNode = nodes[nodes.length - 1]
    const newPosition = {
      x: lastNode ? lastNode.position.x : 400,
      y: lastNode ? lastNode.position.y + 150 : 50,
    }

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: newPosition,
      data: { label: nodeData.label, type: nodeData.type, config: {} },
    }

    setNodes((nds) => [...nds, newNode])

    // Auto-connect to last node
    if (lastNode) {
      const newEdge: Edge = {
        id: `edge-${lastNode.id}-${newNode.id}`,
        source: lastNode.id,
        target: newNode.id,
        type: "smoothstep",
        animated: false,
        style: {
          strokeWidth: 2,
          stroke: "var(--muted-foreground)",
          strokeDasharray: "5 5",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
      }
      setEdges((eds) => [...eds, newEdge])
    }
  }, [nodes, setNodes, setEdges])

  const updateNodeData = useCallback((nodeId: string, newData: Partial<Node["data"]>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      )
    )
  }, [setNodes])

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId))
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    setSelectedNode(null)
    setIsPanelOpen(false)
  }, [setNodes, setEdges])

  const handleTriggerChange = useCallback((value: string) => {
    setSelectedTrigger(value)
    const trigger = triggerTypes.find(t => t.type === value)
    const triggerNode = nodes.find(n => n.type === "trigger")
    if (triggerNode && trigger) {
      updateNodeData(triggerNode.id, { label: trigger.label, type: trigger.type })
    }
  }, [nodes, updateNodeData])

  // Notify parent of changes
  useMemo(() => {
    onChange?.(nodes, edges)
  }, [nodes, edges, onChange])

  return (
    <TooltipProvider>
      <div className="flex h-[700px] rounded-lg border bg-background overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[280px] border-r bg-card flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Trigger Section */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Gatilho</Label>
                <Select value={selectedTrigger} onValueChange={handleTriggerChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o gatilho..." />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerTypes.map((trigger) => (
                      <SelectItem key={trigger.type} value={trigger.type}>
                        <div className="flex items-center gap-2">
                          <trigger.icon className="h-4 w-4" />
                          {trigger.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Conditions */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Remover se houver carrinho novo</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove o contato do fluxo se um novo carrinho for criado</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Switch
                      checked={conditions.removeOnNewCart}
                      onCheckedChange={(checked) => setConditions(c => ({ ...c, removeOnNewCart: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Remover se houver pedido novo</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove o contato do fluxo se um novo pedido for criado</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Switch
                      checked={conditions.removeOnNewOrder}
                      onCheckedChange={(checked) => setConditions(c => ({ ...c, removeOnNewOrder: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Remover se houver pedido pago</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove o contato do fluxo se o pedido for pago</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Switch
                      checked={conditions.removeOnPaidOrder}
                      onCheckedChange={(checked) => setConditions(c => ({ ...c, removeOnPaidOrder: checked }))}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* WhatsApp Profile (placeholder) */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Perfil do WhatsApp</Label>
                <Select defaultValue="default">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Convertfy - Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Actions Section */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ação</Label>
                <div className="grid grid-cols-2 gap-2">
                  {actionTypes.map((action) => (
                    <Button
                      key={action.type}
                      variant="secondary"
                      size="sm"
                      className="h-auto py-3 px-3 flex flex-col items-center gap-1.5 relative hover:border-primary/50"
                      onClick={() => addNode("action", { type: action.type, label: action.label })}
                    >
                      {action.premium && (
                        <Crown className="h-3 w-3 text-amber-500 absolute top-1 right-1" />
                      )}
                      <div
                        className="p-1.5 rounded-lg"
                        style={{ backgroundColor: `${action.color}20` }}
                      >
                        <action.icon className="h-4 w-4" style={{ color: action.color }} />
                      </div>
                      <span className="text-xs text-center leading-tight">{action.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Delay */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tempo</Label>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-auto py-3 px-3 flex items-center gap-2 hover:border-primary/50"
                  onClick={() => addNode("delay", { type: "delay", label: "Aguardar" })}
                >
                  <div className="p-1.5 rounded-lg bg-orange-500/20">
                    <Clock className="h-4 w-4 text-orange-500" />
                  </div>
                  <span className="text-sm">Aguardar</span>
                </Button>
              </div>

              <Separator />

              {/* Logic Section */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Lógico</Label>
                <div className="grid grid-cols-2 gap-2">
                  {logicTypes.map((logic) => (
                    <Button
                      key={logic.type}
                      variant="secondary"
                      size="sm"
                      className="h-auto py-3 px-3 flex flex-col items-center gap-1.5 hover:border-primary/50"
                      onClick={() => addNode(
                        logic.type === "randomizer" ? "randomizer" : "condition",
                        { type: logic.type, label: logic.label }
                      )}
                    >
                      <div
                        className="p-1.5 rounded-lg"
                        style={{ backgroundColor: `${logic.color}20` }}
                      >
                        <logic.icon className="h-4 w-4" style={{ color: logic.color }} />
                      </div>
                      <span className="text-xs text-center leading-tight">{logic.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-muted/30"
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: false,
              style: {
                strokeWidth: 2,
                stroke: "var(--muted-foreground)",
                strokeDasharray: "5 5",
              },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="color-mix(in srgb, var(--muted-foreground) 15%, transparent)"
            />
            <Controls
              className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
            />
          </ReactFlow>

          {/* Stats overlay */}
          <div className="absolute top-4 right-4 bg-card border rounded-lg px-4 py-2 shadow-lg flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">{nodes.filter(n => n.type === "trigger").length} gatilho</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">{nodes.filter(n => n.type === "action").length} ações</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">{nodes.filter(n => n.type === "delay").length} delays</span>
            </div>
          </div>
        </div>

        {/* Node Configuration Sheet */}
        <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
          <SheetContent className="w-[400px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurar {selectedNode?.type === "trigger" ? "Gatilho" : selectedNode?.type === "delay" ? "Delay" : "Ação"}
              </SheetTitle>
              <SheetDescription>
                Configure os parâmetros deste nó
              </SheetDescription>
            </SheetHeader>

            {selectedNode && (
              <ScrollArea className="h-[calc(100vh-200px)] mt-6 pr-4">
                <div className="space-y-6">
                  {/* Trigger config */}
                  {selectedNode.type === "trigger" && (
                    <div className="space-y-2">
                      <Label>Tipo de Gatilho</Label>
                      <Select
                        value={selectedNode.data.type}
                        onValueChange={(value) => {
                          const trigger = triggerTypes.find(t => t.type === value)
                          updateNodeData(selectedNode.id, { type: value, label: trigger?.label || value })
                          setSelectedTrigger(value)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {triggerTypes.map((trigger) => (
                            <SelectItem key={trigger.type} value={trigger.type}>
                              <div className="flex items-center gap-2">
                                <trigger.icon className="h-4 w-4" />
                                {trigger.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Action configs */}
                  {selectedNode.type === "action" && (
                    <>
                      <div className="space-y-2">
                        <Label>Tipo de Ação</Label>
                        <Select
                          value={selectedNode.data.type}
                          onValueChange={(value) => {
                            const action = actionTypes.find(a => a.type === value)
                            updateNodeData(selectedNode.id, { type: value, label: action?.label || value })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {actionTypes.map((action) => (
                              <SelectItem key={action.type} value={action.type}>
                                <div className="flex items-center gap-2">
                                  <action.icon className="h-4 w-4" />
                                  {action.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedNode.data.type === "send_email" && (
                        <>
                          <div className="space-y-2">
                            <Label>Assunto</Label>
                            <Input
                              placeholder="Assunto do email..."
                              value={(selectedNode.data.config as { subject?: string })?.subject || ""}
                              onChange={(e) =>
                                updateNodeData(selectedNode.id, {
                                  config: { ...selectedNode.data.config, subject: e.target.value },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Corpo do Email</Label>
                            <Textarea
                              placeholder="Escreva o conteúdo do email..."
                              rows={5}
                              value={(selectedNode.data.config as { body?: string })?.body || ""}
                              onChange={(e) =>
                                updateNodeData(selectedNode.id, {
                                  config: { ...selectedNode.data.config, body: e.target.value },
                                })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Use {"{{cliente.nome}}"} para variáveis dinâmicas
                            </p>
                          </div>
                        </>
                      )}

                      {selectedNode.data.type === "send_whatsapp" && (
                        <div className="space-y-2">
                          <Label>Mensagem WhatsApp</Label>
                          <Textarea
                            placeholder="Olá {{cliente.nome}}, tudo bem?"
                            rows={5}
                            value={(selectedNode.data.config as { message?: string })?.message || ""}
                            onChange={(e) =>
                              updateNodeData(selectedNode.id, {
                                config: { ...selectedNode.data.config, message: e.target.value },
                              })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Use {"{{cliente.nome}}"} para variáveis dinâmicas
                          </p>
                        </div>
                      )}

                      {selectedNode.data.type === "webhook" && (
                        <>
                          <div className="space-y-2">
                            <Label>URL do Webhook</Label>
                            <Input
                              placeholder="https://..."
                              value={(selectedNode.data.config as { url?: string })?.url || ""}
                              onChange={(e) =>
                                updateNodeData(selectedNode.id, {
                                  config: { ...selectedNode.data.config, url: e.target.value },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Método</Label>
                            <Select
                              value={(selectedNode.data.config as { method?: string })?.method || "POST"}
                              onValueChange={(value) =>
                                updateNodeData(selectedNode.id, {
                                  config: { ...selectedNode.data.config, method: value },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Delay config */}
                  {selectedNode.type === "delay" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tempo de espera</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min="0"
                            className="flex-1"
                            value={(selectedNode.data.config as { minutes?: number })?.minutes || 0}
                            onChange={(e) =>
                              updateNodeData(selectedNode.id, {
                                config: { ...selectedNode.data.config, minutes: parseInt(e.target.value) || 0 },
                              })
                            }
                          />
                          <Select defaultValue="minutes">
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Minutos</SelectItem>
                              <SelectItem value="hours">Horas</SelectItem>
                              <SelectItem value="days">Dias</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Randomizer config */}
                  {selectedNode.type === "randomizer" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Distribuição A/B</Label>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <Label className="text-xs text-blue-500">Caminho A</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={(selectedNode.data.config as { percentA?: number })?.percentA || 50}
                              onChange={(e) =>
                                updateNodeData(selectedNode.id, {
                                  config: { ...selectedNode.data.config, percentA: parseInt(e.target.value) || 50 },
                                })
                              }
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs text-violet-500">Caminho B</Label>
                            <Input
                              type="number"
                              disabled
                              value={100 - ((selectedNode.data.config as { percentA?: number })?.percentA || 50)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Condition config */}
                  {selectedNode.type === "condition" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nome da Condição</Label>
                        <Input
                          placeholder="Ex: Cliente ativo"
                          value={(selectedNode.data.config as { name?: string })?.name || ""}
                          onChange={(e) =>
                            updateNodeData(selectedNode.id, {
                              config: { ...selectedNode.data.config, name: e.target.value },
                              label: e.target.value || "Configurar...",
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo de Verificação</Label>
                        <Select
                          value={(selectedNode.data.config as { conditionType?: string })?.conditionType || ""}
                          onValueChange={(value) =>
                            updateNodeData(selectedNode.id, {
                              config: { ...selectedNode.data.config, conditionType: value },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tag_contains">Contém tag</SelectItem>
                            <SelectItem value="status_equals">Status igual a</SelectItem>
                            <SelectItem value="value_greater">Valor maior que</SelectItem>
                            <SelectItem value="custom">Personalizado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Delete button */}
                  {selectedNode.type !== "trigger" && (
                    <div className="pt-4 border-t">
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => deleteNode(selectedNode.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir Nó
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
