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
  Panel,
  MarkerType,
  NodeTypes,
  Handle,
  Position,
} from "reactflow"
import "reactflow/dist/style.css"
import {
  Zap,
  Play,
  Mail,
  MessageSquare,
  Phone,
  Bell,
  Webhook,
  Clock,
  Trash2,
  Settings,
  Timer,
  Users,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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

// Trigger types
const triggerTypes = [
  { type: "new_client", label: "Novo Cliente", icon: Users, color: "bg-blue-500", category: "clients" },
  { type: "client_status_changed", label: "Status Alterado", icon: Users, color: "bg-blue-500", category: "clients" },
  { type: "payment_confirmed", label: "Pagamento Confirmado", icon: DollarSign, color: "bg-emerald-500", category: "financial" },
  { type: "payment_overdue", label: "Pagamento Vencido", icon: AlertCircle, color: "bg-red-500", category: "financial" },
  { type: "meeting_scheduled", label: "Reunião Agendada", icon: Calendar, color: "bg-purple-500", category: "meetings" },
  { type: "meeting_reminder", label: "Lembrete de Reunião", icon: Clock, color: "bg-purple-500", category: "meetings" },
  { type: "report_due", label: "Relatório Pendente", icon: FileText, color: "bg-amber-500", category: "reports" },
  { type: "deal_won", label: "Deal Ganho", icon: Target, color: "bg-emerald-500", category: "deals" },
  { type: "deal_lost", label: "Deal Perdido", icon: Target, color: "bg-red-500", category: "deals" },
]

// Action types
const actionTypes = [
  { type: "send_email", label: "Enviar Email", icon: Mail, color: "bg-blue-500" },
  { type: "send_whatsapp", label: "Enviar WhatsApp", icon: MessageSquare, color: "bg-emerald-500" },
  { type: "send_sms", label: "Enviar SMS", icon: Phone, color: "bg-violet-500" },
  { type: "send_notification", label: "Notificação", icon: Bell, color: "bg-amber-500" },
  { type: "webhook", label: "Webhook", icon: Webhook, color: "bg-slate-500" },
  { type: "delay", label: "Aguardar", icon: Timer, color: "bg-gray-500" },
]

// Custom Node Components
function TriggerNode({ data, selected }: { data: { label: string; type: string; config?: Record<string, unknown> }; selected: boolean }) {
  const trigger = triggerTypes.find(t => t.type === data.type)
  const Icon = trigger?.icon || Zap

  return (
    <div className={cn(
      "px-4 py-3 rounded-lg border-2 bg-card shadow-lg min-w-[200px] transition-all",
      selected ? "border-primary ring-2 ring-primary/20" : "border-border",
    )}>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", trigger?.color || "bg-amber-500")}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Quando</p>
          <p className="font-medium text-sm">{data.label}</p>
        </div>
      </div>
    </div>
  )
}

function ActionNode({ data, selected }: { data: { label: string; type: string; config?: Record<string, unknown> }; selected: boolean }) {
  const action = actionTypes.find(a => a.type === data.type)
  const Icon = action?.icon || Play

  return (
    <div className={cn(
      "px-4 py-3 rounded-lg border-2 bg-card shadow-lg min-w-[200px] transition-all",
      selected ? "border-primary ring-2 ring-primary/20" : "border-border",
    )}>
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", action?.color || "bg-emerald-500")}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ação</p>
          <p className="font-medium text-sm">{data.label}</p>
        </div>
      </div>
      {data.type === "delay" && (data.config as { minutes?: number })?.minutes && (
        <Badge variant="secondary" className="mt-2 text-xs">
          {(data.config as { minutes?: number }).minutes} minutos
        </Badge>
      )}
    </div>
  )
}

function DelayNode({ data, selected }: { data: { label: string; config?: Record<string, unknown> }; selected: boolean }) {
  return (
    <div className={cn(
      "px-4 py-3 rounded-lg border-2 bg-card shadow-lg min-w-[150px] transition-all",
      selected ? "border-primary ring-2 ring-primary/20" : "border-border border-dashed",
    )}>
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Aguardar {(data.config as { minutes?: number })?.minutes || 0} min
        </span>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  delay: DelayNode,
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
      position: { x: 250, y: 50 },
      data: { label: "Selecione um gatilho", type: "" },
    },
  ]

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        animated: true,
        style: { strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setIsPanelOpen(true)
  }, [])

  const addNode = useCallback((type: "trigger" | "action" | "delay", nodeType: string, label: string) => {
    const lastNode = nodes[nodes.length - 1]
    const newPosition = {
      x: lastNode ? lastNode.position.x : 250,
      y: lastNode ? lastNode.position.y + 120 : 50,
    }

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: newPosition,
      data: { label, type: nodeType, config: {} },
    }

    setNodes((nds) => [...nds, newNode])

    // Auto-connect to last node
    if (lastNode && type !== "trigger") {
      const newEdge: Edge = {
        id: `edge-${lastNode.id}-${newNode.id}`,
        source: lastNode.id,
        target: newNode.id,
        animated: true,
        style: { strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed },
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

  // Notify parent of changes
  useMemo(() => {
    onChange?.(nodes, edges)
  }, [nodes, edges, onChange])

  return (
    <div className="h-[600px] relative rounded-lg border bg-muted/30 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.2)" />
        <Controls className="!bg-card !border-border !shadow-lg" />

        {/* Add Node Panel */}
        <Panel position="top-left" className="space-y-2">
          <div className="bg-card border rounded-lg p-3 shadow-lg space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Gatilhos</p>
              <div className="flex flex-wrap gap-1">
                {triggerTypes.slice(0, 4).map((trigger) => (
                  <Button
                    key={trigger.type}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      // Update the trigger node if it exists
                      const triggerNode = nodes.find(n => n.type === "trigger")
                      if (triggerNode) {
                        updateNodeData(triggerNode.id, { label: trigger.label, type: trigger.type })
                      } else {
                        addNode("trigger", trigger.type, trigger.label)
                      }
                    }}
                  >
                    <trigger.icon className="h-3 w-3 mr-1" />
                    {trigger.label}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Ações</p>
              <div className="flex flex-wrap gap-1">
                {actionTypes.map((action) => (
                  <Button
                    key={action.type}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addNode(action.type === "delay" ? "delay" : "action", action.type, action.label)}
                  >
                    <action.icon className="h-3 w-3 mr-1" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* Stats Panel */}
        <Panel position="top-right" className="bg-card border rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>{nodes.filter(n => n.type === "trigger").length} gatilho</span>
            </div>
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-emerald-500" />
              <span>{nodes.filter(n => n.type === "action" || n.type === "delay").length} ações</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Node Configuration Sheet */}
      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent className="w-[400px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar {selectedNode?.type === "trigger" ? "Gatilho" : "Ação"}
            </SheetTitle>
            <SheetDescription>
              Configure os parâmetros deste nó
            </SheetDescription>
          </SheetHeader>

          {selectedNode && (
            <ScrollArea className="h-[calc(100vh-200px)] mt-6 pr-4">
              <div className="space-y-6">
                {/* Node Type */}
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={selectedNode.data.type}
                    onValueChange={(value) => {
                      const items = selectedNode.type === "trigger" ? triggerTypes : actionTypes
                      const item = items.find(i => i.type === value)
                      updateNodeData(selectedNode.id, { type: value, label: item?.label || value })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedNode.type === "trigger" ? triggerTypes : actionTypes).map((item) => (
                        <SelectItem key={item.type} value={item.type}>
                          <div className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action-specific configs */}
                {selectedNode.type === "action" && selectedNode.data.type === "send_email" && (
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

                {selectedNode.type === "action" && selectedNode.data.type === "send_whatsapp" && (
                  <div className="space-y-2">
                    <Label>Mensagem WhatsApp</Label>
                    <Textarea
                      placeholder="Escreva a mensagem..."
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

                {selectedNode.type === "action" && selectedNode.data.type === "webhook" && (
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

                {(selectedNode.type === "delay" || selectedNode.data.type === "delay") && (
                  <div className="space-y-2">
                    <Label>Tempo de espera (minutos)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={(selectedNode.data.config as { minutes?: number })?.minutes || 0}
                      onChange={(e) =>
                        updateNodeData(selectedNode.id, {
                          config: { ...selectedNode.data.config, minutes: parseInt(e.target.value) || 0 },
                        })
                      }
                    />
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
  )
}
