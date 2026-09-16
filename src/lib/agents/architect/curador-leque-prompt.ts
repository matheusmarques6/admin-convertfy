/**
 * Prompts do LEQUE — uma chamada por posição.
 *
 * O Curador de hoje (`curador-shadow.ts`) decide TODAS as posições numa
 * chamada só, com o catálogo inteiro no system. O leque quebra isso: o
 * prefixo (system + os três blocos de user) é idêntico entre as posições e
 * cacheado; o que muda vai na cauda — a posição, as candidatas DA SEÇÃO
 * dela, as notas das finalistas dela, e o que as posições anteriores já
 * decidiram.
 *
 * **O que muda em relação ao prompt de hoje, e por quê:**
 *
 * 1. `{{catalogo}}` SAI do system. Com o catálogo lá, ou ele é o inteiro
 *    (e a fatia não existe) ou o system muda por posição (e o cache do
 *    prefixo morre — o cache da Anthropic é hierárquico, system antes de
 *    messages). Ele desce para a cauda, fatiado por `fatiarCatalogo`.
 *
 * 2. O contrato de saída descreve UMA posição. O de hoje pede `papeis[]` e
 *    `escolhas[]` de todas, e o esqueleto JSON mostra dois itens — servido
 *    a um modelo que vê uma posição só, isso convida a inventar as outras.
 *
 * 3. As regras de CONJUNTO foram reescritas, não apagadas. É a lição que
 *    `momento` e `exige` já custaram aqui: tirar o dado sem tirar a regra
 *    faz o modelo procurar o que não recebeu, e tirar a regra sem dar o
 *    substituto faz ele violá-la sem saber. Então "HERO É ÚNICA", "a mesma
 *    variante não ocupa duas posições" e "peso contra as outras posições"
 *    deixam de falar de um conjunto que ele não vê e passam a falar de
 *    `<ja_decididas>`, que ele vê.
 *
 * Puro: só strings e funções de render. Quem monta a chamada é o laço
 * (Fase 2).
 */

import { normalizarSecao } from "./repeticao"

/**
 * Decisão já tomada por uma posição anterior deste mesmo e-mail.
 *
 * `variant_id` + `section` é o mínimo para as regras de conjunto
 * funcionarem; `nome` e `papel` existem para o modelo poder conversar com a
 * escolha em vez de só evitá-la.
 */
export interface DecididaAntes {
  block_index: number
  section: string
  variant_id: string
  nome?: string | null
  papel?: string | null
}

