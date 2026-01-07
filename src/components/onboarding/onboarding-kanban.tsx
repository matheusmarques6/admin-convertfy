"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd"
import {
  Plus,
  MoreHorizontal,
  User,
  ExternalLink,
  FileText,
  CheckCircle2,
  Clock,
  Building2,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/hooks/use-toast"
import { getInitials } from "@/lib/utils"
import type { OnboardingClient } from "@/app/api/onboarding/route"

type OnboardingStage = 'entrada' | 'design_producao' | 'implementando' | 'estrutura_pronta' | 'concluido'

interface StageConfig {
  id: OnboardingStage
  name: string
  color: string
  icon: React.ReactNode
}

const STAGES: StageConfig[] = [
  { id: 'entrada', name: 'Entrada', color: '#94A3B8', icon: <Clock className="h-4 w-4" /> },
  { id: 'design_producao', name: 'Design em Produção', color: '#F59E0B', icon: <FileText className="h-4 w-4" /> },
  { id: 'implementando', name: 'Implementando', color: '#3B82F6', icon: <Building2 className="h-4 w-4" /> },
  { id: 'estrutura_pronta', name: 'Estrutura Implementada', color: '#8B5CF6', icon: <CheckCircle2 className="h-4 w-4" /> },
  { id: 'concluido', name: 'Cliente ✅', color: '#22C55E', icon: <CheckCircle2 className="h-4 w-4" /> },
]

interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export function OnboardingKanban() {
  const [clients, setClients] = useState<OnboardingClient[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [selectedClient, setSelectedClient] = useState<OnboardingClient | null>(null)
  const [showClientDetails, setShowClientDetails] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)

  // New client form state
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    company: '',
    store_url: '',
    platform: 'shopify',
    contact_phone: '',
  })

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding?include_completed=true')
      const data = await res.json()
      if (data.success) {
        setClients(data.clients)
      }
    } catch (error) {
      console.error('Error fetching onboarding clients:', error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar clientes",
        description: "Tente novamente.",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }, [])

  useEffect(() => {
    fetchClients()
    fetchUsers()
  }, [fetchClients, fetchUsers])

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return

    const { draggableId, destination } = result
    const newStage = destination.droppableId as OnboardingStage

    // Optimistic update
    setClients((prev) =>
      prev.map((client) =>
        client.id === draggableId ? { ...client, onboarding_stage: newStage } : client
      )
    )

    // Update in database
    try {
      const res = await fetch(`/api/onboarding/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_stage: newStage }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const stageName = STAGES.find(s => s.id === newStage)?.name || newStage

      toast({
        title: "Cliente movido",
        description: newStage === 'concluido'
          ? "Onboarding concluído! Feedback agendado para 30 dias."
          : `Cliente movido para ${stageName}.`,
      })
    } catch (error) {
      // Revert on error
      fetchClients()
      toast({
        variant: "destructive",
        title: "Erro ao mover cliente",
        description: "Tente novamente.",
      })
    }
  }

  async function handleAssignUser(clientId: string, userId: string | null) {
    try {
      const res = await fetch(`/api/onboarding/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_assigned_to: userId }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      setClients((prev) =>
        prev.map((client) =>
          client.id === clientId
            ? {
                ...client,
                onboarding_assigned_to: userId,
                onboarding_assigned_to_name: users.find(u => u.id === userId)?.name || null
              }
            : client
        )
      )

      toast({
        title: "Responsável atribuído",
        description: userId ? "Responsável atualizado com sucesso." : "Responsável removido.",
      })

      setShowAssignDialog(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao atribuir responsável",
        description: "Tente novamente.",
      })
    }
  }

  async function handleCreateClient() {
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClientForm),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      toast({
        title: "Cliente criado",
        description: "Novo cliente adicionado ao onboarding.",
      })

      setShowNewClient(false)
      setNewClientForm({
        name: '',
        email: '',
        company: '',
        store_url: '',
        platform: 'shopify',
        contact_phone: '',
      })
      fetchClients()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao criar cliente",
        description: "Tente novamente.",
      })
    }
  }

  function getClientsForStage(stageId: OnboardingStage) {
    return clients.filter((client) => {
      if (stageId === 'entrada') {
        return client.onboarding_stage === 'entrada' || client.onboarding_stage === null
      }
      return client.onboarding_stage === stageId
    })
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Onboarding de Clientes</h2>
          <p className="text-muted-foreground">
            {clients.filter(c => c.onboarding_stage !== 'concluido').length} clientes em onboarding
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchClients}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={() => setShowNewClient(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-220px)]">
          {STAGES.map((stage) => {
            const stageClients = getClientsForStage(stage.id)

            return (
              <div
                key={stage.id}
                className="flex flex-col w-[320px] flex-shrink-0 bg-zinc-900/50 rounded-lg border border-zinc-800"
              >
                {/* Stage Header */}
                <div
                  className="p-4 border-b border-zinc-800 rounded-t-lg"
                  style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ color: stage.color }}>{stage.icon}</span>
                      <h3 className="font-semibold">{stage.name}</h3>
                      <Badge variant="secondary" className="rounded-full">
                        {stageClients.length}
                      </Badge>
                    </div>
                    {stage.id === 'entrada' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowNewClient(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Clients */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <ScrollArea className="flex-1">
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-2 min-h-[200px] transition-colors ${
                          snapshot.isDraggingOver ? "bg-zinc-800/50" : ""
                        }`}
                      >
                        {stageClients.map((client, index) => (
                          <Draggable
                            key={client.id}
                            draggableId={client.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`mb-2 cursor-grab active:cursor-grabbing transition-shadow bg-zinc-900 border-zinc-800 hover:border-zinc-700 ${
                                  snapshot.isDragging ? "shadow-lg shadow-black/50" : ""
                                }`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">
                                        {client.name}
                                      </p>
                                      {client.company && client.company !== client.name && (
                                        <p className="text-sm text-muted-foreground truncate">
                                          {client.company}
                                        </p>
                                      )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 flex-shrink-0"
                                        >
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedClient(client)
                                            setShowClientDetails(true)
                                          }}
                                        >
                                          <FileText className="mr-2 h-4 w-4" />
                                          Ver Detalhes
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedClient(client)
                                            setShowAssignDialog(true)
                                          }}
                                        >
                                          <User className="mr-2 h-4 w-4" />
                                          Atribuir Responsável
                                        </DropdownMenuItem>
                                        {client.store_url && (
                                          <DropdownMenuItem asChild>
                                            <a href={client.store_url} target="_blank" rel="noopener noreferrer">
                                              <ExternalLink className="mr-2 h-4 w-4" />
                                              Abrir Loja
                                            </a>
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild>
                                          <a href={`/clients/${client.id}`}>
                                            Ver Painel do Cliente
                                          </a>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Client Info */}
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {client.platform && (
                                      <Badge variant="outline" className="text-xs">
                                        {client.platform}
                                      </Badge>
                                    )}
                                    {client.has_briefing && (
                                      <Badge variant="secondary" className="text-xs">
                                        Briefing ✓
                                      </Badge>
                                    )}
                                    {client.has_integrations && (
                                      <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                        Integrado
                                      </Badge>
                                    )}
                                    {client.stores_count > 0 && (
                                      <Badge variant="outline" className="text-xs">
                                        {client.stores_count} loja{client.stores_count > 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Footer */}
                                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800">
                                    {client.onboarding_assigned_to_name ? (
                                      <div className="flex items-center gap-1.5">
                                        <Avatar className="h-5 w-5">
                                          <AvatarFallback className="text-[10px]">
                                            {getInitials(client.onboarding_assigned_to_name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                          {client.onboarding_assigned_to_name}
                                        </span>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-muted-foreground"
                                        onClick={() => {
                                          setSelectedClient(client)
                                          setShowAssignDialog(true)
                                        }}
                                      >
                                        <User className="h-3 w-3 mr-1" />
                                        Atribuir
                                      </Button>
                                    )}
                                    {client.onboarding_started_at && (
                                      <span className="text-xs text-muted-foreground">
                                        {formatDate(client.onboarding_started_at)}
                                      </span>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* New Client Dialog */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Adicione um novo cliente ao processo de onboarding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome / Empresa *</Label>
              <Input
                value={newClientForm.name}
                onChange={(e) => setNewClientForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome da loja ou empresa"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newClientForm.email}
                onChange={(e) => setNewClientForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label>URL da Loja</Label>
              <Input
                value={newClientForm.store_url}
                onChange={(e) => setNewClientForm(prev => ({ ...prev, store_url: e.target.value }))}
                placeholder="https://minhaloja.com.br"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select
                  value={newClientForm.platform}
                  onValueChange={(v) => setNewClientForm(prev => ({ ...prev, platform: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopify">Shopify</SelectItem>
                    <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                    <SelectItem value="woocommerce">WooCommerce</SelectItem>
                    <SelectItem value="other">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={newClientForm.contact_phone}
                  onChange={(e) => setNewClientForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClient(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateClient} disabled={!newClientForm.name}>
              Criar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atribuir Responsável</DialogTitle>
            <DialogDescription>
              Selecione quem será responsável pelo onboarding de {selectedClient?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select
              value={selectedClient?.onboarding_assigned_to || 'none'}
              onValueChange={(v) => handleAssignUser(selectedClient?.id || '', v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Details Dialog */}
      <Dialog open={showClientDetails} onOpenChange={setShowClientDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedClient?.name}</DialogTitle>
            <DialogDescription>
              Detalhes do cliente e progresso do onboarding.
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p>{selectedClient.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Empresa</Label>
                  <p>{selectedClient.company || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Plataforma</Label>
                  <p>{selectedClient.platform || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">URL da Loja</Label>
                  {selectedClient.store_url ? (
                    <a
                      href={selectedClient.store_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedClient.store_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p>-</p>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Stage Atual</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      style={{
                        backgroundColor: STAGES.find(s => s.id === selectedClient.onboarding_stage)?.color + '20',
                        color: STAGES.find(s => s.id === selectedClient.onboarding_stage)?.color,
                        borderColor: STAGES.find(s => s.id === selectedClient.onboarding_stage)?.color + '50',
                      }}
                    >
                      {STAGES.find(s => s.id === selectedClient.onboarding_stage)?.name || 'Entrada'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Responsável</Label>
                  <p>{selectedClient.onboarding_assigned_to_name || 'Não atribuído'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Início do Onboarding</Label>
                  <p>
                    {selectedClient.onboarding_started_at
                      ? new Date(selectedClient.onboarding_started_at).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Conclusão</Label>
                  <p>
                    {selectedClient.onboarding_completed_at
                      ? new Date(selectedClient.onboarding_completed_at).toLocaleDateString('pt-BR')
                      : 'Em andamento'}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href={`/clients/${selectedClient.id}`}>
                    Ver Painel Completo
                  </a>
                </Button>
                {selectedClient.store_url && (
                  <Button variant="outline" asChild>
                    <a href={selectedClient.store_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir Loja
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
