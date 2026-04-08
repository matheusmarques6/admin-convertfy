import { Badge } from "@/components/ui/badge"

interface StoreLinkBadgeProps {
  clientId: string | null
  clientName?: string | null
}

export function StoreLinkBadge({ clientId, clientName }: StoreLinkBadgeProps) {
  if (!clientId) {
    return <Badge variant="neutral">Avulsa</Badge>
  }
  return <Badge variant="info">Vinculada: {clientName || "Cliente"}</Badge>
}
