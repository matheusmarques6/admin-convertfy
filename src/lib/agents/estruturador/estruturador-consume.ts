/**
 * Consumo do output do Estruturador (fase 3 — modo 'on'). Módulo PURO.
 *
 * Quando `estruturador_mode='on'` e a run devolve estrutura, a sequência
 * decidida pelo agente SUBSTITUI a da aba Arquitetura: as posições viram a
 * `structure` do Montador e do Curador (categoria + papel como rótulo) e o
 * papel narrativo de cada posição sobrescreve o `purpose` do bloco
 * correspondente no blueprint — é assim que a decisão chega à copy do n8n
 * (o purpose já viaja no payload por bloco). A intenção por bloco da
 * Arquitetura não entra nesse caminho (a sequência é do Estruturador).
 * O `fio_narrativo` vira o guidance do Montador e persiste no blueprint
 * (coluna própria, migration 20261083) para alimentar EMAIL_IDEIA e o
 * payload de copy.
 */

import { deriveFieldNature } from "../shared/component-dimensions"
import { papelDoCampo } from "../shared/field-roles"
import {
  normalizarRequisitos,
  type EstruturadorOutput,
  type RequisitosDaPosicao,
} from "./estruturador-prompt"

/** Posição consumível: OutlineSection + papel narrativo completo. */
export interface PosicaoEstruturada {
  section: string
  /** Rótulo curto p/ o Montador (papel truncado — o prompt lista 1 linha/bloco). */
  label: string
  /** Papel narrativo completo (+ adaptação) — vira o purpose do blueprint. */
  papel: string
  /** Porquê da posição (embasamento) — entra no resumo servido ao Curador. */
  porque: string
  /** Requisitos tipados (09/09) — viajam DENTRO da posição, então sobrevivem ao clamp. */
  requisitos?: RequisitosDaPosicao | null
}

const LABEL_MAX = 90

function truncateLabel(s: string): string {
  const t = s.trim().replace(/\s+/g, " ")
  if (t.length <= LABEL_MAX) return t
  return `${t.slice(0, LABEL_MAX - 1).trimEnd()}…`
}

/**
 * Converte a estrutura do agente nas posições consumíveis pelo pipeline.
 * O rótulo carrega o papel (é o que o Montador lê por bloco); o papel
 * completo (com a adaptação quando existe) segue para o blueprint.
 */
export function estruturaParaPosicoes(
  output: EstruturadorOutput,
): PosicaoEstruturada[] {
  return output.estrutura.map((p) => {
    const papelBase = p.papel.trim()
    const adaptacao = p.adaptacao?.trim()
    return {
      section: p.section,
      label: truncateLabel(papelBase) || p.section,
      papel: adaptacao ? `${papelBase} — Adaptação: ${adaptacao}` : papelBase,
      porque: p.porque?.trim() ?? "",
      requisitos: p.requisitos ?? null,
    }
  })
}

/**
 * A decisão do Estruturador servida ao CURADOR (var `estruturador_decisao`
 * do prompt): o output INTEIRO, em JSON legível — diagnóstico, cada posição
 * com papel/referência/adaptação/porquê, fio, fontes, aprendizados
 * aplicados e descartes.
 *
 * Era um resumo (`resumoParaCurador`: objeção + mecanismo + fio + papel/
 * porquê por posição). Decisão do owner (02/09): o Curador recebe tudo. Os
 * descartes importam na prática — se o Estruturador tirou o CTA isolado
 * "para não competir com os botões da grade", o Curador precisa saber, senão
 * escolhe um body com CTA pesado e recoloca o dispositivo por outra via.
 *
 * Clamp de segurança (24k chars, marcador explícito) no mesmo espírito do
 * `clampPromptText`: um output patológico não pode engolir o prompt.
 */
export const DECISAO_MAX_CHARS = 24_000

export function decisaoCompletaParaCurador(output: EstruturadorOutput): string {
  const json = JSON.stringify(output, null, 2)
  if (json.length <= DECISAO_MAX_CHARS) return json
  return `${json.slice(0, DECISAO_MAX_CHARS)}\n(… decisão truncada em ${DECISAO_MAX_CHARS} caracteres — o restante está na run do Estruturador)`
}

/**
 * Aplica papéis + fio no blueprint gerado (AMBAS as rotas — determinística e
 * LLM — passam aqui antes do upsert). Por posição (índice), o papel do
 * Estruturador vira a 1ª linha do purpose; a diretiva original (derivada da
 * variante/HTML) é mantida como "Forma" — o papel diz O QUE a posição faz no
 * arco, a forma diz COMO a variante entrega. Comprimentos divergentes são
 * tolerados: posição sem papel mantém o purpose original (blueprint pode ter
 * ganho/perdido bloco no clamp ou no builder).
 *
 * Retorna um NOVO objeto — não muta o input.
 */