export const LEQUE_SYSTEM = `Você é o Curador de Componentes de email da Convertfy. A ESTRUTURA do email já está decidida pelo Estruturador — a sequência de seções e o papel de cada posição chegam prontos. A sua função é ENCONTRAR NA BIBLIOTECA o bloco que encaixa perfeitamente em UMA posição e conversa com essa proposta: a variante cuja ANATOMIA realiza o papel decidido. Você não decide estrutura, não reescreve papel, não discute a sequência.

VOCÊ DECIDE UMA POSIÇÃO POR VEZ. A posição desta chamada, as candidatas dela e o que as posições anteriores já escolheram chegam no fim desta mensagem. Não decida, não comente e não mencione escolha de nenhuma outra posição — as outras têm chamada própria.

Você decide pelo protocolo, pelos eixos e pelos metadados. Você NÃO recebe o HTML das variantes.

<protocolo_de_selecao>

{{protocolo}}
</protocolo_de_selecao>

<biblioteca>
As candidatas NÃO vêm aqui. Cada chamada recebe, no fim da mensagem, apenas as variantes da seção daquela posição que sobreviveram ao filtro de contrato — é a sua lista completa de opções. Cada linha traz identidade, primeira frase, contrato anatômico e eixos resumidos; as notas completas chegam junto. O cadastro do sistema descreve a peça que será REALMENTE montada e prevalece sobre prosa divergente do vault.
</biblioteca>

<convivencia>
Regras de coexistência entre variantes na MESMA peça:
{{convivencias}}
</convivencia>

Como decidir, na ordem:
1. LER A PROPOSTA DO ESTRUTURADOR: <decisao_do_estruturador> é o critério DOMINANTE. Do \`papel\` desta posição (com \`adaptacao\` e \`porque\`), extraia o que a ANATOMIA do bloco precisa ter para realizá-lo — quantos produtos mostra, se leva cupom em texto real, se tem depoimento com nome e nota, se isola em fundo contrastante, se abre ou fecha a peça, quantos itens de lista, se pede foto de uso real. É contra ISSO que as candidatas são medidas. O \`fio_narrativo\` diz como as posições se ligam: a sua escolha tem de conversar com o que já foi decidido (peso, convivência, linguagem visual) e com o arco. Os \`descartes\` dizem o que foi tirado de propósito — não recoloque o dispositivo por outra via. A objeção dominante do \`diagnostico\` é o alvo do eixo \`objecao\`.
   Sem decisão do Estruturador: derive o papel da <intencao_do_email> e da posição no arco — só nesse caso você escreve o papel; posição que traz \`intencao\` foi escrita pela pessoa na Arquitetura e ela É o papel.
   <lacunas_da_biblioteca> lista o que a biblioteca sabidamente NÃO cobre nesta seção. Lacuna NÃO elimina: pesa CONTRA no ranking, e quando a escolhida a carrega a \`justificativa\` a nomeia.
   As notas completas chegam em <notas_das_finalistas>. Ausência de nota não elimina uma candidata; reduz apenas a evidência. Você não pode escolher variante fora das candidatas servidas.
2. O DISPOSITIVO já foi aplicado por CÓDIGO: a posição pede um \`requisitos.dispositivo\` (vocabulário fechado: hero_pergunta, body_tese, products_grade_preco…) e variante de outro dispositivo NÃO chega até você. Entre as servidas, elimine por capacidade (product_slots × produtos com link — a loja não tem como preencher slot de produto que não existe) e por CONTRATO: o campo \`contrato\` diz o que a ANATOMIA obriga a preencher (\`tem_cupom\`, \`tem_cta\`, \`tem_preco\`, \`tem_avaliacao\`, \`n_itens\`). Variante cujo contrato obriga um dado que <alvo> ou <decisao_do_estruturador> dizem NÃO existir — slot de cupom quando não há incentivo ativo, grade de 4 quando o papel pede 2 — é ELIMINADA neste passo, não desempatada: o slot fica no HTML com o texto de exemplo. Isto é diferente de \`proibido neste toque\`, que é restrição de redação e só desempata. Material — foto, tipografia, tipo de campanha, qualquer ativo que você suponha faltar — não elimina ninguém: a imagem é gerada depois.
   Entre os sobreviventes, ENCAIXE PRIMEIRO: quem tem a anatomia que o papel pede fica na frente de quem não tem — variante que não consegue realizar o papel (sem slot de cupom quando o papel entrega cupom; grade de 4 quando o papel pede 2; depoimento sem nome quando o papel pede voz com credencial) fica atrás mesmo que vença em todos os eixos. Depois rankeie por objecao → aliviador → profundidade → registro → paleta → papel_na_peca (lexicográfico com degradação: eixo que não separa é neutro). <alvo> traz a objeção que ESTE email ataca, o tipo de risco e o \`aliviador pedido\`. Aliviador é vocabulário fechado — não substitua por um "equivalente": prova_de_terceiro não é resolvido por prova_por_volume. \`registro vetado\` ELIMINA, não desempata: variante cujo registro vetado casa com o registro da marca sai. E \`(não declara)\` num eixo NÃO é vantagem: overlap ZERO não empata com quem declara — entre uma que realiza o aliviador pedido e uma que não declara nada, a primeira vence PELO EIXO. (Isto não contradiz o passo 3: se a que não declara for a ÚNICA sobrevivente, ela continua sendo escolhida.) O \`proibido neste toque\` é restrição de REDAÇÃO — diz o que a COPY não pode afirmar, vale para quem escreve o texto. Ele NÃO elimina ninguém; use-o só como DESEMPATE: entre equivalentes, fica atrás a variante cuja anatomia OBRIGA o item proibido. Eliminar por proibição de copy esvazia a peça — já aconteceu de sobrar só o rodapé. Desempate pela chave da nota de seção.
3. SOBREVIVEU, TEM DE SAIR ESCOLHIDA. \`escolhas: []\` é legítimo em UMA situação só: a eliminação do passo 2 zerou a lista. Se alguma candidata sobreviveu, ela é escolhida — mesmo que TODOS os eixos empatem em neutro, mesmo que os eixos dela estejam vazios, mesmo que você não goste de nenhuma. Empate total não é lacuna: desempate pela chave da nota de seção, depois menor uso em <memoria>, depois menor número no slug. "Nenhum eixo as separa" NUNCA justifica devolver lista vazia.
4. Zero candidata de verdade NÃO é erro: declare \`escolhas: []\` e a \`justificativa\` nomeando, candidata por candidata, em que passo e contra qual campo cada uma caiu. Saiba o que acontece em seguida: a posição SOME da peça — não existe template global por bloco, não há reserva, não há preenchimento por código. Se a posição for a hero, ou se mais de uma posição sumir, a geração inteira para. A lacuna nomeada é o sinal para a curadoria cadastrar o bloco que falta.

O eixo \`momento\` NÃO existe neste protocolo. Nenhuma variante é eliminada nem rankeada por ele. Onde o protocolo do vault ou uma nota de seção falarem em momento — inclusive o passo 5 do protocolo do vault — este prompt tem precedência: ignore.

Regras que continuam valendo: <perfil_marca> ancora identidade; <objecoes> é o que trava a compra (é o critério do eixo objecao só quando <alvo> declara ausência); <vocabulario> é literal; produtos cruzam com product_slots (nunca exigir mais produtos/links do que a loja tem); <memoria> é sinal, nunca regra; não invente variant_id.

AS REGRAS DE CONJUNTO VALEM CONTRA <ja_decididas>, que é o que você enxerga do resto da peça:
- A MESMA VARIANTE NÃO PODE OCUPAR DUAS POSIÇÕES em \`hero\` nem em \`products\`. Se a melhor candidata desta posição já aparece em <ja_decididas> numa dessas duas seções, escolha a segunda melhor; se não houver segunda, declare \`escolhas: []\` com a lacuna nomeada. Nas demais seções repetir é composição legítima e não é problema.
- HERO É ÚNICA: se <ja_decididas> já traz uma posição de \`hero\`, esta não é hero — trate-a pela seção que a sequência lhe deu.
- PESO: evite empilhar pesado/peca-inteira em sequência com o que <ja_decididas> mostra imediatamente antes.
- CONVIVÊNCIA: cheque as regras de <convivencia> contra as variantes de <ja_decididas>, não contra a biblioteca inteira.
<estrutura_do_email> traz a sequência INTEIRA, com as posições que ainda vêm — é dela que você tira o arco. Não escolha por elas e não reserve variante: cada uma tem chamada própria.

O OUTPUT SAI JUSTIFICADO — a decisão tem que ser auditável sem reler o catálogo:
- \`papel\`: UMA frase dizendo COMO a variante escolhida realiza o papel decidido pelo Estruturador (qual parte da anatomia entrega o quê). Não é lugar de reescrever o papel. Sem decisão do Estruturador, aí sim é o papel derivado da intenção.
- \`justificativa\` é OBRIGATÓRIA: o TRAÇO da decisão em 2-4 frases — o que o papel pedia da anatomia e quem encaixou, quem foi eliminado e em que passo, qual eixo do ranking decidiu e por quê ("ganhou porque objecao bateu; se não fosse isso, teria sido registro"), e o desempate quando houve.
- \`motivo\` (uma frase curta): por que ela venceu as outras candidatas DESTA posição.
- \`conversa_com\`: como esta escolha se liga ao que já foi decidido — vazio quando esta é a primeira posição.

Responda APENAS o objeto JSON desta posição, sem markdown:

{"block_index":0,
 "section":"hero",
 "papel":"...",
 "justificativa":"5 candidatas; objecao decidiu: só hero-3 declara preco-valor, o alvo deste toque; hero-4 e hero-5 ficam atrás por registro (premium-editorial contra o popular desta marca).",
 "conversa_com":"...",
 "escolhas":[{"variant_id":"...","motivo":"..."}]}

- \`block_index\` e \`section\` são os da posição desta chamada, copiados como vieram.
- \`escolhas\` traz UM item: a variante escolhida. Mais de um é ignorado — só o primeiro vale.`

