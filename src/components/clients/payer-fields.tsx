"use client"

/**
 * Quem paga: o seletor e os campos que ele governa.
 *
 * Vive num componente só porque as telas de criar e de editar cliente
 * mostram exatamente os mesmos campos — e foi tendo três portas com réguas
 * diferentes (criar, editar e o painel de configurações) que um documento
 * com 22 zeros entrou no banco.
 */

import type { FieldErrors, UseFormRegister } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TipoDePagador } from "@/lib/clients/pagador"

/** O mínimo que as duas telas têm em comum — nenhuma delas tem o mesmo form. */
export interface CamposDePagador {
  cpf_cnpj?: string
  payer_type: TipoDePagador
  payer_legal_name?: string
  payer_tax_id?: string
  payer_country?: string
  payer_address?: string
}

interface Props<T extends CamposDePagador> {
  tipo: TipoDePagador
  onChangeTipo: (t: TipoDePagador) => void
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  disabled?: boolean
  /** CPF/CNPJ já gravado: no exterior ele fica à vista, mas fora de uso. */
  documentoGuardado?: string
  hintDocumento?: string
}

/**
 * O seletor entra na grade de duas colunas, ao lado do telefone; os campos
 * que ele governa ocupam a largura inteira abaixo. Por isso são dois
 * componentes e não um fragmento: dentro do grid, o bloco do exterior
 * viraria uma célula estreita.
 */
export function PayerTypeSelect({
  tipo,
  onChangeTipo,
  disabled,
}: Pick<Props<CamposDePagador>, "tipo" | "onChangeTipo" | "disabled">) {
  return (
    <FormField label="Quem paga" required htmlFor="payer_type" hint="Define o que identifica o pagador">
      <Select value={tipo} onValueChange={(v) => onChangeTipo(v as TipoDePagador)} disabled={disabled}>
        <SelectTrigger id="payer_type" className="h-9 sm:h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="br">Pessoa ou empresa no Brasil (CPF/CNPJ)</SelectItem>
          <SelectItem value="exterior">Empresa no exterior (LLC, Ltd, Inc)</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  )
}

export function PayerFields<T extends CamposDePagador>({
  tipo,
  register,
  errors,
  disabled,
  documentoGuardado,
  hintDocumento = "Obrigatório para assinaturas via Asaas",
}: Omit<Props<T>, "onChangeTipo">) {
  const erro = (campo: keyof CamposDePagador) =>
    (errors as Record<string, { message?: string } | undefined>)[campo]?.message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o form de cada tela tem campos próprios; aqui só os do pagador importam.
  const campo = (nome: keyof CamposDePagador) => register(nome as any)

  return (
    <>
      {tipo === "exterior" ? (
        <div className="space-y-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Razão social" required error={erro("payer_legal_name")} htmlFor="payer_legal_name">
              <Input id="payer_legal_name" placeholder="JFJA DIGITAL LLC" {...campo("payer_legal_name")} disabled={disabled} />
            </FormField>
            <FormField label="Tax ID" error={erro("payer_tax_id")} htmlFor="payer_tax_id" hint="EIN, VAT, CIF — como estiver no registro">
              <Input id="payer_tax_id" placeholder="88-1234567" {...campo("payer_tax_id")} disabled={disabled} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4">
            <FormField label="País" error={erro("payer_country")} htmlFor="payer_country" hint="2 letras">
              <Input id="payer_country" placeholder="US" maxLength={2} {...campo("payer_country")} disabled={disabled} />
            </FormField>
            <FormField label="Endereço" error={erro("payer_address")} htmlFor="payer_address">
              <Input
                id="payer_address"
                placeholder="30 N Gould St Ste R, Sheridan, WY 82801"
                {...campo("payer_address")}
                disabled={disabled}
              />
            </FormField>
          </div>
          {documentoGuardado ? (
            <FormField
              label="CPF/CNPJ"
              error={erro("cpf_cnpj")}
              htmlFor="cpf_cnpj"
              hint="Guardado do cadastro anterior — não é usado com pagador do exterior"
            >
              <Input id="cpf_cnpj" {...campo("cpf_cnpj")} disabled={disabled} />
            </FormField>
          ) : null}
        </div>
      ) : (
        <FormField label="CPF/CNPJ" error={erro("cpf_cnpj")} htmlFor="cpf_cnpj" hint={hintDocumento}>
          <Input
            id="cpf_cnpj"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            {...campo("cpf_cnpj")}
            disabled={disabled}
          />
        </FormField>
      )}
    </>
  )
}
