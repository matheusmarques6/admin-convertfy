// TODO [TECH-DEBT INC-18]: Permissions page shows static matrix only.
// Implement actual permission management UI for org_member_features and store access.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Key, ShieldCheck, ShieldAlert, Shield, Eye } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const roles = [
  {
    name: "Admin",
    icon: ShieldAlert,
    color: "destructive" as const,
    permissions: {
      clients: "Total", pipeline: "Total", reports: "Total", settings: "Total",
      team: "Total", financial: "Total", integrations: "Total", delete: "Sim",
    },
  },
  {
    name: "Manager",
    icon: ShieldCheck,
    color: "default" as const,
    permissions: {
      clients: "Total", pipeline: "Total", reports: "Total", settings: "Leitura",
      team: "Leitura", financial: "Leitura", integrations: "Leitura", delete: "Não",
    },
  },
  {
    name: "Member",
    icon: Shield,
    color: "secondary" as const,
    permissions: {
      clients: "Próprios", pipeline: "Edição", reports: "Leitura", settings: "Não",
      team: "Não", financial: "Não", integrations: "Não", delete: "Não",
    },
  },
  {
    name: "Viewer",
    icon: Eye,
    color: "outline" as const,
    permissions: {
      clients: "Leitura", pipeline: "Leitura", reports: "Leitura", settings: "Não",
      team: "Não", financial: "Não", integrations: "Não", delete: "Não",
    },
  },
]

const permissionLabels: Record<string, string> = {
  clients: "Clientes", pipeline: "Pipeline", reports: "Relatórios", settings: "Configurações",
  team: "Equipe", financial: "Financeiro", integrations: "Integrações", delete: "Excluir dados",
}

export default function PermissionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/settings"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <p className="text-muted-foreground">Visualize as permissões por cargo</p>
      </div>

      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Matriz de Permissões
          </CardTitle>
          <CardDescription>
            As permissões são gerenciadas via RLS (Row Level Security) no banco de dados.
            Abaixo está a matriz de acesso por cargo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Recurso</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.name} className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <role.icon className="h-4 w-4" />
                      <Badge variant={role.color}>{role.name}</Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(permissionLabels).map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{permissionLabels[key]}</TableCell>
                  {roles.map((role) => {
                    const val = role.permissions[key as keyof typeof role.permissions]
                    return (
                      <TableCell key={role.name} className="text-center">
                        <span className={val === "Não" ? "text-muted-foreground" : val === "Total" || val === "Sim" ? "text-success font-medium" : ""}>
                          {val}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
