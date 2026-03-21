"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Building, Loader2, Save } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/hooks/use-toast"

interface CompanyData {
  company_name: string
  cnpj: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  logo_url: string
}

const emptyCompany: CompanyData = {
  company_name: "", cnpj: "", phone: "", email: "",
  address: "", city: "", state: "", logo_url: "",
}

export default function CompanyPage() {
  const { toast } = useToast()
  const [form, setForm] = useState<CompanyData>(emptyCompany)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from("company_settings").select("*").limit(1).single()
        if (data) setForm(data as unknown as CompanyData)
      } catch {
        // No data yet, use empty form
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("company_settings").upsert(form, { onConflict: "id" })
      if (error) throw error
      toast({ title: "Salvo!", description: "Informações da empresa atualizadas." })
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao salvar dados da empresa." })
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof CompanyData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon icon={Loader2} customSize={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><Icon icon={ArrowLeft} size={20} /></Link>
        </Button>
        <p className="text-muted-foreground">Configure as informações da sua empresa</p>
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon={Building} size={20} />
            Dados da Empresa
          </CardTitle>
          <CardDescription>Informações que aparecem em relatórios e documentos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Nome da Empresa</Label>
              <Input id="company_name" value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} placeholder="Convertfy Ltda" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={(e) => updateField("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" value={form.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Rua Example, 123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder="São Paulo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Input id="state" value={form.state} onChange={(e) => updateField("state", e.target.value)} placeholder="SP" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="logo_url">URL do Logo</Label>
              <Input id="logo_url" value={form.logo_url} onChange={(e) => updateField("logo_url", e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Icon icon={Loader2} size={16} className="mr-2 animate-spin" /> : <Icon icon={Save} size={16} className="mr-2" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
