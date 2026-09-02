"use client"

/**
 * Markdown das respostas da ConvertIA com PREVIEW de HTML: todo bloco
 * ```html vira um cartão com abas Preview | Código — iframe sandboxed
 * (sem scripts — seguro pra HTML de email e páginas), copiar e baixar.
 * Demais blocos de código ganham botão de copiar.
 *
 * O override é no <pre> (react-markdown v9 não passa mais `inline`):
 * o filho <code> carrega language-xxx no className.
 */

import { isValidElement, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy, Download, Maximize2, Minimize2 } from "lucide-react"

const HAIR = "var(--ops-border)"

function extractCode(children: React.ReactNode): { code: string; lang: string } | null {
  const child = Array.isArray(children) ? children[0] : children
  if (!isValidElement(child)) return null
  const props = child.props as { className?: string; children?: React.ReactNode }
  const lang = /language-(\w+)/.exec(props.className ?? "")?.[1] ?? ""
  const raw = props.children
  const code = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : ""
  return { code: String(code).replace(/\n$/, ""), lang }
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      title={label ?? "Copiar"}
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      }}
      className="inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-medium"
      style={{ color: copied ? "var(--ops-pos)" : "var(--ops-mut)" }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  )
}

function HtmlPreview({ code, streaming }: { code: string; streaming: boolean }) {
  const [tab, setTab] = useState<"preview" | "code">(streaming ? "code" : "preview")
  const [tall, setTall] = useState(false)

  const download = () => {
    const blob = new Blob([code], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "convertia.html"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="my-3 overflow-hidden rounded-[10px] border" style={{ borderColor: HAIR }}>
      <div
        className="flex items-center gap-1 border-b px-2 py-1.5"
        style={{ borderColor: HAIR, background: "var(--ops-hover, rgba(0,0,0,0.02))" }}
      >
        {(["preview", "code"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="h-6 rounded-[6px] px-2.5 text-[11px] font-medium"
            style={{
              background: tab === t ? "var(--ops-card)" : "transparent",
              color: tab === t ? "var(--ops-title)" : "var(--ops-mut)",
              border: tab === t ? `1px solid ${HAIR}` : "1px solid transparent",
            }}
          >
            {t === "preview" ? "Preview" : "Código"}
          </button>
        ))}
        <span className="ml-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--ops-mut)" }}>
          html
        </span>
        <span className="flex-1" />
        <button
          title={tall ? "Reduzir" : "Expandir"}
          onClick={() => setTall(!tall)}
          className="flex h-6 w-6 items-center justify-center rounded-[6px]"
          style={{ color: "var(--ops-mut)" }}
        >
          {tall ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
        <button
          title="Baixar .html"
          onClick={download}
          className="flex h-6 w-6 items-center justify-center rounded-[6px]"
          style={{ color: "var(--ops-mut)" }}
        >
          <Download className="h-3 w-3" />
        </button>
        <CopyBtn text={code} />
      </div>
      {tab === "preview" ? (
        <iframe
          title="Preview HTML"
          // sandbox vazio: sem scripts, sem navegação — seguro pra
          // renderizar HTML gerado/anexado
          sandbox=""
          srcDoc={code}
          className="w-full border-0 bg-white"
          style={{ height: tall ? 720 : 420 }}
        />
      ) : (
        <pre
          className="m-0 max-h-[420px] overflow-auto p-3 text-[11.5px] leading-[1.55]"
          style={{ background: "rgba(17,24,39,0.03)", color: "var(--ops-title)" }}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

function PreBlock({
  children,
  streaming,
}: {
  children?: React.ReactNode
  streaming: boolean
}) {
  const extracted = extractCode(children)
  if (!extracted) return <pre>{children}</pre>
  const { code, lang } = extracted
  const looksHtml =
    lang === "html" || (!lang && /^\s*(<!doctype html|<html[\s>])/i.test(code))
  if (looksHtml) return <HtmlPreview code={code} streaming={streaming} />
  return (
    <div className="my-3 overflow-hidden rounded-[10px] border" style={{ borderColor: HAIR }}>
      <div
        className="flex items-center border-b px-2 py-1"
        style={{ borderColor: HAIR, background: "var(--ops-hover, rgba(0,0,0,0.02))" }}
      >
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ops-mut)" }}>
          {lang || "código"}
        </span>
        <span className="flex-1" />
        <CopyBtn text={code} />
      </div>
      <pre
        className="m-0 max-h-[380px] overflow-auto p-3 text-[11.5px] leading-[1.55]"
        style={{ background: "rgba(17,24,39,0.03)", color: "var(--ops-title)" }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function ConvertiaMarkdown({
  content,
  streaming,
}: {
  content: string
  streaming: boolean
}) {
  const components = useMemo(
    () => ({
      pre: (props: { children?: React.ReactNode }) => (
        <PreBlock streaming={streaming}>{props.children}</PreBlock>
      ),
    }),
    [streaming],
  )
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
