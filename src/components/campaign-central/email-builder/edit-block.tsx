"use client"

import { useEffect, useRef } from "react"

/**
 * Campo contentEditable inline do builder. Commit no blur (evita re-render
 * a cada tecla, que faria o caret pular).
 */
export function EditBlock({
  value,
  onChange,
  placeholder,
  className,
  style,
}: {
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Seta o texto só na montagem — depois disso o DOM é a fonte da verdade
  // até o blur (controlado externamente quebraria a posição do cursor).
  useEffect(() => {
    if (ref.current && ref.current.innerText !== (value ?? "")) {
      ref.current.innerText = value ?? ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ""}
      onBlur={(e) => onChange(e.currentTarget.innerText)}
      className={`cursor-text whitespace-pre-wrap rounded-[4px] px-1.5 py-0.5 outline-none transition-colors hover:bg-primary/5 focus:bg-primary/10 focus:ring-2 focus:ring-primary/30 empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
      style={style}
    />
  )
}
