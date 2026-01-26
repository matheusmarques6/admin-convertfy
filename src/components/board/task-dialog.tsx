"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Plus, MessageSquare, CheckSquare } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, getInitials } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { Task, TaskType, TaskPriority } from "@/types"

interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface MemberWithProfile {
  id: string
  role: string
  profile?: UserProfile
}

interface ClientInfo {
  id: string
  name: string
  company?: string
}

interface StoreWithClient {
  id: string
  store_name: string
  platform?: string
  client?: { id: string; name: string }
}

interface TaskWithRelations extends Omit<Task, "assignee" | "client" | "store" | "checklists" | "creator"> {
  assignee?: MemberWithProfile
  creator?: UserProfile
  client?: ClientInfo
  store?: StoreWithClient
  comments?: Array<{ id: string; content: string; author?: UserProfile; created_at: string }>
  checklists?: Array<{ id: string; title: string; is_completed: boolean }>
}

interface TaskDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  task?: TaskWithRelations | null
  members: MemberWithProfile[]
  clients: ClientInfo[]
  stores: StoreWithClient[]
}

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  type: z.enum(["onboarding", "campaign", "request", "general", "meeting", "deadline"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignee_id: z.string().optional(),
  client_id: z.string().optional(),
  store_id: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const typeOptions: { value: TaskType; label: string }[] = [
  { value: "general", label: "Geral" },
  { value: "onboarding", label: "Onboarding" },
  { value: "campaign", label: "Campanha" },
  { value: "request", label: "Solicitação" },
  { value: "meeting", label: "Reunião" },
  { value: "deadline", label: "Prazo/Entrega" },
]

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
]

export function TaskDialog({
  open,
  onClose,
  onSuccess,
  task,
  members,
  clients,
  stores,
}: TaskDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dueDate, setDueDate] = useState<Date | undefined>()
  const [activeTab, setActiveTab] = useState("details")
  const [newComment, setNewComment] = useState("")
  const [comments, setComments] = useState<Array<{ id: string; content: string; author?: UserProfile; created_at: string }>>([])
  const [checklists, setChecklists] = useState<Array<{ id: string; title: string; is_completed: boolean }>>([])
  const [newChecklistItem, setNewChecklistItem] = useState("")

  const isEditing = !!task

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "general",
      priority: "medium",
    },
  })

  // Reset form when dialog opens/closes or task changes
  useEffect(() => {
    if (open) {
      if (task) {
        setValue("title", task.title)
        setValue("description", task.description || "")
        setValue("type", task.type)
        setValue("priority", task.priority)
        setValue("assignee_id", task.assignee_id || "")
        setValue("client_id", task.client_id || "")
        setValue("store_id", task.store_id || "")
        setDueDate(task.due_date ? new Date(task.due_date) : undefined)
        setComments(task.comments || [])
        setChecklists(task.checklists || [])
        // Load full task details
        loadTaskDetails(task.id)
      } else {
        reset({
          title: "",
          description: "",
          type: "general",
          priority: "medium",
          assignee_id: "",
          client_id: "",
          store_id: "",
        })
        setDueDate(undefined)
        setComments([])
        setChecklists([])
      }
      setActiveTab("details")
      setNewComment("")
      setNewChecklistItem("")
    }
  }, [open, task, setValue, reset])

  async function loadTaskDetails(taskId: string) {
    try {
      const response = await fetch(`/api/tasks/${taskId}`)
      if (response.ok) {
        const data = await response.json()
        setComments(data.task.comments || [])
        setChecklists(data.task.checklists || [])
      }
    } catch {
      // Ignore
    }
  }

  async function onSubmit(data: FormData) {
    setIsSubmitting(true)

    try {
      const url = isEditing ? `/api/tasks/${task.id}` : "/api/tasks"
      const method = isEditing ? "PUT" : "POST"

      const body = {
        ...data,
        due_date: dueDate?.toISOString() || null,
        assignee_id: data.assignee_id || null,
        client_id: data.client_id || null,
        store_id: data.store_id || null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar")
      }

      toast({
        title: isEditing ? "Tarefa atualizada" : "Tarefa criada",
        description: result.message,
      })

      onSuccess()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar tarefa",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddComment() {
    if (!newComment.trim() || !task) return

    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      })

      if (response.ok) {
        const data = await response.json()
        setComments((prev) => [...prev, data.comment])
        setNewComment("")
        toast({ title: "Comentário adicionado" })
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao adicionar comentário" })
    }
  }

  async function handleAddChecklist() {
    if (!newChecklistItem.trim() || !task) return

    try {
      const response = await fetch(`/api/tasks/${task.id}/checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newChecklistItem }),
      })

      if (response.ok) {
        const data = await response.json()
        setChecklists((prev) => [...prev, data.checklist])
        setNewChecklistItem("")
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao adicionar item" })
    }
  }

  async function handleToggleChecklist(checklistId: string, isCompleted: boolean) {
    if (!task) return

    // Optimistic update
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, is_completed: !isCompleted } : c))
    )

    try {
      await fetch(`/api/tasks/${task.id}/checklists`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist_id: checklistId, is_completed: !isCompleted }),
      })
    } catch {
      // Revert
      setChecklists((prev) =>
        prev.map((c) => (c.id === checklistId ? { ...c, is_completed: isCompleted } : c))
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize os detalhes da tarefa" : "Crie uma nova tarefa"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Detalhes</TabsTrigger>
              <TabsTrigger value="comments" disabled={!isEditing}>
                <MessageSquare className="h-4 w-4 mr-1" />
                Comentários {comments.length > 0 && `(${comments.length})`}
              </TabsTrigger>
              <TabsTrigger value="checklist" disabled={!isEditing}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Checklist {checklists.length > 0 && `(${checklists.filter((c) => c.is_completed).length}/${checklists.length})`}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              <TabsContent value="details" className="mt-0 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    placeholder="Título da tarefa"
                    {...register("title")}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva a tarefa..."
                    rows={3}
                    {...register("description")}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Tipo</Label>
                    <Select
                      value={watch("type")}
                      onValueChange={(value) => setValue("type", value as TaskType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Prioridade</Label>
                    <Select
                      value={watch("priority")}
                      onValueChange={(value) => setValue("priority", value as TaskPriority)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Responsável</Label>
                  <Select
                    value={watch("assignee_id") || "_none"}
                    onValueChange={(value) => setValue("assignee_id", value === "_none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={member.profile?.avatar_url} />
                              <AvatarFallback className="text-xs">
                                {getInitials(member.profile?.name || "?")}
                              </AvatarFallback>
                            </Avatar>
                            {member.profile?.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Data de Entrega</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !dueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "PPP", { locale: ptBR }) : "Selecione uma data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Cliente</Label>
                    <Select
                      value={watch("client_id") || "_none"}
                      onValueChange={(value) => setValue("client_id", value === "_none" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Loja</Label>
                    <Select
                      value={watch("store_id") || "_none"}
                      onValueChange={(value) => setValue("store_id", value === "_none" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma</SelectItem>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="comments" className="mt-0 space-y-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum comentário ainda
                    </p>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={comment.author?.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {getInitials(comment.author?.name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {comment.author?.name || "Usuário"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar comentário..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  />
                  <Button type="button" onClick={handleAddComment}>
                    Enviar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="checklist" className="mt-0 space-y-4">
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {checklists.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum item no checklist
                    </p>
                  ) : (
                    checklists.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          onChange={() => handleToggleChecklist(item.id, item.is_completed)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className={cn(
                          "flex-1 text-sm",
                          item.is_completed && "line-through text-muted-foreground"
                        )}>
                          {item.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar item..."
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddChecklist())}
                  />
                  <Button type="button" onClick={handleAddChecklist}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : isEditing ? "Salvar" : "Criar Tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