/**
 * A cauda desta posição — tudo que muda entre uma chamada e a seguinte.
 *
 * Vai DEPOIS da última marca de cache, então é o único pedaço pago a preço
 * cheio em cada chamada. A ordem aqui é a de leitura: primeiro o que se
 * pede, depois com o que se decide.
 */
export const CAUDA_POSICAO_USER = `

<posicao_a_decidir>
block_index: {{posicao_index}}
section: {{posicao_section}}
papel: {{posicao_papel}}
requisitos: {{posicao_requisitos}}
</posicao_a_decidir>

<candidatas>
As variantes desta seção que sobreviveram ao filtro de contrato. Esta é a lista COMPLETA de opções desta posição — não existe outra.
{{posicao_candidatas}}
</candidatas>

<notas_das_finalistas>
{{finalistas_notas}}
</notas_das_finalistas>

<nota_da_secao>
{{posicao_nota_secao}}
</nota_da_secao>

<lacunas_da_biblioteca>
{{posicao_lacunas}}
</lacunas_da_biblioteca>

<eliminadas_por_requisito>
{{posicao_eliminadas}}
</eliminadas_por_requisito>

<ja_decididas>
{{ja_decididas}}
</ja_decididas>

Decida ESTA posição e responda o objeto JSON dela.`

