/**
 * A inicial do avatar é DERIVADA do nome, não digitada.
 *
 * Na `review 8` o avatar é um círculo com a letra inicial de quem escreveu
 * o review. Até 10/09 essa letra era um `<img>` base64 — a MESMA imagem nos
 * três cartões, com um "G" desenhado —, e o cadastro tinha três campos
 * (`review_1_initial` = "G", `_2` = "K", `_3` = "G") que nunca ancoraram:
 * `assignTextAnchors` recusa qualquer example com menos de dois caracteres
 * antes de olhar o HTML ("abaixo disso não há frase: é ruído, e nenhuma
 * fronteira salva"), e três avatares no mesmo bloco reprovariam a exigência
 * de ocorrência única de qualquer forma.
 *
 * A arte passou a trazer o token `INICIAL_N_AQUI` — catorze caracteres, um
 * por cartão, ancora sem esforço — e o valor é calculado aqui a partir do
 * nome do MESMO cartão. Ninguém deveria escrever "G" quando o nome é
 * "Gabriela": digitar os dois abre a porta para o par divergir, e é o tipo
 * de divergência que só aparece no e-mail pronto.
 *
 * Puro: quem lê o `content` do bloco é o callback do n8n.
 */

/** `review_1_initial` → `review_1_name`. Null quando a chave não é de inicial. */
export function chaveDoNome(keyDaInicial: string): string | null {
  const m = /^(.*)_initial$/i.exec(keyDaInicial.trim())
  return m ? `${m[1]}_name` : null
}

/**
 * Primeira LETRA do nome, em maiúscula.
 *
 * Letra, não caractere: os examples da biblioteca numeram os cartões
 * ("1 Buyer Name"), e um n8n que devolvesse "1 Gabriela" poria o dígito
 * dentro do círculo. Acento fica — é o nome da pessoa, e "Á" cabe no
 * mesmo espaço que "A".
 *
 * Sem letra nenhuma devolve vazio, e aí o merge esvazia a âncora: o avatar
 * sai sem letra em vez de sair com o token à mostra.
 */
export function inicialDoNome(nome: unknown): string {
  if (typeof nome !== "string") return ""
  const m = /\p{L}/u.exec(nome)
  return m ? m[0].toLocaleUpperCase() : ""
}

/**
 * Preenche toda chave `*_initial` do bloco com a inicial do `*_name` irmão.
 * Devolve o que preencheu, para a telemetria dizer que a derivação rodou.
 *
 * Sobrescreve o que o n8n tiver mandado: o campo é derivado por contrato, e
 * o `guidance` diz isso. Chave de inicial sem o nome correspondente é
 * deixada como está — inventar letra a partir de nada seria pior.
 */
export function derivarIniciais(
  content: Record<string, unknown>,
): Array<{ key: string; de: string; para: string }> {
  const feitos: Array<{ key: string; de: string; para: string }> = []
  for (const key of Object.keys(content)) {
    const nomeKey = chaveDoNome(key)
    if (!nomeKey || !(nomeKey in content)) continue
    const letra = inicialDoNome(content[nomeKey])
    if (content[key] === letra) continue
    content[key] = letra
    feitos.push({ key, de: nomeKey, para: letra })
  }
  return feitos
}
