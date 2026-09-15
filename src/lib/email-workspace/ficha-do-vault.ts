/**
 * ficha-do-vault — o que o agente do Obsidian precisa saber sobre uma
 * variante e não tem como descobrir sozinho (15/09).
 *
 * O vault e o admin são dois sistemas: o token do vault é read-only e o
 * agente que escreve as notas não enxerga o cadastro. Três coisas moram só
 * do lado do admin e, erradas na nota, fazem a nota ser **ignorada em
 * silêncio** — nada em log, nada em tela, e o Curador segue escolhendo a
 * variante sem nenhum eixo:
 *
 *   1. o `variant_id` (a chave do casamento nota↔variante),
 *   2. o `nome_no_banco` EXATO (o casamento de reserva, por nome),
 *   3. o `output_schema` (que é o que revela a anatomia da peça).
 *
 * A nota `componentes/_como-cadastrar.md` já é o contrato de COMO escrever.
 * Isto aqui é o QUE cada peça é — gerado do banco, para o agente
 * classificar em vez de adivinhar.
 *
 * A forma da peça sai de `resumirContrato`, a MESMA derivação que monta a
 * linha do catálogo que o Curador lê (`catalog-builder.ts`): as duas não
 * podem divergir, senão a ficha descreve uma peça e o ranking mede outra.
 *
 * Puro (zero I/O) — client-safe, porque quem chama é o botão do editor.
 */

import { resumirContrato, type ContratoResumo, type FamiliaDeItem } from "@/lib/agents/shared/field-roles"
import type { ComponentOutputField } from "@/types/email-generation"

export interface VarianteParaFicha {
  id: string
  name: string
  block_type: string
  description?: string | null
  dispositivo?: string | null
  output_schema?: ComponentOutputField[] | null
  /**
   * O papel na peça, quando já se sabe. Não é campo do banco: quem cadastra
   * informa ao gerar a ficha, porque é ele que separa "abre o e-mail" de
   * "É o e-mail" — a distinção que fez seis heroes entrarem como abertura
   * em 15/09 quando são peças completas.
   */
  papel_na_peca?: string | null
  /** Observação livre desta variante (o que só uma pessoa sabe). */
  observacao?: string | null
}

/** A forma derivada, no MESMO vocabulário da linha do catálogo. */
export function formaDaVariante(c: ContratoResumo): string {
  const partes = [
    `${c.copy} ${c.copy === 1 ? "campo" : "campos"}`,
    c.imagens > 0 ? `${c.imagens} ${c.imagens === 1 ? "imagem" : "imagens"}` : "",
    c.n_ctas > 1 ? `${c.n_ctas} botões` : "",
    c.tem_prazo ? "prazo" : "",
    c.tem_preco_antigo ? "preço riscado" : "",
    c.tem_nome_depoente ? "nome do depoente" : "",
    c.tem_logo ? "logo" : "",
  ]
  return partes.filter(Boolean).join(" · ")
}

/** Grades por família numerada, como o catálogo publica. */
export function gradesDaVariante(c: ContratoResumo): string {
  const ordem: FamiliaDeItem[] = ["product", "review", "item", "feature"]
  return ordem
    .map((f) => {
      const n = c.itens[f]
      return n && n > 0 ? `${f} ${n}` : ""
    })
    .filter(Boolean)
    .join(", ")
}

function anatomiaDaVariante(c: ContratoResumo): string {
  return (
    [
      c.tem_cupom ? "cupom" : "",
      c.tem_cta ? "cta" : "",
      c.tem_preco ? "preço" : "",
      c.tem_avaliacao ? "avaliação" : "",
      c.tem_credencial ? "credencial" : "",
    ]
      .filter(Boolean)
      .join(", ") || "(nenhum slot de cupom, CTA, preço, avaliação ou credencial)"
  )
}

/**
 * O contrato do que o agente NÃO pode fazer. Repetido em toda ficha de
 * propósito: é a parte que, esquecida, produz nota que não entra no
 * catálogo — e o modo de falha é o silêncio.
 */
export const REGRAS_DA_NOTA = [
  "`status: aprovada` no frontmatter, ou a nota não entra no catálogo — a variante continua sendo escolhida, só que sem nenhum eixo.",
  "`variant_id` e `nome_no_banco` EXATOS, copiados desta ficha. Errados, a nota é ignorada sem nenhum aviso. Nunca troque o `variant_id` de uma nota existente.",
  "Preencha `aliviador` e `profundidade`. Nenhuma das notas atuais os declara e o código hoje os adivinha a partir do tipo de bloco — declarados, eles vencem o palpite, e são os dois eixos que mais pesam depois da objeção.",
  "NÃO escreva design system nem direção fotográfica: moram no cadastro do admin e servem aos agentes que desenham, não a quem escolhe.",
  "NÃO preencha `momento` nem `momento_vetado` — aposentados em 07/09, sem efeito nenhum.",
  "NÃO invente valor de eixo fora do vocabulário: o `valida.py` reprova.",
  "`dispositivo` NÃO vai na nota — é coluna do banco, já cadastrada. Está na ficha só para você saber com quem a peça concorre.",
] as const

