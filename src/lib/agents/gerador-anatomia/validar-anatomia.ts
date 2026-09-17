/**
 * Validador de uma anatomia gerada (Trilha B4) — puro.
 *
 * Reúne as réguas que já existem, na ordem em que a peça as encontraria em
 * produção, e devolve um relatório que serve a dois leitores: o retry do
 * gerador (cada erro é uma correção legível) e a telemetria da run.
 *
 *   1. pós-processador + lint de envio (B2) — bloqueante reprova;
 *   2. largura canônica de 600px (`auditEmailWidth`);
 *   3. tokens de identidade (B5): fundo/texto/fonte por token, ZERO hex ou
 *      font-family literal em contexto de cor/fonte;
 *   4. `output_schema` válido (zod da biblioteca) e cobertura: todo campo
 *      de copy ancora no HTML pela frase do example (o MESMO casador da
 *      produção, `auditVariantCoverage`); todo campo url/image tem o seu
 *      `{{KEY}}`;
 *   5. contrato do dispositivo (`resumirContrato` × `contratoDoDispositivo`).
 *
 * A anatomia que passa aqui entra na biblioteca DESATIVADA: o validador
 * mede o mecânico; se ela é boa, quem diz é a curadoria, olhando a prévia.
 */

import { outputFieldSchema } from "../shared/component-schemas"
import { conflitoDeContrato, resumirContrato, type ContratoResumo, type RequisitosDuros } from "../shared/field-roles"
import type { Dispositivo } from "../shared/dispositivos"
import { auditEmailWidth, enforceEmailWidth } from "@/lib/email-workspace/email-width"
import { auditVariantCoverage } from "../html/coverage-audit"
import { extractColorInventory } from "../html/color-inventory"
import { lintEnvio, type Achado } from "../html/lint-envio"
import { posProcessar, type FixAplicado } from "../html/pos-processador"
import { tokensNoHtml, type TokenDeIdentidade } from "../html/identity-tokens"

export interface ValidacaoDaAnatomia {
  ok: boolean
  /** Reprovações — cada uma é uma correção para o retry. */
  erros: string[]
  /** O que passou com ressalva (vai para a telemetria e para a tela). */
  avisos: string[]
  /** HTML depois do pós-processador — é o que entra na biblioteca. */
  html: string
  lint: { itens: Achado[]; bloqueantes: string[]; fixes: FixAplicado[] }
  tokens: TokenDeIdentidade[]
  contrato: ContratoResumo
  cobertura: { campos_copy: number; ancorados: number; orfaos_suspeitos: number }
  /** `output_schema` normalizado pelo zod (chaves canônicas). */
  schema: Array<Record<string, unknown>>
}

/**
 * O contrato duro por dispositivo — a mesma régua do Curador
 * (`conflitoDeContrato`), com o que cada família da biblioteca exige.
 * `links` e `imagens` são checados fora do `RequisitosDuros` porque o
 * contrato do Curador não os cobre.
 */
