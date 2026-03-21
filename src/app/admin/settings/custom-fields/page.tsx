"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Layers, Plus, Trash2, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/hooks/use-toast"

interface CustomField {
  id: string
  name: string
  field_type: string
  entity_type: string
  options: string[] | null
  required: boolean
  created_at: string
}

const fieldTypeLabels: Record<string, string> = {
  text: "Texto", number: "Número", date: "Data", select: "Seleção", boolean: "Sim/Não",
}

const entityTypeLabels: Record<string, string> = {
  client: "Cliente", deal: "Deal", store: "Loja",
}

export default function CustomFieldsPage() {
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
    } catch {
      // table may not exist
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!name.trim()) return
    try {
      const supabase = createClient()
      const payload: Record<string, unknown> = {
        name: name.trim(), field_type: fieldType, entity_type: entityType, required,
      }
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Icon icon={Loader2} customSize={32} className="animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><Icon icon={ArrowLeft} size={20} /></Link>
        </Button>
        <p className="text-muted-foreground">Crie campos extras para clientes e deals</p>
      </div>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Icon icon={Layers} size={20} /> Novo Campo</CardTitle>
          <CardDescription>Adicione campos customizados às suas entidades</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Data de nascimento" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(fieldTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entidade</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(entityTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {fieldType === "select" && (
            <div className="space-y-2">
              <Label>Opções (separadas por vírgula)</Label>
              <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={required} onCheckedChange={setRequired} />
            <Label>Campo obrigatório</Label>
          </div>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            <Icon icon={Plus} size={16} className="mr-2" /> Criar Campo
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle>Campos Existentes</CardTitle>
          <CardDescription>{fields.length} campo(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum campo personalizado cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{field.name}</span>
                    <Badge variant="outline">{fieldTypeLabels[field.field_type] || field.field_type}</Badge>
                    <Badge variant="neutral">{entityTypeLabels[field.entity_type] || field.entity_type}</Badge>
                    {field.required && <Badge variant="destructive">Obrigatório</Badge>}
                    {field.options && <span className="text-xs text-muted-foreground">({field.options.join(", ")})</span>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(field.id)}>
                    <Icon icon={Trash2} size={16} className="text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
