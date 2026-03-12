"use client"

import { Input } from "@/components/ui/input"
import { forwardRef, type InputHTMLAttributes } from "react"

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14)
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

interface CpfCnpjInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string
  onChange: (value: string) => void
}

const CpfCnpjInput = forwardRef<HTMLInputElement, CpfCnpjInputProps>(
  ({ value, onChange, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        value={formatCpfCnpj(value)}
        onChange={(e) => onChange(formatCpfCnpj(e.target.value))}
        inputMode="numeric"
        maxLength={18}
        {...props}
      />
    )
  }
)
CpfCnpjInput.displayName = "CpfCnpjInput"

export { CpfCnpjInput, formatCpfCnpj }
