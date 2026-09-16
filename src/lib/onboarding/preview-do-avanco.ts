/**
 * Regras puras do preview de avanco de etapa.
 *
 * O diagolo mostra a mensagem que IRIA ao cliente e so libera o envio quando
 * ela esta inteira. Decidir isso e menos obvio do que parece: parte das
 * variaveis pendentes no instante do preview e resolvida pelo PROPRIO avanco,
 * e tratar as duas como iguais bloquearia o caso mais comum.
 */

/**
 * Variaveis que o avanco CRIA ao entrar na coluna, portanto ainda vazias
 * quando o preview roda.
 *
 * Hoje ha uma: `advanceColumn` chama `generateTutorialTokenIfMissing` quando
 * `nextCol.slug === "implementacao"`, e o template dessa coluna e justamente
 * o que usa `{{tutorial_link}}`. Sem esta tabela, TODO avanco pra
 * implementacao apareceria como "falta o link do tutorial" — e o interruptor
 * ficaria travado exatamente no caso normal.
 *
 * A chave e o `slug` da coluna de DESTINO. Entrada nova aqui exige que o
 * avanco de fato produza o valor; do contrario a mensagem sai furada, que e o
 * defeito que este modulo existe pra impedir.
 */
export const VARS_CRIADAS_NO_AVANCO: Record<string, readonly string[]> = {
  implementacao: ["tutorial_link"],
}

/** Nome de gente pra cada variavel — o motivo tem de ser legivel na tela. */
const LABEL_DA_VAR: Record<string, string> = {
  client_name: "o nome do cliente",
  store_name: "o nome da loja",
  platform_name: "a plataforma da loja",
  form_url: "o link do formulario",
  tutorial_link: "o link do tutorial",
  briefing_url: "o link do briefing",
  figma_link: "o link do Figma do preview",
  figma_full_link: "o link do Figma completo",
}

export function labelDaVar(nome: string): string {
  return LABEL_DA_VAR[nome] ?? `a variavel {{${nome}}}`
}

/**
 * O que aparece no lugar da variavel que o avanco ainda vai criar.
 *
 * Sem isso o preview mostra um BURACO — a linha do link fica vazia, e quem
 * le nao distingue "vai ser preenchido" de "template quebrado". E justamente
 * a lacuna que o incidente deixou nas mensagens reais, entao parecer com ela
 * na tela de autorizacao e o pior resultado possivel. Os colchetes existem
 * pra que ninguem confunda o marcador com o texto final.
 */
export function marcadorDaVar(nome: string): string {
  return `[${labelDaVar(nome)} — gerado ao avançar]`
}

export interface Pendencias {
  /** Impedem o envio: o valor nao existe e nada no avanco vai cria-lo. */
  bloqueiam: string[]
  /** O avanco resolve — a mensagem sai inteira mesmo comecando assim. */
  resolvemNoAvanco: string[]
}

export function classificarPendencias(
  faltando: readonly string[],
  slugDestino: string | null | undefined,
): Pendencias {
  const criadas = new Set(
    slugDestino ? (VARS_CRIADAS_NO_AVANCO[slugDestino] ?? []) : [],
  )
  const bloqueiam: string[] = []
  const resolvemNoAvanco: string[] = []
  for (const v of faltando) {
    if (criadas.has(v)) resolvemNoAvanco.push(v)
    else bloqueiam.push(v)
  }
  return { bloqueiam, resolvemNoAvanco }
}

/**
 * Por que o envio esta bloqueado, em uma frase — ou `null` quando pode sair.
 *
 * A ordem das razoes e a da correcao: sem template nao ha o que mandar, sem
 * telefone nao ha pra quem, e so entao o conteudo importa.
 */
export function motivoDoBloqueio(p: {
  temTemplate: boolean
  temTelefone: boolean
  bloqueiam: readonly string[]
}): string | null {
  if (!p.temTemplate) return "Esta etapa nao tem mensagem cadastrada."
  if (!p.temTelefone)
    return "O cliente nao tem telefone valido no cadastro."
  if (p.bloqueiam.length === 0) return null
  const lista = p.bloqueiam.map(labelDaVar)
  const texto =
    lista.length === 1
      ? lista[0]
      : `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`
  return `Ainda falta ${texto}.`
}

/**
 * Telefone em forma legivel. O envio usa o numero cru (so digitos, com DDI);
 * na tela ele precisa ser CONFERIVEL — quem autoriza a mensagem tem de
 * reconhecer o numero antes de clicar.
 */
export function formatarTelefone(digitos: string | null): string | null {
  if (!digitos) return null
  const d = digitos.replace(/\D/g, "")
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const resto = d.slice(4)
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4)
    const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4)
    return `+55 (${ddd}) ${meio}-${fim}`
  }
  return `+${d}`
}
