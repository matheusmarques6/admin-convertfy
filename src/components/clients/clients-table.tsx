"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Mail,
  ExternalLink,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatCurrency, getInitials, getHealthScoreColor } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { Client, Contract, User } from "@/types"

interface ClientWithRelations extends Client {
  contracts?: Contract[]
  owner?: User
}

interface ClientsTableProps {
  clients: ClientWithRelations[]
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  active: { label: "Ativo", variant: "success" },
  inactive: { label: "Inativo", variant: "secondary" },
  churned: { label: "Churned", variant: "destructive" },
  prospect: { label: "Prospect", variant: "default" },
  onboarding: { label: "Onboarding", variant: "warning" },
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const router = useRouter()
  const [deleteClient, setDeleteClient] = useState<ClientWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteClient) return

    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", deleteClient.id)

      if (error) throw error

      toast({
        title: "Cliente excluído",
        description: "O cliente foi excluído com sucesso.",
      })

      router.refresh()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: "Não foi possível excluir o cliente.",
      })
    } finally {
      setIsDeleting(false)
      setDeleteClient(null)
    }
  }

  const getActiveContract = (contracts?: Contract[]) => {
    return contracts?.find((c) => c.status === "active")
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Mail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Nenhum cliente encontrado</h3>
        <p className="text-muted-foreground mt-1">
          Comece adicionando seu primeiro cliente
        </p>
        <Button asChild className="mt-4">
          <Link href="/clients/new">Adicionar Cliente</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor Mensal</TableHead>
              <TableHead>Saúde</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const activeContract = getActiveContract(client.contracts)
              const statusInfo = statusLabels[client.status] || statusLabels.prospect
              const healthColor = getHealthScoreColor(client.health_score)

              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-medium hover:underline"
                        >
                          {client.name}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {client.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {client.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {activeContract?.plan_name || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {activeContract ? (
                      formatCurrency(activeContract.monthly_value)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          healthColor === "green"
                            ? "bg-emerald-500"
                            : healthColor === "yellow"
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span className="text-sm">{client.health_score}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {client.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={client.owner.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {getInitials(client.owner.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{client.owner.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${client.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${client.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </Link>
                        </DropdownMenuItem>
                        {client.website && (
                          <DropdownMenuItem asChild>
                            <a
                              href={client.website}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Visitar site
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteClient(client)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteClient} onOpenChange={() => setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente &quot;{deleteClient?.name}&quot;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