export function contratoDoDispositivo(d: Dispositivo): {
  requisitos: RequisitosDuros
  links?: { min?: number; max?: number }
  imagens?: { min?: number }
  credencial?: boolean
  itens_exatos?: number
} {
  switch (d) {
    case "hero_apresentacao":
      return { requisitos: { cta: true, cupom: false } }
    case "hero_oferta_cupom":
      return { requisitos: { cta: true, cupom: true } }
    case "hero_pergunta":
      return { requisitos: { cta: true, cupom: false } }
    case "hero_lineup":
      return { requisitos: { cta: true, n_itens: { min: 3 } } }
    case "body_tese":
      return { requisitos: { cta: true, n_itens: { max: 1 } } }
    case "body_mecanismo_visual":
      return { requisitos: { n_itens: { min: 2, max: 4 } }, imagens: { min: 1 } }
    case "body_garantias":
      return { requisitos: { cupom: false, n_itens: { min: 2, max: 4 } } }
    case "body_comparacao":
      return { requisitos: { n_itens: { min: 3, max: 5 } } }
    case "body_faq":
      return { requisitos: { n_itens: { min: 3, max: 5 } } }
    case "body_passos":
      return { requisitos: { n_itens: { min: 3, max: 5 } } }
    case "products_grade_preco":
      return { requisitos: { preco: true, n_itens: { min: 2, max: 4 } }, imagens: { min: 2 } }
    case "products_grade_sem_preco":
      return { requisitos: { preco: false, n_itens: { min: 2, max: 4 } }, imagens: { min: 2 } }
    case "products_unico_oferta":
      return { requisitos: { preco: true, cta: true, n_itens: { max: 1 } }, imagens: { min: 1 } }
    case "products_galeria":
      return { requisitos: { preco: false, n_itens: { min: 2, max: 3 } }, imagens: { min: 2 } }
    case "reviews_2":
      return { requisitos: { n_itens: { min: 2, max: 2 } }, itens_exatos: 2, credencial: false }
    case "reviews_3plus":
      return { requisitos: { n_itens: { min: 3 } } }
    case "reviews_com_credencial":
      return { requisitos: { n_itens: { min: 1, max: 3 } }, credencial: true }
    case "offer_cupom":
      return { requisitos: { cupom: true, cta: true } }
    case "offer_sem_cupom":
      return { requisitos: { cupom: false, cta: true } }
    case "offer_lembrete":
      return { requisitos: { cupom: true, cta: true } }
    case "footer_nav":
      return { requisitos: {}, links: { min: 4, max: 9 } }
    case "footer_minimo":
      return { requisitos: {}, links: { max: 3 } }
  }
}

