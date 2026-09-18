/**
 * Validação de resposta, por tipo de bloco. Pura, client-safe.
 *
 * Roda nos DOIS lados: no renderizador (para não deixar avançar com
 * resposta inválida) e no submit (porque o cliente pode ser burlado). O
 * módulo é um só de propósito — validador de tela mais frouxo que o de
 * servidor devolve "erro no envio" depois de a pessoa ter respondido
 * tudo, que é o pior momento possível para descobrir.
 *
 * A mensagem sai em texto de gente e em pt-BR, pronta para a tela.
 *
 * ## CPF e CNPJ conferem o dígito
 *
 * O formulário clássico só trocava o `type` do input para `tel` — isto é,
 * aceitava `111.111.111-11`. Documento inválido no CRM é lead que o time
 * comercial descobre no telefonema.
 */

import type { FormAnswer, FormBlock } from "@/types/forms-conversational"
import { TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"

export interface ResultadoValidacao {
  valido: boolean
  /** Mensagem pronta para a tela; `null` quando válido. */
  erro: string | null
}

const OK: ResultadoValidacao = { valido: true, erro: null }
const falha = (erro: string): ResultadoValidacao => ({ valido: false, erro })

/** Resposta vazia em qualquer forma: "", [], null, undefined. */
export function respostaVazia(v: FormAnswer | undefined): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "boolean") return v === false
  return false
}

const digitos = (s: string) => s.replace(/\D/g, "")

/** Dígito verificador de CPF. Rejeita as sequências repetidas. */
export function cpfValido(raw: string): boolean {
  const d = digitos(raw)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  const dv = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/** Dígito verificador de CNPJ. Rejeita as sequências repetidas. */
export function cnpjValido(raw: string): boolean {
  const d = digitos(raw)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false
  const dv = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/**
 * Email: régua deliberadamente PERMISSIVA.
 *
 * A forma canônica (RFC 5322) recusa endereços que existem, e recusar um
 * email válido custa o lead inteiro. Quem tem a palavra final é a
 * entrega. Aqui só barramos o que não pode ser email nenhum: sem `@`,
 * sem domínio, com espaço.
 */
export function emailValido(raw: string): boolean {
  const s = raw.trim()
  if (/\s/.test(s)) return false
  const partes = s.split("@")
  if (partes.length !== 2) return false
  const [local, dominio] = partes
  if (!local || !dominio) return false
  if (!dominio.includes(".")) return false
  if (dominio.startsWith(".") || dominio.endsWith(".") || dominio.includes("..")) return false
  return true
}

/**
 * Telefone: 8 a 15 dígitos.
 *
 * O teto é o do E.164; o piso deixa passar fixo curto de alguns países.
 * Validar formato BR aqui quebraria a loja que vende para fora — o
 * formulário publicado suporta pt-BR, en e es.
 */
export function telefoneValido(raw: string): boolean {
  const d = digitos(raw)
  return d.length >= 8 && d.length <= 15
}

export function urlValida(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  const comEsquema = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(comEsquema)
    return Boolean(u.hostname) && u.hostname.includes(".")
  } catch {
    return false
  }
}

/** Valida uma resposta contra o bloco. Bloco sem resposta sempre passa. */
export function validarResposta(block: FormBlock, valor: FormAnswer | undefined): ResultadoValidacao {
  if (TIPOS_SEM_RESPOSTA.has(block.type)) return OK

  const vazia = respostaVazia(valor)
  if (vazia) {
    if (!block.required) return OK
    return falha(
      block.type === "checkbox"
        ? "Marque para continuar."
        : TIPOS_DE_ESCOLHA_MSG.has(block.type)
          ? "Escolha uma opção para continuar."
          : "Preencha para continuar.",
    )
  }

  const v = block.validation ?? {}

  if (Array.isArray(valor)) {
    if (v.minEscolhas !== undefined && valor.length < v.minEscolhas) {
      return falha(`Escolha pelo menos ${v.minEscolhas} ${v.minEscolhas === 1 ? "opção" : "opções"}.`)
    }
    if (v.maxEscolhas !== undefined && valor.length > v.maxEscolhas) {
      return falha(`Escolha no máximo ${v.maxEscolhas} ${v.maxEscolhas === 1 ? "opção" : "opções"}.`)
    }
    return OK
  }

  if (typeof valor === "boolean") return OK

  const texto = String(valor).trim()

  switch (block.type) {
    case "email":
      if (!emailValido(texto)) return falha("Confira o email — parece faltar algo.")
      break
    case "phone":
      if (!telefoneValido(texto)) return falha("Confira o telefone — o número parece incompleto.")
      break
    case "url":
      if (!urlValida(texto)) return falha("Confira o endereço do site.")
      break
    case "cpf":
      if (!cpfValido(texto)) return falha("Esse CPF não confere.")
      break
    case "cnpj":
      if (!cnpjValido(texto)) return falha("Esse CNPJ não confere.")
      break
    case "cep":
      if (digitos(texto).length !== 8) return falha("O CEP tem 8 dígitos.")
      break
    case "number": {
      const n = Number(texto.replace(",", "."))
      if (!Number.isFinite(n)) return falha("Digite um número.")
      if (v.min !== undefined && n < v.min) return falha(`O mínimo é ${v.min}.`)
      if (v.max !== undefined && n > v.max) return falha(`O máximo é ${v.max}.`)
      break
    }
    case "yes_no":
      if (texto !== "sim" && texto !== "nao") return falha("Escolha Sim ou Não.")
      break
    case "nps": {
      const n = Number(texto)
      if (!Number.isInteger(n) || n < 0 || n > 10) return falha("Escolha uma nota de 0 a 10.")
      break
    }
    case "rating": {
      const n = Number(texto)
      if (!Number.isInteger(n) || n < 1 || n > 5) return falha("Escolha de 1 a 5 estrelas.")
      break
    }
    case "schedule":
      if (Number.isNaN(new Date(texto).getTime())) return falha("Escolha um horário.")
      break
    case "date": {
      // `new Date("2026-02-31")` não lança — vira 03/03. Por isso a
      // comparação é com a data reconstruída, não com `isNaN`.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
      if (!m) return falha("Escolha uma data.")
      const [, a, mes, dia] = m
      const d = new Date(`${a}-${mes}-${dia}T00:00:00Z`)
      if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dia) || d.getUTCMonth() + 1 !== Number(mes)) {
        return falha("Essa data não existe.")
      }
      break
    }
    default:
      break
  }

  if (v.minLength !== undefined && texto.length < v.minLength) {
    return falha(`Escreva pelo menos ${v.minLength} caracteres.`)
  }
  if (v.maxLength !== undefined && texto.length > v.maxLength) {
    return falha(`No máximo ${v.maxLength} caracteres.`)
  }
  if (v.pattern) {
    try {
      if (!new RegExp(v.pattern).test(texto)) return falha("O formato não confere.")
    } catch {
      // Padrão inválido é erro de CADASTRO, não da resposta de quem
      // preenche — barrar a pessoa por isso a deixaria sem saída.
    }
  }

  return OK
}

const TIPOS_DE_ESCOLHA_MSG: ReadonlySet<string> = new Set([
  "select",
  "radio",
  "multi_select",
  "yes_no",
  "nps",
  "rating",
  "schedule",
])
