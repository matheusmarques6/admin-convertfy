/**
 * O telefone do formulário — uma régua só para os dois renderizadores.
 *
 * O formato de página única sempre teve seletor de DDI e máscara, e
 * manda ao CRM o canônico `+5511999999999`. O conversacional nasceu com
 * um `<input type="tel">` cru: quem responde digita "11 99999-9999" e é
 * isso que chega ao lead — **o mesmo campo, do mesmo formulário, com
 * duas formas**, dependendo do formato escolhido no editor.
 *
 * Não é detalhe de tela. O `ph` da CAPI é hasheado sobre o TEXTO, e a
 * regra da casa (a mesma do público da Meta) é telefone só com dígitos e
 * sempre com DDI: sem ele o número não casa com ninguém e a linha só
 * derruba a taxa. O WhatsApp tem a mesma exigência.
 *
 * Por isso a decisão mora aqui, pura e testada, e cada renderizador só
 * desenha. Duas cópias divergiriam na primeira mudança — e a divergência
 * apareceria meses depois como "os leads do formulário novo não casam".
 */

export interface PaisDeTelefone {
  code: string
  flag: string
  dial: string
}

/** Os países do seletor. A ordem é a da tela. */
export const PAISES_DE_TELEFONE: readonly PaisDeTelefone[] = [
  { code: "BR", flag: "🇧🇷", dial: "+55" },
  { code: "US", flag: "🇺🇸", dial: "+1" },
  { code: "PT", flag: "🇵🇹", dial: "+351" },
  { code: "ES", flag: "🇪🇸", dial: "+34" },
  { code: "MX", flag: "🇲🇽", dial: "+52" },
  { code: "AR", flag: "🇦🇷", dial: "+54" },
  { code: "CL", flag: "🇨🇱", dial: "+56" },
  { code: "CO", flag: "🇨🇴", dial: "+57" },
  { code: "GB", flag: "🇬🇧", dial: "+44" },
  { code: "DE", flag: "🇩🇪", dial: "+49" },
  { code: "FR", flag: "🇫🇷", dial: "+33" },
  { code: "IT", flag: "🇮🇹", dial: "+39" },
] as const

export const PLACEHOLDERS_DE_TELEFONE: Readonly<Record<string, string>> = {
  BR: "(11) 99999-9999",
  US: "(555) 123-4567",
  PT: "912 345 678",
  ES: "612 34 56 78",
  MX: "55 1234 5678",
  AR: "11 1234 5678",
}

export function paisDeTelefone(code: string): PaisDeTelefone {
  return PAISES_DE_TELEFONE.find((c) => c.code === code) ?? PAISES_DE_TELEFONE[0]
}

/**
 * O país sugerido, a partir do idioma do navegador.
 *
 * O padrão é BR e não "nenhum": a carteira é brasileira, e obrigar a
 * escolher o país antes de digitar acrescenta um passo a toda pessoa
 * para acertar a minoria. Idioma que não nomeia região (`pt`) também cai
 * em BR — chutar o país pelo idioma sozinho erraria mais que o padrão.
 */
export function paisSugeridoPeloNavegador(): string {
  if (typeof navigator === "undefined") return "BR"
  const lang = navigator.language || ""
  // Só a REGIÃO do idioma decide. Sem ela, o que sobra é o idioma, e
  // idioma não é país: `pt` sozinho viraria Portugal e `es` viraria
  // Espanha por coincidência dos códigos ISO — um brasileiro com o
  // navegador em "pt" receberia +351 e um mexicano em "es" receberia
  // +34, cada um com a máscara errada.
  if (!lang.includes("-")) return "BR"
  const code = lang.split("-")[1].toUpperCase()
  return PAISES_DE_TELEFONE.some((c) => c.code === code) ? code : "BR"
}

/**
 * A máscara por país. Só BR e US são formatados de verdade; o resto sai
 * agrupado de 4 em 4, que é legível sem fingir conhecer um plano de
 * numeração que não conhecemos — máscara errada atrapalha mais que
 * máscara nenhuma.
 */
export function mascaraDeTelefone(country: string, raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (country === "BR") {
    const t = d.slice(0, 11)
    if (t.length <= 2) return t.length ? `(${t}` : ""
    if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`
    if (t.length <= 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`
    return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`
  }
  if (country === "US") {
    const t = d.slice(0, 10)
    if (t.length <= 3) return t.length ? `(${t}` : ""
    if (t.length <= 6) return `(${t.slice(0, 3)}) ${t.slice(3)}`
    return `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}`
  }
  if (d.length <= 4) return d
  if (d.length <= 8) return `${d.slice(0, 4)} ${d.slice(4)}`
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)}`
}

/**
 * O que vai ao CRM: `+DDI` seguido só de dígitos.
 *
 * Campo vazio devolve string vazia, e não um `+55` solto: um DDI sem
 * número é um telefone que não existe, e ele passaria pela validação de
 * "respondeu" como se a pessoa tivesse informado algo.
 */
export function telefoneCanonico(country: string, digitado: string): string {
  const digits = digitado.replace(/\D/g, "")
  if (!digits) return ""
  return `${paisDeTelefone(country).dial}${digits}`
}

/**
 * O caminho de volta: do canônico para (país, número mascarado).
 *
 * É o que permite reabrir uma resposta — o link de retomada do
 * conversacional — sem que o campo volte com o DDI colado no número.
 * Sem ele, retomar mostraria "+5511999999999" dentro da caixa e um
 * segundo envio sairia com o DDI duplicado.
 */
export function partesDoTelefone(canonico: string): { country: string; numero: string } {
  const bruto = (canonico ?? "").trim()
  if (bruto.startsWith("+")) {
    // Do DDI mais longo para o mais curto: `+1` é prefixo de nada, mas
    // `+5` seria prefixo de `+55` e casaria antes.
    const ordenados = [...PAISES_DE_TELEFONE].sort((a, b) => b.dial.length - a.dial.length)
    for (const p of ordenados) {
      if (bruto.startsWith(p.dial)) {
        return { country: p.code, numero: mascaraDeTelefone(p.code, bruto.slice(p.dial.length)) }
      }
    }
  }
  return { country: "BR", numero: mascaraDeTelefone("BR", bruto) }
}