const FONT_LITERAL_RE = /font-family\s*:\s*(?!\{\{FONTE_)[^;}"]+/gi

export function validarAnatomia(input: {
  html: string
  output_schema: Array<Record<string, unknown>>
  dispositivo: Dispositivo
}): ValidacaoDaAnatomia {
  const erros: string[] = []
  const avisos: string[] = []

  // 1. largura canônica (o MESMO passo do POST da biblioteca: calha 100%
  //    vira 600, container perto de 600 vira 600) + pós-processador + lint
  const pos = posProcessar(enforceEmailWidth(input.html).html)
  const html = pos.html
  const lint = lintEnvio(html)
  for (const a of lint.itens) {
    const linha = `${a.id}: ${a.evidencia} (${a.n}×)`
    if (a.severidade === "bloqueia") erros.push(`lint ${linha}`)
    else avisos.push(`lint ${linha}`)
  }

  // 2. largura
  const largura = auditEmailWidth(html)
  if (!largura.ok) erros.push(`largura: ${largura.reason}`)

  // 3. tokens
  const tokens = tokensNoHtml(html)
  if (!tokens.includes("COR_FUNDO")) erros.push("tokens: o fundo do container precisa ser {{COR_FUNDO}}")
  if (!tokens.includes("COR_TEXTO")) erros.push("tokens: o texto precisa usar {{COR_TEXTO}}")
  if (!tokens.includes("FONTE_TITULO") && !tokens.includes("FONTE_CORPO")) erros.push("tokens: font-family precisa ser {{FONTE_TITULO}}/{{FONTE_CORPO}}")
  const inventario = extractColorInventory(html)
  const literais = inventario.filter((e) => (e.contextos.background ?? 0) + (e.contextos.bgcolor ?? 0) + (e.contextos.color ?? 0) > 0)
  if (literais.length > 0) {
    erros.push(`tokens: cor literal em fundo/texto — troque por token: ${literais.map((e) => `${e.valor} (${e.ocorrencias}×)`).join(", ")}`)
  }
  const fontesLiterais = [...html.matchAll(FONT_LITERAL_RE)].map((m) => m[0].replace(/font-family\s*:\s*/i, "").trim())
  if (fontesLiterais.length > 0) {
    erros.push(`tokens: font-family literal — troque por {{FONTE_TITULO}}/{{FONTE_CORPO}}: ${[...new Set(fontesLiterais)].slice(0, 5).join(" | ")}`)
  }

  // 4. schema + cobertura
  const schema: Array<Record<string, unknown>> = []
  input.output_schema.forEach((campo, i) => {
    const r = outputFieldSchema.safeParse(campo)
    if (r.success) schema.push(r.data as Record<string, unknown>)
    else erros.push(`schema[${i}] (${String(campo?.key ?? "?")}): ${r.error.issues.map((x) => x.message).join("; ")}`)
  })
  const chaves = new Set<string>()
  for (const f of schema) {
    const k = String(f.key)
    if (chaves.has(k)) erros.push(`schema: chave repetida "${k}"`)
    chaves.add(k)
  }
  for (const f of schema) {
    const k = String(f.key)
    const tag = `{{${k.toUpperCase()}}}`
    if ((f.type === "url" || f.type === "image") && !html.includes(tag)) {
      erros.push(`schema: campo ${f.type} "${k}" precisa aparecer no HTML como ${tag}`)
    }
  }
  // Cobertura só dos campos de TEXTO: url/image/boolean/number não têm
  // frase de example para ancorar — o endereço deles é o {{TAG}} conferido
  // acima. Sem o filtro, todo `cta_url` reprovava como "não ancora".
  const camposDeTexto = schema.filter((f) => f.type === "text_short" || f.type === "text_long")
  const cobertura = auditVariantCoverage({ id: "nova", name: "nova", html, schema: camposDeTexto })
  for (const c of cobertura.camposComProblema) {
    erros.push(`cobertura: campo "${c.key}" não ancora no HTML pela frase do example ("${c.example.slice(0, 60)}") — ${c.motivo ?? c.desfecho}`)
  }
  for (const o of cobertura.orfaos.filter((x) => x.suspeito)) {
    erros.push(`cobertura: texto visível sem campo no schema: "${o.texto.slice(0, 80)}"`)
  }

  // 5. contrato do dispositivo
  const contrato = resumirContrato(schema)
  const regra = contratoDoDispositivo(input.dispositivo)
  const conflito = conflitoDeContrato(contrato, regra.requisitos)
  if (conflito) erros.push(`contrato ${input.dispositivo}: ${conflito}`)
  if (regra.itens_exatos != null && contrato.n_itens !== regra.itens_exatos) {
    erros.push(`contrato ${input.dispositivo}: exige exatamente ${regra.itens_exatos} itens numerados (encontrei ${contrato.n_itens ?? 0})`)
  }
  if (regra.credencial === true && !contrato.tem_credencial) {
    erros.push(`contrato ${input.dispositivo}: exige credencial do depoente (review_N_role/context)`)
  }
  if (regra.credencial === false && contrato.tem_credencial) {
    avisos.push(`contrato ${input.dispositivo}: tem credencial — é reviews_com_credencial, não reviews_2`)
  }
  if (regra.imagens && contrato.imagens < (regra.imagens.min ?? 0)) {
    erros.push(`contrato ${input.dispositivo}: exige ao menos ${regra.imagens.min} campo(s) de imagem (encontrei ${contrato.imagens})`)
  }
  const links = (html.match(/<a\b[^>]*\bhref=/gi) ?? []).length
  if (regra.links?.min != null && links < regra.links.min) erros.push(`contrato ${input.dispositivo}: exige ao menos ${regra.links.min} links (encontrei ${links})`)
  if (regra.links?.max != null && links > regra.links.max) erros.push(`contrato ${input.dispositivo}: no máximo ${regra.links.max} links (encontrei ${links})`)

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    html,
    lint: { itens: lint.itens, bloqueantes: lint.bloqueantes, fixes: pos.aplicados },
    tokens,
    contrato,
    cobertura: { campos_copy: cobertura.camposCopy, ancorados: cobertura.ancorados, orfaos_suspeitos: cobertura.orfaosSuspeitos },
    schema,
  }
}
