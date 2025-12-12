import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChargesManager } from "@/components/financial/charges-manager"
import { SubscriptionsManager } from "@/components/financial/subscriptions-manager"
import { DollarSign, CreditCard, Repeat } from "lucide-react"

export const dynamic = "force-dynamic"

export default function FinancialPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">
          Gerencie cobranças, assinaturas e pagamentos
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="charges">
        <TabsList>
          <TabsTrigger value="charges" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cobranças
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <Repeat className="h-4 w-4" />
            Assinaturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charges" className="mt-6">
          <ChargesManager />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
