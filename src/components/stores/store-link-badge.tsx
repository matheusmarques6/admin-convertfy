import { Badge } from "@/components/ui/badge"

interface StoreLinkBadgeProps {
  clientId: string | null
  clientName?: string | null
}

export function StoreLinkBadge({ clientId, clientName }: StoreLinkBadgeProps) {
  if (!clientId) {
    return <Badge variant="secondary">Avulsa</Badge>
  }
  return <Badge variant="default">Vinculada: {clientName || "Cliente"}</Badge>
}
