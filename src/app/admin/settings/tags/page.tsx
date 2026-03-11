"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Tag, Plus, Trash2, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/hooks/use-toast"

interface TagItem {
  id: string
  name: string
  color: string
  category: string
}

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
]

export default function TagsPage() {
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
    } catch {
      // table may not exist
    } finally {
      setLoading(false)
    }
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <p className="text-muted-foreground">Gerencie as tags do sistema</p>
      </div>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Nova Tag
          </CardTitle>
          <CardDescription>Crie tags para organizar clientes e deals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da tag" />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Geral</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="deal">Deal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 ${newColor === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              <Plus className="mr-2 h-4 w-4" /> Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle>Tags Existentes</CardTitle>
          <CardDescription>{tags.length} tag(s) cadastrada(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma tag cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-2 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="font-medium">{tag.name}</span>
                    <Badge variant="outline">{tag.category}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(tag.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
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