/** Vocabulários fechados, na ordem em que o ranking os lê. */
export const VOCABULARIOS = `objecao: adesao-social · amplitude-de-catalogo · composicao-formulacao ·
  confianca-no-canal · disponibilidade-urgencia · escolha-variedade ·
  pertencimento · preco-valor · qualidade-eficacia · suporte-duvida ·
  uso-aprendizado
aliviador: garantia_de_devolucao · prova_de_terceiro · prova_por_volume ·
  demonstracao_de_mecanismo · transparencia_de_politica · amostra_ou_teste ·
  dado_de_adequacao · comparacao_de_categoria · seguranca_de_pagamento ·
  reputacao_da_loja
profundidade: afirmacao · mecanismo · prova_de_terceiro · garantia
registro: bold-alto-contraste · clinico-sobrio · comercial ·
  comunidade-identitario · festivo · luxo · minimalista-leve ·
  popular-informal · premium-editorial · volume-impulso
paleta: cinza-neutro · claro · com-acento-definido · creme · escuro-saturado ·
  full-dark · monocromatico · preto-e-branco
papel_na_peca: abre · apoio · fecha · meio · peca-inteira · ponte`

/** O cabeçalho que abre um lote de fichas. */
export function cabecalhoDaFicha(quantas: number, quando: string): string {
  const titulo =
    quantas === 1
      ? "# Catalogar uma variante no vault"
      : `# Catalogar ${quantas} variantes no vault (${quando})`
  return [
    titulo,
    "",
    "Escreva uma nota por variante em `componentes/variantes/<secao>/<slug>.md`,",
    "seguindo `componentes/_como-cadastrar.md`. Os dados abaixo vêm do cadastro no",
    "admin e são a VERDADE sobre a peça — não os reescreva, classifique-os.",
    "",
    "## Regras",
    "",
    ...REGRAS_DA_NOTA.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## O corpo da nota",
    "",
    "Três títulos de nível 2 são lidos pelo Curador; o resto é para gente.",
    "",
    "- `## Descrição curta` — 2 a 3 frases, até 600 caracteres. É o que ele lê primeiro.",
    "- `## Quando usar` — em que momento esta peça é a certa (até 1200).",
    "- `## Quando não usar` — em que momento ela seria o erro (até 1200). É o que faz",
    "  o Curador descartar pelo motivo certo em vez de escolher por eliminação.",
    "",
    "## Vocabulários fechados",
    "",
    VOCABULARIOS,
    "",
    "---",
    "",
  ].join("\n")
}

/**
 * A ficha de UMA variante. Sem cabeçalho: `fichasDoLote` o acrescenta uma
 * vez, e o botão do editor serve uma variante só com ele.
 */
export function fichaDaVariante(v: VarianteParaFicha): string {
  const c = resumirContrato(v.output_schema ?? null)
  const campos = (v.output_schema ?? [])
    .map((f) => f.key)
    .filter((k): k is string => Boolean(k && k.trim()))
  const grades = gradesDaVariante(c)
  const nome = v.name
  const nomeTemEspaco = nome !== nome.trim()

  const linhas: string[] = []
  linhas.push(`## ${nome.trim()}`)
  linhas.push("")
  linhas.push("```yaml")
  linhas.push(`variant_id: ${v.id}`)
  linhas.push(`nome_no_banco: ${nome}`)
  linhas.push("status: aprovada")
  linhas.push(`papel_na_peca: [${v.papel_na_peca ?? ""}]${v.papel_na_peca ? "" : "   # preencher"}`)
  linhas.push("aliviador:        # preencher")
  linhas.push("profundidade:     # preencher")
  linhas.push("objecao: []       # preencher")
  linhas.push("registro: []      # preencher")
  linhas.push("registro_vetado: []")
  linhas.push("paleta: []        # preencher")
  linhas.push("```")
  linhas.push("")
  linhas.push(`- caminho: \`componentes/variantes/${v.block_type}/<slug>.md\``)
  linhas.push(
    `- dispositivo no banco: ${v.dispositivo ? `\`${v.dispositivo}\`` : "**nenhum — classifique na aba Componentes antes de escrever a nota**"} (não vai na nota)`,
  )
  linhas.push(`- forma: ${formaDaVariante(c)}`)
  linhas.push(`- anatomia: ${anatomiaDaVariante(c)}`)
  if (grades) linhas.push(`- grades: ${grades}`)
  if (campos.length > 0) linhas.push(`- campos: \`${campos.join(", ")}\``)
  linhas.push("")
  const desc = (v.description ?? "").trim()
  linhas.push("Descrição do cadastro (prevalece sobre a sua):")
  linhas.push(desc ? `> ${desc}` : "> (o cadastro não tem descrição — escreva a sua e avise quem cadastrou)")
  if (nomeTemEspaco) {
    linhas.push("")
    linhas.push(
      `Atenção: o nome no banco tem espaço nas bordas (\`"${nome}"\`). Copie exatamente como está.`,
    )
  }
  if (v.observacao?.trim()) {
    linhas.push("")
    linhas.push(`Atenção: ${v.observacao.trim()}`)
  }
  linhas.push("")
  return linhas.join("\n")
}

/** Cabeçalho + uma ficha por variante, na ordem recebida. */
export function fichasDoLote(variantes: ReadonlyArray<VarianteParaFicha>, quando: string): string {
  return [cabecalhoDaFicha(variantes.length, quando), ...variantes.map(fichaDaVariante)].join("\n")
}