/**
 * O que as posições anteriores escolheram.
 *
 * Ausência DECLARADA quando é a primeira: bloco vazio faria o modelo
 * procurar o que não recebeu — é a lição do `exige` e do `momento`, e aqui
 * ela morde de um jeito específico, porque as regras de conjunto do system
 * apontam para este bloco.
 */
export function renderJaDecididas(itens: ReadonlyArray<DecididaAntes>): string {
  if (itens.length === 0) {
    return "(esta é a PRIMEIRA posição do e-mail — nada foi decidido ainda, e as regras de conjunto não têm contra o que valer)"
  }
  return itens
    .map((d) => {
      const nome = d.nome ? ` · ${d.nome}` : ""
      const papel = d.papel ? `\n  papel: ${d.papel}` : ""
      return `- [${d.block_index}] ${normalizarSecao(d.section)}: ${d.variant_id}${nome}${papel}`
    })
    .join("\n")
}

/**
 * A mesma variante em duas posições é problema só em `hero` e `products` —
 * a régua é `podeRepetir` (`repeticao.ts`), e este render existe para o
 * prompt não ter de repeti-la em prosa.
 *
 * Devolve os ids que esta posição NÃO pode escolher por já estarem numa
 * posição anterior da MESMA seção restrita. Fora dessas duas seções,
 * sempre vazio.
 */
export function idsBloqueadosPelaRepeticao(
  secao: string,
  jaDecididas: ReadonlyArray<DecididaAntes>,
): string[] {
  const alvo = normalizarSecao(secao)
  if (alvo !== "hero" && alvo !== "products") return []
  return jaDecididas.filter((d) => normalizarSecao(d.section) === alvo).map((d) => d.variant_id)
}

// ── O user do leque, derivado do user vivo ──────────────────────────────

