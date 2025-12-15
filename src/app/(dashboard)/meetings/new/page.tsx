import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calendar, Construction } from "lucide-react"
import Link from "next/link"

export default function NewMeetingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/meetings">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nova Reunião</h1>
          <p className="text-muted-foreground">Agende uma nova reunião</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agendar Reunião
          </CardTitle>
          <CardDescription>Configure os detalhes da reunião</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Construction className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Em desenvolvimento</h3>
            <p className="text-muted-foreground max-w-md mt-2">
              Esta funcionalidade está sendo desenvolvida e estará disponível em breve.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
