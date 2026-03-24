import { cn } from "@/lib/utils"

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
  htmlFor?: string
}

export function FormField({ label, required, error, hint, children, className, htmlFor }: FormFieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-gray-700 dark:text-[#8B92A5] mb-1.5 block"
      >
        {label}
        {required && <span className="text-[#991B1B] dark:text-[#FCA5A5] ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-[#991B1B] dark:text-[#FCA5A5] mt-1">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">{hint}</p>
      )}
    </div>
  )
}
