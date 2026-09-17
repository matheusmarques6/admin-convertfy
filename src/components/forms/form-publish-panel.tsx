"use client"

/**
 * A faixa de publicação — o que está no ar, ao lado do que você vê.
 *
 * Este painel existe por causa de um descompasso que, sem ele, não tem
 * como o operador enxergar: o editor grava em `crm_form_fields`, e o
 * formulário conversacional lê `form_versions`. Salvar no editor mostra
 * "salvo" e **não muda o que o público vê** até alguém publicar.
 *
 * Por isso a publicação é um passo explícito, com aviso quando o
 * rascunho está à frente — e não um efeito colateral do salvar: publicar
 * no meio de uma campanha muda o formulário para quem está respondendo
 * agora, e isso é decisão de quem opera, não do botão de salvar.
 *
 * Ela mora encostada no PALCO, e não numa aba de configuração, porque a
 * pergunta que ela responde é sobre o que o preview mostra: "isto que
 * estou vendo é o que o visitante recebe?". Numa aba, ela só seria lida
 * por quem já foi procurá-la.
 */

import { useCallback, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body
}

interface Estado {
  publicavel: boolean
  versao_atual: number
  proxima_versao: number
  tem_alteracoes: boolean
  perguntas: number
  regras_descartadas: Array<{ ref: string; goto: string }>
  finais_orfaos: string[]
  novos: string[]
}

export function FormPublishPanel({
  formId,
  /** Conversacional: só ali a versão publicada decide o que o público vê. */
  modo,
}: {
  formId: string
  modo: "classic" | "conversational"
}) {
  const { data, error, mutate, isLoading } = useSWR<Estado>(
    `/api/crm/forms/${formId}/publish`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const [publicando, setPublicando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  const publicar = useCallback(async () => {
    setPublicando(true)
    setFalha(null)
    setResultado(null)
    try {
      const res = await fetch(`/api/crm/forms/${formId}/publish`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const e = (body as { error?: unknown })?.error
        throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
      }
      const descartadas = (body.regras_descartadas ?? []).length
      setResultado(
        descartadas > 0
          ? `Versão ${body.versao} publicada. ${descartadas} ${descartadas === 1 ? "regra foi descartada" : "regras foram descartadas"} por apontar para pergunta ou final que não existe mais.`
          : `Versão ${body.versao} publicada.`,
      )
      await mutate()
    } catch (e) {
      setFalha((e as Error).message)
    } finally {
      setPublicando(false)
    }
  }, [formId, mutate])

  return (
    <div className="px-4 py-2">
      {isLoading ? (
          <p className="text-[11.5px] text-slate-500 dark:text-white/45">Verificando…</p>
        ) : error ? (
          <p className="text-[11.5px] text-red-600 dark:text-red-400">{(error as Error).message}</p>
        ) : data ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[11.5px] text-slate-600 dark:text-white/60">
                <span className="font-medium text-slate-900 dark:text-white/90">
                  {data.versao_atual > 0
                    ? `No ar: versão ${data.versao_atual}`
                    : "Nenhuma versão publicada"}
                </span>
                <span className="mx-1.5 text-slate-300 dark:text-white/20">·</span>
                {data.perguntas} {data.perguntas === 1 ? "pergunta" : "perguntas"} no rascunho
                {modo === "classic" && (
                  <>
                    <span className="mx-1.5 text-slate-300 dark:text-white/20">·</span>
                    página única não espera a versão
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={publicar}
                disabled={publicando || !data.publicavel}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {publicando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                Publicar versão v{data.proxima_versao}
              </button>
            </div>

            {data.tem_alteracoes && data.versao_atual > 0 && (
              <Faixa tom="alerta">
                O rascunho está à frente do que está no ar. Publique para que a mudança chegue a quem
                responde.
              </Faixa>
            )}
            {data.regras_descartadas.length > 0 && (
              <Faixa tom="alerta">
                {data.regras_descartadas.length}{" "}
                {data.regras_descartadas.length === 1 ? "regra aponta" : "regras apontam"} para
                pergunta ou final que não existe mais e{" "}
                {data.regras_descartadas.length === 1 ? "será descartada" : "serão descartadas"} ao
                publicar.
              </Faixa>
            )}
            {data.finais_orfaos.length > 0 && (
              <Faixa tom="alerta">
                {data.finais_orfaos.length === 1 ? "Há um final que nenhuma" : `Há ${data.finais_orfaos.length} finais que nenhuma`}{" "}
                regra alcança: {data.finais_orfaos.join(", ")}.
              </Faixa>
            )}
            {data.novos.length > 0 && data.versao_atual > 0 && (
              <Faixa tom="alerta">
                {data.novos.length === 1
                  ? "1 pergunta nova entra sem regra de salto"
                  : `${data.novos.length} perguntas novas entram sem regra de salto`}{" "}
                — quem chegar nela segue para a próxima na ordem.
              </Faixa>
            )}
            {!data.publicavel && (
              <Faixa tom="alerta">Adicione pelo menos uma pergunta antes de publicar.</Faixa>
            )}
            {resultado && <Faixa tom="ok">{resultado}</Faixa>}
            {falha && <Faixa tom="erro">{falha}</Faixa>}
          </>
      ) : null}
    </div>
  )
}

function Faixa({ tom, children }: { tom: "ok" | "alerta" | "erro"; children: React.ReactNode }) {
  const cls =
    tom === "ok"
      ? "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/[0.07] dark:text-emerald-200"
      : tom === "erro"
        ? "border-red-300/60 bg-red-50 text-red-900 dark:border-red-400/25 dark:bg-red-400/[0.07] dark:text-red-200"
        : "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-200"
  const Icone = tom === "ok" ? CheckCircle2 : AlertTriangle
  return (
    <div className={`mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1 ${cls}`}>
      <Icone className="h-3 w-3 mt-0.5 shrink-0" />
      <p className="text-[11px] leading-relaxed">{children}</p>
    </div>
  )
}
