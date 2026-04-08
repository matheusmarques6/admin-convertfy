"use client"

import Link from "next/link"
import {
  Store,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  User,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

interface StoreOnboardingCardProps {
  storeId: string
  storeName: string
  storeUrl?: string | null
  platform?: string | null
  clientId: string
  clientName: string
  onboardingStatus?: string
  progressPercent?: number
  formComplete?: boolean
  lastFeedbackAt?: string | null
}

export function StoreOnboardingCard({
  storeId,
  storeName,
  storeUrl,
  platform,
  clientId,
  clientName,
  onboardingStatus,
  progressPercent = 0,
  formComplete = false,
  lastFeedbackAt,
}: StoreOnboardingCardProps) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/admin/stores/${storeId}`} className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary flex-shrink-0" />
              <h3 className="font-medium truncate">{storeName}</h3>
            </div>
          </Link>
          <Link
            href={`/admin/clients/${clientId}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
          >
            <User className="h-3 w-3" />
            {clientName}
          </Link>
        </div>

        {storeUrl && (
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{storeUrl}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {platform && (
            <Badge variant="neutral" showDot={false} className="text-[10px]">{platform}</Badge>
          )}
          {formComplete ? (
            <Badge variant="positive" className="text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Formulário preenchido
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Formulário pendente
            </Badge>
          )}
        </div>

        {onboardingStatus && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}

        {lastFeedbackAt && (
          <p className="text-xs text-muted-foreground mt-2">
            Último feedback: {new Date(lastFeedbackAt).toLocaleDateString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