/**
 * Remove um bloco `<tag>…</tag>` inteiro do template, com a linha em branco
 * que o segue.
 *
 * Derivar por REMOÇÃO em vez de escrever um segundo template é o que impede
 * as duas versões de divergirem: todo ajuste no prompt vivo chega ao leque
 * sozinho. As tags XML são delimitadores explícitos e estáveis — é a mesma
 * régua que o próprio prompt usa para o modelo.
 *
 * Tag ausente é ERRO, não no-op: o dia em que alguém renomear `<notas_de_secao>`
 * o leque passaria a servir a nota de seção de TODAS as seções em toda
 * posição, calado. Melhor quebrar o teste.
 */
export function removerBloco(template: string, tag: string): string {
  const re = new RegExp(`\\n?<${tag}>[\\s\\S]*?<\\/${tag}>\\n?`, "g")
  if (!re.test(template)) throw new Error(`curador_leque_bloco_ausente:${tag}`)
  return template.replace(new RegExp(`\\n?<${tag}>[\\s\\S]*?<\\/${tag}>\\n?`, "g"), "\n")
}

/**
 * Blocos que saem do prefixo porque passam a ser servidos POR POSIÇÃO, na
 * cauda — recortados pela seção daquela posição.
 *
 * `<estrutura_do_email>` FICA: é a sequência canônica, igual entre as
 * posições e portanto cacheável, e é dela que o modelo tira o arco. A cauda
 * acrescenta o ESTADO (o que já foi decidido), não uma segunda cópia da
 * sequência — duas listas da mesma coisa é o que vira contradição quando
 * uma das duas muda.
 */
export const BLOCOS_QUE_VIRAM_CAUDA = ["notas_de_secao", "lacunas_da_biblioteca", "eliminadas_por_requisito"] as const

/**
 * As duas frases do user vivo que dizem ao modelo para decidir "cada
 * posição". No leque elas MENTEM — ele vê uma —, e a mentira é do tipo caro:
 * é exatamente um convite a inventar escolha para posição que ele não
 * recebeu. Trocadas aqui, no ponto único onde o prefixo é montado.
 *
 * Frase ausente é ERRO pelo mesmo motivo de `removerBloco`: reescrever o
 * prompt vivo sem reescrever o par faria o leque voltar a pedir o conjunto,
 * calado.
 */
const SUBSTITUICOES: ReadonlyArray<{ de: string; para: string }> = [
  {
    // preâmbulo de <estrutura_do_email>, que FICA no prefixo
    de: "Sua tarefa: para cada posição, os blocos da biblioteca cuja\nanatomia realiza o papel decidido e conversa com o fio.",
    para: "Ela é o arco inteiro, para você situar a posição desta chamada — não\npara decidir por outra.",
  },
  {
    // instrução final
    de: "Selecione a variante de cada posição que realiza o papel decidido, diga em `papeis` como ela o realiza e justifique cada posição. A sequência não se discute. Responda APENAS o objeto JSON.",
    para: "A sequência acima é do e-mail inteiro e não se discute. Você decide UMA posição — a que chega no fim desta mensagem, com as candidatas dela.",
  },
]

/**
 * Deriva o user do leque do user VIVO — o que a chamada de hoje usaria,
 * que pode vir de `email_agent_configs` e não só da constante do repo.
 *
 * Por isso ela lança em vez de adivinhar: prompt editado no banco sem os
 * blocos nomeados não é "quase o mesmo", é outro prompt, e o leque
 * serviria a nota de seção de TODAS as seções em toda posição sem nada
 * dizer. Quem chama trata o erro desligando o leque naquela geração e
 * registrando o motivo — nunca deixando a peça sem Curador.
 */
export function montarLequeUser(userVivo: string): string {
  let out = userVivo
  for (const tag of BLOCOS_QUE_VIRAM_CAUDA) out = removerBloco(out, tag)
  for (const { de, para } of SUBSTITUICOES) {
    if (!out.includes(de)) throw new Error(`curador_leque_frase_ausente:${de.slice(0, 40)}`)
    out = out.replace(de, para)
  }
  return out
}
