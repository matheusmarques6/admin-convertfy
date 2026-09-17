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
    // ── Oferta e preço ────────────────────────────────────────────────
    case "oferta_em_manchete":
      // O percentual é o maior elemento; o cupom é acessório e pode faltar
      // (a hero 7 tem desconto automático e nenhum código).
      return { requisitos: { cta: true } }
    case "campanha_nomeada":
      return { requisitos: { cta: true } }
    case "oferta_condicionada":
      // A condição é o conteúdo — e por isso o que NÃO pode haver é código:
      // com ele a peça vira entrega de cupom, que é outro dispositivo.
      return { requisitos: { cta: true, cupom: false } }
    case "oferta_adiada":
      return { requisitos: { cta: true, cupom: true } }
    case "codigo_entregue":
      return { requisitos: { cta: true, cupom: true } }
    case "codigo_relembrado":
      return { requisitos: { cta: true, cupom: true } }
    case "prazo_declarado":
      return { requisitos: { cta: true } }

    // ── Argumento ─────────────────────────────────────────────────────
    case "tese_declarada":
      return { requisitos: { cta: true, n_itens: { max: 1 } } }
    case "lista_enumerada":
      return { requisitos: { n_itens: { min: 3, max: 5 } } }
    case "mecanismo_apontado":
      return { requisitos: { n_itens: { min: 2, max: 4 } }, imagens: { min: 1 } }
    case "antes_e_depois":
      // Duas fotos do mesmo ângulo: a prova É a imagem, e sem as duas o
      // dispositivo não existe.
      return { requisitos: { n_itens: { min: 2, max: 2 } }, imagens: { min: 2 } }
    case "comparacao_pareada":
      return { requisitos: { n_itens: { min: 3, max: 6 } } }
    case "duvida_antecipada":
      return { requisitos: { n_itens: { min: 3, max: 5 } } }
    case "pergunta_ao_leitor":
      return { requisitos: { cta: true, cupom: false } }
    case "cena_de_uso":
      return { requisitos: { cta: true }, imagens: { min: 1 } }
    case "remocao_de_risco":
      return { requisitos: { cupom: false, n_itens: { min: 2, max: 4 } } }
    case "oferta_de_ajuda":
      // Suporte, não venda: cupom aqui contradiz o mecanismo.
      return { requisitos: { cta: true, cupom: false } }
    case "moldura_de_genero":
      // A moldura é livre por natureza — é o único dispositivo cuja forma é
      // o estranhamento, e amarrá-la a uma anatomia mataria o mecanismo.
      return { requisitos: {} }
    case "abertura_editorial":
      return { requisitos: { cta: true, cupom: false }, imagens: { min: 1 } }

    // ── Catálogo e produto ────────────────────────────────────────────
    case "vitrine_paralela":
      return { requisitos: { n_itens: { min: 2, max: 9 } }, imagens: { min: 2 } }
    case "vitrine_narrada":
      return { requisitos: { n_itens: { min: 2, max: 4 } }, imagens: { min: 2 } }
    case "produto_unico_aprofundado":
      return { requisitos: { cta: true, n_itens: { max: 1 } }, imagens: { min: 1 } }
    case "galeria_de_angulos":
      // O mesmo produto de vários ângulos: exige acervo por ângulo.
      return { requisitos: { n_itens: { max: 2 } }, imagens: { min: 3 } }
    case "lineup_de_colecao":
      return { requisitos: { cta: true, n_itens: { min: 3 } } }
    case "catalogo_por_ocasiao":
      return { requisitos: { n_itens: { min: 2, max: 6 } }, imagens: { min: 2 } }
    case "escassez_por_estoque":
      return { requisitos: { n_itens: { min: 3 } } }
    case "carrinho_dinamico":
      return { requisitos: { cta: true } }

    // ── Prova social e fechamento ─────────────────────────────────────
    case "prova_por_autoridade":
      return { requisitos: { n_itens: { max: 3 } }, credencial: true }
    case "prova_por_relato":
      // Credencial é CARGO, não carimbo de verificado. Confundir os dois faz
      // o protocolo escolher esta peça quando a objeção pede autoridade
      // técnica — foi o caso da review 10, cadastrada como "com credencial".
      return { requisitos: { n_itens: { max: 2 } }, credencial: false }
    case "prova_por_volume":
      return { requisitos: { n_itens: { min: 3 } }, credencial: false }
    case "prova_com_vitrine":
      // Prova que também mostra produto — é por isso que não convive com
      // grade de produtos na mesma peça.
      return { requisitos: { n_itens: { min: 2 } }, imagens: { min: 2 } }
    case "menu_de_saida":
      return { requisitos: {}, links: { min: 4, max: 9 } }
    case "assinatura_minima":
      return { requisitos: {}, links: { max: 3 } }

    // ── Controle ──────────────────────────────────────────────────────
    case "nao_classificado":
      // Não se gera anatomia do que ninguém julgou, e não se cobra
      // contrato de quem não tem mecanismo declarado.
      return { requisitos: {} }
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
    avisos.push(`contrato ${input.dispositivo}: tem credencial (cargo/contexto do depoente) — o mecanismo é prova_por_autoridade`)
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
