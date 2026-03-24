"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import type { Node, Edge } from "reactflow"
import {
  Save,
  Zap,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/page-header"
import { ROUTES } from "@/lib/routes"

const WorkflowBuilder = dynamic(
  () => import("@/components/automations/workflow-builder").then(mod => ({ default: mod.WorkflowBuilder })),
  {
    loading: () => <div className="h-[500px] rounded-[8px] border"><Skeleton className="h-full w-full" /></div>,
    ssr: false,
  }
)
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"

export default function NewAutomationPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [workflowNodes, setWorkflowNodes] = useState<Node[]>([])
  const [workflowEdges, setWorkflowEdges] = useState<Edge[]>([])

  const handleWorkflowChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setWorkflowNodes(nodes)
    setWorkflowEdges(edges)
  }, [])

  async function handleSave() {
    // Get trigger node
    const triggerNode = workflowNodes.find(n => n.type === "trigger")
    if (!name || !triggerNode?.data.type) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o nome e configure um gatilho.",
      })
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // Extract actions from nodes
      const actionNodes = workflowNodes.filter(n => n.type === "action" || n.type === "delay")
      const actions = actionNodes.map((node, index) => ({
        id: node.id,
        type: node.data.type,
        order: index,
        config: node.data.config || {},
        delay_minutes: node.data.type === "delay" ? (node.data.config?.minutes || 0) : 0,
      }))

      // Save automation
      const { error } = await supabase.from("automations").insert({
        name,
        description: description || null,
        is_active: isActive,
        trigger: {
          type: triggerNode.data.type,
          config: triggerNode.data.config || {}
        },
        conditions: [],
        actions,
        workflow: {
          nodes: workflowNodes.map(n => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: workflowEdges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
        },
        created_by: user?.id,
      })

      if (error) throw error

      toast({
        title: "Automação criada!",
        description: "A automação foi criada com sucesso.",
      })

      router.push("/admin/automations")
    } catch (error) {
      console.error("Error creating automation:", error)
      toast({
        variant: "destructive",
        title: "Erro ao criar automação",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Nova Automação"
        description="Crie um fluxo visual de automação"
        breadcrumb={[
          { label: "Automações", href: ROUTES.ADMIN.AUTOMATIONS.LIST },
          { label: "Nova Automação" },
        ]}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{isActive ? "Ativa" : "Inativa"}</Label>
            </div>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        }
      />

      {/* Basic Info */}
      <Card className="rounded-[8px] border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Informações Básicas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome da automação *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Lembrete de pagamento em atraso"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o objetivo desta automação..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Builder */}
      <Card className="rounded-[8px] border">
        <CardHeader>
          <CardTitle className="text-base">Construtor de Fluxo</CardTitle>
          <CardDescription>
            Arraste e solte os blocos para criar seu fluxo de automação.
            Clique em um bloco para configurá-lo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowBuilder onChange={handleWorkflowChange} />
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="rounded-[8px] border bg-muted/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-warning/10">
                <Zap className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="font-medium">Gatilho</p>
                <p className="text-muted-foreground">
                  Escolha o evento que irá iniciar a automação
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-success/10">
                <svg className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Ações</p>
                <p className="text-muted-foreground">
                  Adicione ações que serão executadas em sequência
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-info/10">
                <svg className="h-4 w-4 text-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div>
                <p className="font-medium">Delays</p>
                <p className="text-muted-foreground">
                  Adicione tempos de espera entre as ações
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