/**
 * Arbitragem papel × forma (09/09). O `purpose` da hero do batch 644d86c5
 * dizia, no mesmo texto, "sem CTA, sem cupom" (papel) e "linha do cupom —
 * o código em bold / CTA — verbo + valor" (forma da variante), e os
 * `fields` traziam `coupon_line` e `cta_label` a preencher. O n8n obedeceu
 * ao mais concreto: o schema. Aqui o campo que colide com um requisito DURO
 * é marcado `omitir` — sai do payload, chega vazio ao merge, a linha some.
 * Campo `required` omitido é incompatibilidade dura (o Curador deveria ter
 * filtrado): omite do mesmo jeito e o motivo diz.
 */
export function arbitrarCampos<F extends { key: string; required?: boolean; nature?: string; type?: string }>(
  fields: F[],
  requisitos: RequisitosDaPosicao | null | undefined,
): Array<F & { omitir?: boolean; omitir_motivo?: string }> {
  if (!requisitos) return fields
  return fields.map((f) => {
    if (deriveFieldNature({ type: f.type ?? "text_short", nature: f.nature ?? null }) !== "copy") return f
    const p = papelDoCampo(f.key)
    let motivo: string | null = null
    if (requisitos.cupom === false && p.cupom) motivo = "cupom negado pela decisão do Estruturador"
    // Sem incentivo não existe "de/por" nem contagem regressiva: o campo
    // ficaria com um desconto e um prazo INVENTADOS. `cupom: false` é o
    // sinal de "sem oferta" que a decisão já carrega por posição — no caso
    // que motivou isto (Hero Boxers, products, 11/09) ela dizia, no mesmo
    // objeto, `cupom: false`, `preco: true` e "sem menção a oferta, código
    // ou bundle". O preço VIGENTE (`price_new`) não é tocado: é o que a
    // decisão está pedindo.
    else if (requisitos.cupom === false && p.preco_antigo) motivo = "preço anterior riscado sem oferta na decisão do Estruturador"
    else if (requisitos.cupom === false && p.prazo) motivo = "prazo de oferta sem oferta na decisão do Estruturador"
    else if (requisitos.cta === false && p.cta) motivo = "CTA negado pela decisão do Estruturador"
    else if (
      requisitos.n_itens &&
      p.familia &&
      p.indice != null &&
      p.indice > requisitos.n_itens.max
    ) {
      motivo = `item ${p.indice} acima do máximo de ${requisitos.n_itens.max} pedido pela decisão`
    }
    if (!motivo) return f
    if (f.required === true) motivo += " (campo obrigatório da variante: incompatibilidade dura — o Curador deveria ter filtrado)"
    return { ...f, omitir: true, omitir_motivo: motivo }
  })
}

/**
 * Projeta o que foi decidido POR POSIÇÃO sobre as posições que de fato
 * viraram bloco no e-mail (módulo puro).
 *
 * O Estruturador decide N posições; o Curador encontra variante para
 * algumas delas. A posição sem variante NÃO vira bloco — `matchFromSlots`
 * (deterministic-blueprint.builder) só enxerga `kind: "variant"` —, então
 * papéis e requisitos, que vêm indexados pela sequência do Estruturador,
 * ficam mais longos que `blocks` e `aplicarEstruturadorNoBlueprint` recusa
 * o lote INTEIRO (é a guarda de "papel errado é pior que papel nenhum").
 *
 * Foi o que aconteceu na Hero Boxers (09/09, welcome 1): a biblioteca não
 * tinha `products` com 2 slots e preço, a posição caiu, 6 papéis chegaram
 * para 5 blocos e NENHUM colou. O n8n recebeu como purpose o
 * `copy_guidance` cru das variantes — o da body-3 é um pitch de gift card,
 * o da hero-2 diz "CTA: verbo + oferta (SHOP 10% OFF)" — e escreveu um
 * e-mail de cupom para uma loja sem incentivo confirmado.
 *
 * Aqui o alinhamento é recuperado pela ÚNICA informação que o descarte
 * preserva: o índice da posição. Recusar segue sendo o comportamento
 * quando nem isso bate (o guard de comprimento continua a última linha de
 * defesa).
 */
export interface ProjecaoNosSlots<T> {
  /** Um item por slot com variante, na ordem em que viram bloco. */
  itens: T[]
  /** Índices (na sequência do Estruturador) das posições que não viraram bloco. */
  descartados: number[]
}

