"use client"

/**
 * Estados de UI consistentes para as 5 paginas de CS (e reutilizavel
 * em outras areas). Diferencia loading / erro / vazio com mensagens
 * acionaveis em vez de "Erro ao carregar" generico.
 *
 * Tambem expoe um fetcher que joga erro (com mensagem do servidor)
 * em vez de retornar { success: false } silenciosamente — assim o
 * SWR captura no `error` e a UI mostra detalhe.
 */

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  negBorder: "#FECACA",
}

/**
 * Fetcher SWR padrao. Joga erro com mensagem do servidor quando
 * resposta nao for 2xx OU body.success === false. Use em `useSWR(url, fetcherWithError)`.
 */
export async function fetcherWithError<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    throw new Error("Resposta nao e JSON valido")
  }
  if (!res.ok) {
    const msg =
      (body as { error?: { message?: string } | string })?.error &&
      typeof (body as { error: { message?: string } }).error === "object"
        ? (body as { error: { message?: string } }).error.message
        : typeof (body as { error?: string }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
    const err = new Error(msg || `HTTP ${res.status}`)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  if ((body as { success?: boolean })?.success === false) {
    const msg =
      (body as { error?: { message?: string } | string })?.error &&
      typeof (body as { error: { message?: string } }).error === "object"
        ? (body as { error: { message?: string } }).error.message
        : "Falha desconhecida"
    throw new Error(msg)
  }
  return body as T
}

interface CSLoadingProps {
  label?: string
}

export function CSLoadingState({ label = "Carregando..." }: CSLoadingProps) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Loader2
        size={24}
        style={{ color: C.brand, animation: "spin 0.8s linear infinite" }}
      />
      <div style={{ fontSize: 13, color: C.g500 }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

interface CSErrorProps {
  /** Mensagem real do erro (do servidor). */
  error?: Error | string | null
  /** Callback pra "Tentar novamente". Se omitido, botao nao aparece. */
  onRetry?: () => void
  /** Titulo curto (default: "Não foi possível carregar"). */
  title?: string
  /** Dica adicional (ex: "Verifique se o backfill rodou"). */
  hint?: string
}

export function CSErrorState({
  error,
  onRetry,
  title = "Não foi possível carregar",
  hint,
}: CSErrorProps) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Erro desconhecido"
  const status = (error as Error & { status?: number })?.status

  // Mensagens contextualizadas por status code
  const contextualHint =
    hint ??
    (status === 403
      ? "Você não tem permissão pra ver esta página. Verifique com o admin se sua conta está vinculada a uma organização ativa."
      : status === 401
        ? "Sessão expirada. Faça login novamente."
        : status === 404
          ? "Endpoint não encontrado. A página pode estar em manutenção."
          : status && status >= 500
            ? "Erro no servidor. Tente novamente em alguns segundos. Se persistir, contate suporte."
            : undefined)

  return (
    <div
      style={{
        margin: "40px auto",
        maxWidth: 520,
        padding: 28,
        background: C.negBg,
        border: `1px solid ${C.negBorder}`,
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 12px",
          borderRadius: 12,
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.neg,
        }}
      >
        <AlertTriangle size={22} />
      </div>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: C.g900,
          margin: 0,
          marginBottom: 6,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 12.5,
          color: C.g700,
          margin: 0,
          marginBottom: contextualHint ? 6 : 16,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      {contextualHint && (
        <p
          style={{
            fontSize: 11.5,
            color: C.g500,
            margin: 0,
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {contextualHint}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "#fff",
            border: `1px solid ${C.g200}`,
            borderRadius: 6,
            color: C.g900,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
          Tentar novamente
        </button>
      )}
    </div>
  )
}

interface CSEmptyProps {
  title: string
  description: string
  /** Acao opcional (ex: link pra outra pagina). */
  action?: { label: string; href: string }
}

export function CSEmptyState({ title, description, action }: CSEmptyProps) {
  return (
    <div
      style={{
        margin: "60px auto",
        maxWidth: 480,
        padding: 32,
        background: "#fff",
        border: `1px dashed ${C.g200}`,
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: C.g900,
          margin: 0,
          marginBottom: 6,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 12.5,
          color: C.g500,
          margin: 0,
          marginBottom: action ? 16 : 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {action && (
        <a
          href={action.href}
          style={{
            display: "inline-block",
            padding: "8px 16px",
            background: C.brand,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
