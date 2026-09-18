"use client"

/**
 * O ícone de um tipo de pergunta: quadrado com a cor do GRUPO (fundo a
 * 12%, raio 27% do lado), como no handoff. É o mesmo desenho na espinha,
 * no seletor e no cabeçalho do inspetor — três lugares com o mesmo
 * glifo é o que faz a pessoa reconhecer o tipo sem ler o nome.
 */

import {
  AlignLeft,
  Building2,
  Calendar,
  CheckSquare,
  ChevronsUpDown,
  CircleDot,
  Clock,
  Globe,
  Hash,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Quote,
  SlidersHorizontal,
  Square,
  Star,
  ToggleRight,
  User,
  type LucideIcon,
} from "lucide-react"
import { grupoDoTipo } from "@/lib/forms/tipos-de-pergunta"

const GLIFO: Record<string, LucideIcon> = {
  text: User,
  email: Mail,
  phone: Phone,
  url: Globe,
  radio: CircleDot,
  multi_select: CheckSquare,
  yes_no: ToggleRight,
  select: ChevronsUpDown,
  textarea: AlignLeft,
  number: Hash,
  cpf: IdCard,
  cnpj: Building2,
  cep: MapPin,
  nps: SlidersHorizontal,
  rating: Star,
  date: Calendar,
  schedule: Clock,
  statement: Quote,
  checkbox: Square,
}

export function TipoIcone({
  tipo,
  tamanho = 24,
  className,
}: {
  tipo: string
  tamanho?: number
  className?: string
}) {
  const Glifo = GLIFO[tipo] ?? AlignLeft
  const { cor } = grupoDoTipo(tipo)
  return (
    <span
      aria-hidden
      className={"inline-flex shrink-0 items-center justify-center " + (className ?? "")}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: Math.round(tamanho * 0.27),
        background: `color-mix(in srgb, ${cor} 12%, transparent)`,
        color: cor,
      }}
    >
      <Glifo style={{ width: Math.round(tamanho * 0.55), height: Math.round(tamanho * 0.55) }} strokeWidth={2} />
    </span>
  )
}
