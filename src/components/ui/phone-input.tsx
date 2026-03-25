"use client"

import * as React from "react"
import { AsYouType, parsePhoneNumber, type CountryCode } from "libphonenumber-js"
import { Check, ChevronsUpDown } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface Country {
  code: CountryCode
  name: string
  dialCode: string
  flag: string
}

const COUNTRIES: Country[] = [
  { code: "BR", name: "Brasil", dialCode: "+55", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "US", name: "Estados Unidos", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "PT", name: "Portugal", dialCode: "+351", flag: "\u{1F1F5}\u{1F1F9}" },
  { code: "ES", name: "Espanha", dialCode: "+34", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "\u{1F1F2}\u{1F1FD}" },
  { code: "AR", name: "Argentina", dialCode: "+54", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "CO", name: "Colombia", dialCode: "+57", flag: "\u{1F1E8}\u{1F1F4}" },
  { code: "CL", name: "Chile", dialCode: "+56", flag: "\u{1F1E8}\u{1F1F1}" },
  { code: "DE", name: "Alemanha", dialCode: "+49", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "FR", name: "Franca", dialCode: "+33", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "IT", name: "Italia", dialCode: "+39", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "GB", name: "Reino Unido", dialCode: "+44", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "\u{1F1E6}\u{1F1FA}" },
  { code: "JP", name: "Japao", dialCode: "+81", flag: "\u{1F1EF}\u{1F1F5}" },
]

/** Resolve country from E.164 using libphonenumber-js (handles +1 US/CA correctly) */
function detectCountryFromE164(e164: string): Country | undefined {
  try {
    const parsed = parsePhoneNumber(e164)
    if (parsed?.country) {
      return COUNTRIES.find((c) => c.code === parsed.country)
    }
  } catch {
    // fallback: match by longest dial code first
  }
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
  return sorted.find((c) => e164.startsWith(c.dialCode))
}

interface PhoneInputIntlProps {
  value?: string
  onChange?: (value: string | undefined) => void
  defaultCountry?: CountryCode
  id?: string
  className?: string
}

export function PhoneInputIntl({
  value,
  onChange,
  defaultCountry = "BR",
  id,
  className,
}: PhoneInputIntlProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedCountry, setSelectedCountry] = React.useState<Country>(
    () => COUNTRIES.find((c) => c.code === defaultCountry) || COUNTRIES[0]
  )
  const [nationalNumber, setNationalNumber] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync from external E.164 value when it changes and differs from internal state
  const lastEmittedRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    // Skip if this value was emitted by us
    if (value === lastEmittedRef.current) return
    // Handle reset/clear
    if (!value) {
      setNationalNumber("")
      lastEmittedRef.current = undefined
      return
    }

    const match = detectCountryFromE164(value)
    if (match) {
      setSelectedCountry(match)
      const raw = value.slice(match.dialCode.length)
      const formatter = new AsYouType(match.code)
      formatter.input(match.dialCode + raw)
      const formatted = formatter.getNumber()?.formatNational() || raw
      setNationalNumber(formatted)
    }
    lastEmittedRef.current = value
  }, [value])

  const emitChange = React.useCallback(
    (e164: string | undefined) => {
      lastEmittedRef.current = e164
      onChange?.(e164)
    },
    [onChange]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawInput = e.target.value.replace(/[^\d+]/g, "")

    // B4 fix: detect pasted E.164 or full number with dial code
    if (rawInput.startsWith("+")) {
      const match = detectCountryFromE164(rawInput)
      if (match) {
        setSelectedCountry(match)
        rawInput = rawInput.slice(match.dialCode.length)
      } else {
        rawInput = rawInput.replace(/\+/g, "")
      }
    } else if (rawInput.startsWith(selectedCountry.dialCode.slice(1))) {
      // Pasted number starting with dial code digits (e.g., "5531...")
      const dialDigits = selectedCountry.dialCode.slice(1)
      if (rawInput.length > dialDigits.length + 4) {
        rawInput = rawInput.slice(dialDigits.length)
      }
    }

    rawInput = rawInput.replace(/[^\d]/g, "")

    // Format using AsYouType
    const formatter = new AsYouType(selectedCountry.code)
    const fullInput = selectedCountry.dialCode + rawInput
    formatter.input(fullInput)

    const phoneNumber = formatter.getNumber()
    const formatted = phoneNumber?.formatNational() || rawInput

    setNationalNumber(formatted)

    // Emit E.164 value
    if (rawInput === "") {
      emitChange(undefined)
    } else if (phoneNumber) {
      emitChange(phoneNumber.format("E.164"))
    } else {
      emitChange(selectedCountry.dialCode + rawInput)
    }
  }

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country)
    setOpen(false)

    // B2 fix: clear number on country switch (different countries have different digit lengths)
    setNationalNumber("")
    emitChange(undefined)

    // Focus input after selection
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
    >
      {/* Country selector button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            aria-label="Selecionar pais"
            className="h-full shrink-0 gap-1 rounded-r-none border-r px-2 hover:bg-accent focus:outline-none focus:ring-0"
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="text-sm text-muted-foreground">{selectedCountry.dialCode}</span>
            <Icon icon={ChevronsUpDown} size={16} className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar pais..." />
            <CommandList>
              <CommandEmpty>Nenhum pais encontrado.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code} ${country.dialCode}`}
                    onSelect={() => handleCountrySelect(country)}
                    className="flex items-center gap-2"
                  >
                    <span className="text-base leading-none">{country.flag}</span>
                    <span className="flex-1">{country.name}</span>
                    <span className="text-muted-foreground text-sm">{country.dialCode}</span>
                    {selectedCountry.code === country.code && (
                      <Icon icon={Check} size={16} className="text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Phone number input */}
      <Input
        ref={inputRef}
        id={id}
        type="tel"
        aria-label="Numero de telefone"
        value={nationalNumber}
        onChange={handleInputChange}
        placeholder={selectedCountry.code === "BR" ? "(11) 99999-9999" : "Telefone"}
        className="border-0 shadow-none focus-visible:ring-0 rounded-l-none h-full"
      />
    </div>
  )
}

/** Format an E.164 phone number for display (e.g., "+55 31 99307-3879") */
export function formatPhoneDisplay(e164: string): string {
  try {
    const parsed = parsePhoneNumber(e164)
    if (parsed) return parsed.formatInternational()
  } catch {
    // fallback
  }
  return e164
}
