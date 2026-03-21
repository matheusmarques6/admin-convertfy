"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Mail, Plus, Trash2, Loader2, Edit2, X } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/hooks/use-toast"

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  category: string
  created_at: string
}

const categoryLabels: Record<string, string> = {
  welcome: "Boas-vindas", invoice: "Fatura", reminder: "Lembrete", notification: "Notificação",
}

export default function EmailTemplatesPage() {
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
    } catch {
      // table may not exist
    } finally {
      setLoading(false)
    }
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

  function cancelEdit() {
    setEditing(null)
    setIsNew(false)
  }

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Icon icon={Loader2} customSize={32} className="animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><Icon icon={ArrowLeft} size={20} /></Link>
        </Button>
        <p className="text-muted-foreground">Crie e edite templates de email</p>
        <div className="ml-auto">
          <Button onClick={startNew}><Icon icon={Plus} size={16} className="mr-2" /> Novo Template</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <Card className="rounded-xl border bg-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icon icon={Mail} size={20} /> Templates</CardTitle>
            <CardDescription>{templates.length} template(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum template cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tmpl) => (
                  <div key={tmpl.id}
                    className={`p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${editing?.id === tmpl.id ? "bg-accent" : ""}`}
                    onClick={() => startEdit(tmpl)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{tmpl.name}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(tmpl) }}>
                          <Icon icon={Edit2} customSize={12} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id) }}>
                          <Icon icon={Trash2} customSize={12} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <Badge variant="neutral" showDot={false} className="mt-1 text-xs">{categoryLabels[tmpl.category] || tmpl.category}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="rounded-xl border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle>{isNew ? "Novo Template" : editing ? `Editando: ${editing.name}` : "Editor"}</CardTitle>
            {(isNew || editing) && (
              <Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={cancelEdit}>
                <Icon icon={X} size={16} />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!isNew && !editing ? (
              <p className="text-muted-foreground text-center py-12">Selecione um template para editar ou crie um novo.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do template" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assunto</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Assunto do email" />
                </div>
                <div className="space-y-2">
                  <Label>Corpo</Label>
                  <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Conteúdo do email..." rows={12} className="font-mono text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={!form.name.trim() || !form.subject.trim()}>
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
