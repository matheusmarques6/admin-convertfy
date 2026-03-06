"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Value in centavos (integer). 0 = empty field with placeholder. */
  value: number
  /** Callback fired with new value in centavos. */
  onValueChange: (cents: number) => void
  /** Show formatted preview below input. Default: true */
  showPreview?: boolean
  /** Max value in centavos. Default: 9999999999 (99.999.999,99) */
  max?: number
}

const formatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCents(cents: number): string {
  if (cents === 0) return ""
  return formatter.format(cents / 100)
}

function formatCentsPreview(cents: number): string {
  return formatter.format(cents / 100)
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onValueChange,
      showPreview = true,
      max = 9999999999,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)

    // Merge forwarded ref with internal ref
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const moveCursorToEnd = React.useCallback(() => {
      const el = inputRef.current
      if (!el) return
      requestAnimationFrame(() => {
        const len = el.value.length
        el.setSelectionRange(len, len)
      })
    }, [])

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Allow: Tab, Enter, Escape
        if (["Tab", "Enter", "Escape"].includes(e.key)) return

        // Backspace: remove last digit (calculator-style)
        if (e.key === "Backspace") {
          e.preventDefault()
          onValueChange(Math.floor(value / 10))
          return
        }

        // Delete: same as backspace for simplicity
        if (e.key === "Delete") {
          e.preventDefault()
          onValueChange(Math.floor(value / 10))
          return
        }

        // Arrow keys, Home, End -- prevent positional editing
        if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
          e.preventDefault()
          return
        }

        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        if (e.ctrlKey || e.metaKey) return

        // Only accept digits
        if (/^\d$/.test(e.key)) {
          e.preventDefault()
          const newValue = value * 10 + parseInt(e.key, 10)
          if (newValue <= max) {
            onValueChange(newValue)
          }
          return
        }

        // Block everything else (including . and ,)
        e.preventDefault()
      },
      [value, onValueChange, max]
    )

    const handlePaste = React.useCallback(
      (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const text = e.clipboardData.getData("text")
        const digits = text.replace(/\D/g, "")
        if (!digits) return

        let newValue = parseInt(digits, 10)
        if (isNaN(newValue)) return
        if (newValue > max) newValue = max
        if (newValue < 0) newValue = 0
        onValueChange(newValue)
      },
      [onValueChange, max]
    )

    const handleSelect = React.useCallback(() => {
      moveCursorToEnd()
    }, [moveCursorToEnd])

    const handleFocus = React.useCallback(() => {
      moveCursorToEnd()
    }, [moveCursorToEnd])

    const displayValue = formatCents(value)

    return (
      <div>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm pointer-events-none">
            R$
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            value={displayValue}
            placeholder="0,00"
            disabled={disabled}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={handleSelect}
            onFocus={handleFocus}
            onChange={() => {
              // Controlled by keyDown/paste only -- prevent React warning
            }}
            {...props}
          />
        </div>
        {showPreview && value > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Valor: R$ {formatCentsPreview(value)}
          </p>
        )}
      </div>
    )
  }
)
CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
