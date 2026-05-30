"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Trash2,
  Edit2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FormField } from "@/components/ui/form-field"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomField {
  id: string
  name: string
  field_type: string
  entity_type: string
  options: string[] | null
  required: boolean
  created_at: string
}

interface TagItem {
  id: string
  name: string
  color: string
  category: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  category: string
  created_at: string
}

const fieldTypeLabels: Record<string, string> = {
  text: "Texto", number: "Número", date: "Data", select: "Seleção", boolean: "Sim/Não",
}

const entityTypeLabels: Record<string, string> = {
  client: "Cliente", deal: "Deal", store: "Loja",
}

const categoryLabels: Record<string, string> = {
  welcome: "Boas-vindas", invoice: "Fatura", reminder: "Lembrete", notification: "Notificação",
}

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
]

// ── CustomFieldsTab ─────────────────────────────────────────────────────────

function CustomFieldsTab() {
  const { toast } = useToast()
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [fieldType, setFieldType] = useState("text")
  const [entityType, setEntityType] = useState("client")
  const [options, setOptions] = useState("")
  const [required, setRequired] = useState(false)

  useEffect(() => { loadFields() }, [])

  async function loadFields() {
    try {
      const supabase = createClient()
      const { data } = await supabase.from("custom_fields").select("*").order("created_at", { ascending: false })
      setFields((data as CustomField[]) || [])
    } catch { /* table may not exist */ } finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!name.trim()) return
    try {
      const supabase = createClient()
      const payload: Record<string, unknown> = { name: name.trim(), field_type: fieldType, entity_type: entityType, required }
      if (fieldType === "select" && options.trim()) {
        payload.options = options.split(",").map((o) => o.trim()).filter(Boolean)
      }
      const { error } = await supabase.from("custom_fields").insert(payload)
      if (error) throw error
      toast({ title: "Campo criado!" })
      setName("")
      setOptions("")
      setRequired(false)
      loadFields()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar campo." })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este campo?")) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from("custom_fields").delete().eq("id", id)
      if (error) throw error
      setFields((prev) => prev.filter((f) => f.id !== id))
      toast({ title: "Campo excluído!" })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir campo." })
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-[8px] mt-6" />

  return (
    <div className="mt-6 space-y-6">
      {/* Create new field */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Novo Campo</CardTitle>
          <CardDescription>Adicione campos customizados às suas entidades</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Data de nascimento" />
            </FormField>
            <FormField label="Tipo">
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(fieldTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Entidade">
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(entityTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          {fieldType === "select" && (
            <FormField label="Opções (separadas por vírgula)">
              <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" />
            </FormField>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={required} onCheckedChange={setRequired} />
            <Label>Campo obrigatório</Label>
          </div>
          <Button onClick={handleCreate} disabled={!name.trim()} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Criar Campo
          </Button>
        </CardContent>
      </Card>

      {/* Existing fields */}
      <div>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mb-3">
          {fields.length} campo{fields.length !== 1 ? "s" : ""} customizado{fields.length !== 1 ? "s" : ""}
        </p>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-8">
            Nenhum campo personalizado cadastrado.
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.id} className={cn(
                "flex items-center justify-between p-3",
                "rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
              )}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">{field.name}</span>
                  <Badge variant="neutral" showDot={false}>{fieldTypeLabels[field.field_type] || field.field_type}</Badge>
                  <Badge variant="neutral">{entityTypeLabels[field.entity_type] || field.entity_type}</Badge>
                  {field.required && <Badge variant="negative" showDot={false}>Obrigatório</Badge>}
                  {field.options && <span className="text-xs text-gray-400 dark:text-[#5C6378]">({field.options.join(", ")})</span>}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(field.id)}>
                  <Trash2 className="h-4 w-4 text-[#991B1B] dark:text-[#FCA5A5]" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TagsTab ─────────────────────────────────────────────────────────────────

function TagsTab() {
  const { toast } = useToast()
  const [tags, setTags] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState(COLORS[0])
  const [newCategory, setNewCategory] = useState("general")

  useEffect(() => { loadTags() }, [])

  async function loadTags() {
    try {
      const supabase = createClient()
      const { data } = await supabase.from("tags").select("*").order("name")
      setTags((data as TagItem[]) || [])
    } catch { /* table may not exist */ } finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from("tags").insert({ name: newName.trim(), color: newColor, category: newCategory })
      if (error) throw error
      toast({ title: "Tag criada!" })
      setNewName("")
      loadTags()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar tag." })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta tag?")) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from("tags").delete().eq("id", id)
      if (error) throw error
      setTags((prev) => prev.filter((t) => t.id !== id))
      toast({ title: "Tag excluída!" })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir tag." })
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-[8px] mt-6" />

  return (
    <div className="mt-6 space-y-6">
      {/* Create new tag */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Nova Tag</CardTitle>
          <CardDescription>Crie tags para organizar clientes e deals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <FormField label="Nome">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da tag" />
              </FormField>
            </div>
            <FormField label="Categoria">
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Geral</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="deal">Deal</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-[#8B92A5] mb-1.5 block">Cor</Label>
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
                      newColor === c ? "border-foreground scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!newName.trim()} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags as chips grid */}
      <div>
        <p className="text-sm text-gray-500 dark:text-[#8B92A5] mb-3">{tags.length} tags</p>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] border",
                "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                "bg-white dark:bg-[#1A1D27]",
                "group hover:border-[rgba(0,0,0,0.15)]",
                "transition-colors duration-150",
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="text-sm text-gray-700 dark:text-[#EAEDF3]">{tag.name}</span>
              <Badge variant="neutral" showDot={false} className="text-[10px]">{tag.category}</Badge>
              <button
                onClick={() => handleDelete(tag.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
              >
                <X size={12} strokeWidth={2} className="text-gray-400 hover:text-[#991B1B]" />
              </button>
            </div>
          ))}
          {tags.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-[#5C6378] py-8 w-full text-center">
              Nenhuma tag criada.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EmailTemplatesTab ───────────────────────────────────────────────────────

function EmailTemplatesTab() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({ name: "", subject: "", body: "", category: "notification" })

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    try {
      const supabase = createClient()
      const { data } = await supabase.from("email_templates").select("*").order("created_at", { ascending: false })
      setTemplates((data as EmailTemplate[]) || [])
    } catch { /* table may not exist */ } finally { setLoading(false) }
  }

  function startNew() {
    setEditing(null)
    setIsNew(true)
    setForm({ name: "", subject: "", body: "", category: "notification" })
  }

  function startEdit(tmpl: EmailTemplate) {
    setEditing(tmpl)
    setIsNew(false)
    setForm({ name: tmpl.name, subject: tmpl.subject, body: tmpl.body, category: tmpl.category })
  }

  function cancelEdit() { setEditing(null); setIsNew(false) }

  async function handleSave() {
    if (!form.name.trim() || !form.subject.trim()) return
    try {
      const supabase = createClient()
      if (isNew) {
        const { error } = await supabase.from("email_templates").insert(form)
        if (error) throw error
        toast({ title: "Template criado!" })
      } else if (editing) {
        const { error } = await supabase.from("email_templates").update(form).eq("id", editing.id)
        if (error) throw error
        toast({ title: "Template atualizado!" })
      }
      cancelEdit()
      loadTemplates()
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao salvar template." })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este template?")) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from("email_templates").delete().eq("id", id)
      if (error) throw error
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (editing?.id === id) cancelEdit()
      toast({ title: "Template excluído!" })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir template." })
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-[8px] mt-6" />

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-[#8B92A5]">{templates.length} templates</p>
        <Button size="sm" onClick={startNew}>
          <Plus className="h-4 w-4 mr-2" /> Novo template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Template list */}
        <div className="lg:col-span-1 space-y-2">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-8">
              Nenhum template cadastrado.
            </p>
          ) : (
            templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className={cn(
                  "p-3 rounded-[8px] border cursor-pointer transition-colors",
                  "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                  "hover:bg-gray-50 dark:hover:bg-[#242836]",
                  editing?.id === tmpl.id && "bg-gray-50 dark:bg-[#242836] border-[#4E62D8] dark:border-[#7B8CEA]",
                )}
                onClick={() => startEdit(tmpl)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">{tmpl.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(tmpl) }}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id) }}>
                      <Trash2 className="h-3 w-3 text-[#991B1B] dark:text-[#FCA5A5]" />
                    </Button>
                  </div>
                </div>
                <Badge variant="neutral" showDot={false} className="mt-1 text-xs">
                  {categoryLabels[tmpl.category] || tmpl.category}
                </Badge>
              </div>
            ))
          )}
        </div>

        {/* Editor */}
        <Card className="lg:col-span-2">
          <CardHeader className="relative">
            <CardTitle className="text-sm font-semibold">
              {isNew ? "Novo Template" : editing ? `Editando: ${editing.name}` : "Editor"}
            </CardTitle>
            {(isNew || editing) && (
              <Button variant="ghost" size="icon-sm" className="absolute right-4 top-4" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!isNew && !editing ? (
              <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
                Selecione um template para editar ou crie um novo.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Nome">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do template" />
                  </FormField>
                  <FormField label="Categoria">
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                <FormField label="Assunto">
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Assunto do email" />
                </FormField>
                <FormField label="Corpo">
                  <Textarea
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Conteúdo do email..."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </FormField>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={cancelEdit}>Cancelar</Button>
                  <Button size="sm" onClick={handleSave} disabled={!form.name.trim() || !form.subject.trim()}>
                    {isNew ? "Criar" : "Salvar"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── CustomizePage ───────────────────────────────────────────────────────────

type CustomizeTab = "fields" | "tags" | "templates"

export default function CustomizePage() {
  const [tab, setTab] = useState<CustomizeTab>("fields")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personalização"
        description="Campos customizados, tags e templates de email."
      >
        <SegmentedTabs value={tab} onValueChange={(v) => setTab(v as CustomizeTab)}>
          <SegmentedTabItem value="fields">Campos Custom</SegmentedTabItem>
          <SegmentedTabItem value="tags">Tags</SegmentedTabItem>
          <SegmentedTabItem value="templates">Templates Email</SegmentedTabItem>
        </SegmentedTabs>
      </PageHeader>

      {tab === "fields" && <CustomFieldsTab />}
      {tab === "tags" && <TagsTab />}
      {tab === "templates" && <EmailTemplatesTab />}
    </div>
  )
}
