"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Copy, Check, Sparkles, User as UserIcon } from "lucide-react"
import type { AiChatMessage as Message } from "@/types/ai"

interface Props {
  message: Message
}

export function AiChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"

  const copy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={
        "group flex gap-2 " + (isUser ? "justify-end" : "justify-start")
      }
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}

      <div
        className={
          "max-w-[80%] rounded-[8px] px-3 py-2 text-[13px] leading-relaxed " +
          (isUser
            ? "bg-[#1F1F1F] dark:bg-white/[0.10] text-white dark:text-white"
            : "bg-slate-100 dark:bg-white/[0.04] text-slate-800 dark:text-white/85")
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_code]:text-[12px] [&_pre]:text-[12px] [&_pre]:p-2 [&_pre]:rounded-[6px] [&_pre]:bg-slate-900/90 [&_pre]:text-white [&_table]:text-[12px] [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:dark:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-100 [&_th]:dark:bg-white/5 [&_td]:border [&_td]:border-slate-200 [&_td]:dark:border-white/5 [&_td]:px-2 [&_td]:py-1 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:opacity-75">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-current opacity-50 tabular-nums">
            {new Date(message.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {!isUser && (
            <button
              type="button"
              onClick={copy}
              className="text-current opacity-60 hover:opacity-100"
              aria-label="Copiar"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-white/[0.10] text-slate-600 dark:text-white/70">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  )
}