export function projetarNosSlots<T>(
  porPosicao: ReadonlyArray<T>,
  slots: ReadonlyArray<{ kind: string }> | null | undefined,
): ProjecaoNosSlots<T> {
  const lista = [...porPosicao]
  // Sem slots, ou contagem que não corresponde à sequência decidida, não há
  // como saber QUEM caiu — devolver a lista intacta deixa o guard de
  // comprimento decidir, que é o comportamento anterior a esta função.
  if (!slots || slots.length !== lista.length) {
    return { itens: lista, descartados: [] }
  }
  const itens: T[] = []
  const descartados: number[] = []
  slots.forEach((s, i) => {
    if (s.kind === "variant") itens.push(lista[i])
    else descartados.push(i)
  })
  return { itens, descartados }
}

export function aplicarEstruturadorNoBlueprint<
  B extends { purpose: string; fields?: Array<{ key: string; required?: boolean; nature?: string; type?: string }> },
  T extends { blocks: B[]; fio_narrativo?: string | null },
>(
  blueprint: T,
  papeis: string[],
  fioNarrativo: string,
  requisitosPorPosicao?: Array<RequisitosDaPosicao | null> | null,
): T {
  // Os papéis vêm por POSIÇÃO da sequência decidida; `blocks` traz só as
  // posições que acharam variante na biblioteca. Quando uma posição cai, os
  // dois arrays deixam de estar alinhados e casar por índice cola o papel
  // ERRADO — foi assim que o papel da hero ("entrega imediata do incentivo")
  // foi parar no rodapé em 07/09, na geração em que o Curador rankeou 1 de 6.
  //
  // Sem alinhamento garantido o papel não entra: o purpose volta a ser o
  // copy_guidance da variante, que é o comportamento anterior ao
  // Estruturador. Papel errado mente para a copy e para o agente de imagem;
  // papel ausente apenas não ajuda. O fio segue nos dois casos — ele é do
  // email inteiro, não de uma posição.
  if (papeis.length !== blueprint.blocks.length) {
    return { ...blueprint, fio_narrativo: fioNarrativo.trim() || null }
  }
  return {
    ...blueprint,
    fio_narrativo: fioNarrativo.trim() || null,
    blocks: blueprint.blocks.map((b, i) => {
      const papel = papeis[i]?.trim()
      const requisitos = requisitosPorPosicao?.[i] ?? null
      if (!papel && !requisitos) return b
      const original = b.purpose?.trim()
      return {
        ...b,
        ...(papel
          ? {
              papel,
              // "subordinada ao papel": o n8n lê o purpose inteiro, e a forma
              // da variante ("linha do cupom — o código em bold") não pode
              // competir com a decisão.
              purpose: original ? `${papel}\n\nForma (variante, subordinada ao papel): ${original}` : papel,
            }
          : {}),
        ...(requisitos ? { requisitos } : {}),
        ...(b.fields ? { fields: arbitrarCampos(b.fields, requisitos) } : {}),
      }
    }),
  }
}

/**
 * Intenção HUMANA do bloco (aba Arquitetura) × papel do agente (Estruturador
 * ou Curador do vault). A intenção é a âncora: vem PRIMEIRO no purpose do
 * blueprint — é a 1ª linha que o n8n lê como `bloco.purpose` e o agente de
 * imagem como `blueprint_purpose`. O papel do agente entra embaixo, como
 * detalhe ("Papel (Curador): …"); sem agente, só a intenção; sem intenção,
 * só o papel (comportamento de antes). `null` quando não há nada.
 */
export function combinarIntencaoComPapel(
  intencao: string | null | undefined,
  papelAgente: string | null | undefined,
): string | null {
  const i = (intencao ?? "").trim()
  const p = (papelAgente ?? "").trim()
  if (i && p) return `${i}\n\nPapel (Curador): ${p}`
  if (i) return i
  if (p) return p
  return null
}

/**
 * Extrai os `requisitos` por posição da decisão serializada
 * (`decisaoCompletaParaCurador`). Fail-open: JSON ilegível ou sem
 * `estrutura` → lista vazia; posição sem requisito → `null`. É o que o
 * assembler usa para o filtro duro por contrato (09/09).
 */
export function requisitosDaDecisao(json: string | null | undefined): Array<RequisitosDaPosicao | null> {
  if (!json) return []
  const start = json.indexOf("{")
  const end = json.lastIndexOf("}")
  if (start < 0 || end <= start) return []
  try {
    const obj = JSON.parse(json.slice(start, end + 1)) as { estrutura?: unknown }
    if (!Array.isArray(obj.estrutura)) return []
    return obj.estrutura.map((p) =>
      p && typeof p === "object" ? normalizarRequisitos((p as { requisitos?: unknown }).requisitos) : null,
    )
  } catch {
    return []
  }
}
