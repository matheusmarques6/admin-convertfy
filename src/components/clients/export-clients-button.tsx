"use client"

/**
 * Botão "Exportar clientes" — gera a lista de público personalizado do
 * Meta Ads (ou a planilha completa) com a carteira inteira.
 *
 * O diálogo explica o que cada formato é e, depois do download, mostra
 * quantos clientes entraram e quantos ficaram de fora por não terem
 * e-mail nem telefone: sem um dos dois a Meta não consegue encontrar a
 * pessoa, e a linha só derrubaria a taxa de correspondência. Esse
 * número precisa aparecer — é a diferença entre "exportei 800" e
 * "exportei 800 dos 950 cadastrados".
 */

import { useState } from "react"
import { Download, FileSpreadsheet, Loader2, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"

type Format = "meta" | "full"

interface ExportResult {
  total: number
  rows: number
  skipped: number
  withEmail: number
  withPhone: number
}

export function ExportClientsButton() {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>("meta")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/clients/export?format=${format}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const e = (body as { error?: unknown })?.error
        throw new Error(typeof e === "string" && e ? e : "Não foi possível exportar")
      }

      const total = Number(res.headers.get("X-Total-Clients") ?? 0)
      const rows = Number(res.headers.get("X-Exported-Rows") ?? total)
      const skipped = Number(res.headers.get("X-Skipped-Rows") ?? 0)
      const withEmail = Number(res.headers.get("X-With-Email") ?? 0)
      const withPhone = Number(res.headers.get("X-With-Phone") ?? 0)

      const blob = await res.blob()
      const name =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        (format === "meta" ? "clientes-meta-ads.csv" : "clientes.csv")

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setResult({ total, rows, skipped, withEmail, withPhone })
      toast({
        title: "Arquivo baixado",
        description:
          format === "meta"
            ? `${rows} de ${total} clientes na lista.`
            : `${total} clientes exportados.`,
      })
    } catch (err) {
      toast({
        title: "Falha ao exportar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const Option = ({
    value,
    icon,
    title,
    description,
  }: {
    value: Format
    icon: React.ReactNode
    title: string
    description: string
  }) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
        format === value
          ? "border-slate-900 bg-slate-50 dark:border-white/40 dark:bg-white/5"
          : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      <input
        type="radio"
        name="export-format"
        className="mt-1 accent-black"
        checked={format === value}
        onChange={() => {
          setFormat(value)
          setResult(null)
        }}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="text-xs text-slate-500 dark:text-white/50">{description}</span>
      </span>
    </label>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setResult(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Download className="mr-2 h-4 w-4" />
          Exportar clientes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Exportar clientes</DialogTitle>
          <DialogDescription>
            Baixa a base inteira de clientes cadastrados — não apenas a página que está na tela.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Option
            value="meta"
            icon={<Target className="h-3.5 w-3.5" />}
            title="Lista para o Meta Ads"
            description="Formato de público personalizado: e-mail, telefone com DDI, nome, cidade, estado e CEP já normalizados como a Meta exige. É só subir em Públicos → Criar público personalizado → Lista de clientes."
          />
          <Option
            value="full"
            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
            title="Planilha completa"
            description="Todos os campos em português (CPF/CNPJ, endereço, status), para abrir no Excel ou no Google Sheets."
          />
        </div>

        {format === "meta" && (
          <p className="text-xs text-slate-500 dark:text-white/50">
            Clientes sem e-mail e sem telefone ficam de fora: a Meta não consegue encontrar a pessoa
            sem um dos dois, e a linha vazia só reduziria a taxa de correspondência do público.
          </p>
        )}

        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            {format === "meta" ? (
              <>
                <strong>
                  {result.rows} de {result.total} clientes
                </strong>{" "}
                entraram na lista ({result.withEmail} com e-mail, {result.withPhone} com telefone).
                {result.skipped > 0 && (
                  <>
                    {" "}
                    {result.skipped} ficaram de fora por não terem e-mail nem telefone cadastrado.
                  </>
                )}
              </>
            ) : (
              <>
                <strong>{result.total} clientes</strong> exportados.
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Baixar CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
