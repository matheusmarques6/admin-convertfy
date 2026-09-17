/**
 * Publicar uma versão: os campos de hoje, a lógica de antes.
 *
 * O editor mexe em `crm_form_fields`; o formulário público lê
 * `form_versions.schema`. Sem este passo, editar uma pergunta na tela
 * **não muda nada** para quem responde — que é pior que não ter editor,
 * porque o operador salva, vê "salvo" e o formulário continua igual.
 *
 * A parte difícil não é montar o schema: é **não perder a lógica**. Ela
 * vive só na versão publicada (a tabela de campos não tem onde guardá-la),
 * então republicar ingenuamente apagaria os saltos, os finais e a tela de
 * abertura. Aqui a lógica é transportada da versão anterior, casada por
 * `ref` — e como o PATCH preserva os ids dos campos, ela sobrevive a
 * renomear pergunta, trocar placeholder e reordenar.
 *
 * O que NÃO sobrevive, de propósito: regra que aponta para um campo
 * apagado. Mantê-la produziria `destino_inexistente` em produção, com a
 * pessoa presa numa tela morta; descartá-la faz o bloco seguir para o
 * próximo na ordem, que é o comportamento sem lógica.
 */

import type { FormBlock, FormSchema, LogicRule } from "@/types/forms-conversational"
import { normalizarSchema, schemaDeCampos, type CampoLegado } from "./schema"

export interface ResultadoDaPublicacao {
  schema: FormSchema
  /** Refs cujas regras foram descartadas por apontar para campo apagado. */
  regras_descartadas: Array<{ ref: string; goto: string }>
  /** Finais que nenhuma regra alcança mais — vira aviso, não erro. */
  finais_orfaos: string[]
  /** Blocos novos (sem lógica ainda). */
  novos: string[]
}

const PREFIXO_ENDING = "ending:"

export function montarVersao(
  campos: CampoLegado[],
  anterior: unknown,
  opts: { display_mode: "classic" | "conversational"; locale?: string; version: number },
): ResultadoDaPublicacao {
  const base = schemaDeCampos(campos, {
    display_mode: opts.display_mode,
    locale: opts.locale ?? "pt-BR",
    version: opts.version,
  })
  const velho = normalizarSchema(anterior)

  const refsAtuais = new Set(base.blocks.map((b) => b.ref))
  const refsEndings = new Set((velho.endings ?? []).map((e) => e.ref))
  const porRef = new Map(velho.blocks.map((b) => [b.ref, b]))

  const descartadas: Array<{ ref: string; goto: string }> = []
  const novos: string[] = []

  const blocks: FormBlock[] = base.blocks.map((b) => {
    const antigo = porRef.get(b.ref)
    if (!antigo) {
      novos.push(b.ref)
      return b
    }

    const regras = (antigo.logic ?? []).filter((r) => alvoExiste(r, refsAtuais, refsEndings))
    for (const r of antigo.logic ?? []) {
      if (!alvoExiste(r, refsAtuais, refsEndings)) descartadas.push({ ref: b.ref, goto: r.goto })
    }

    // A condição também pode citar um campo apagado. Descartar a condição
    // sozinha mudaria o SENTIDO da regra (um `and` de duas viraria de uma);
    // por isso a regra inteira cai quando qualquer condição perdeu o alvo.
    const vivas = regras.filter((r) =>
      (r.conditions ?? []).every((c) => refsAtuais.has(c.ref) || !porRef.has(c.ref)),
    )
    for (const r of regras) {
      if (!vivas.includes(r)) descartadas.push({ ref: b.ref, goto: r.goto })
    }

    return {
      ...b,
      // O alias é do EDITOR de schema, não da tabela de campos: se não
      // viesse daqui, todo `{{nome}}` do formulário quebraria ao publicar.
      ...(antigo.alias ? { alias: antigo.alias } : {}),
      // O agrupamento também só existe no schema — `crm_form_fields` não
      // tem coluna para ele. Publicar sem transportá-lo desmancharia a
      // tela de contato em quatro telas, e ninguém saberia que o clique
      // em Publicar foi o que fez isso.
      ...(antigo.mesma_tela ? { mesma_tela: true } : {}),
      ...(antigo.titulo_da_tela ? { titulo_da_tela: antigo.titulo_da_tela } : {}),
      ...(vivas.length > 0 ? { logic: vivas } : {}),
    }
  })

  const alcancados = new Set<string>()
  for (const b of blocks) {
    for (const r of b.logic ?? []) {
      if (r.goto.startsWith(PREFIXO_ENDING)) alcancados.add(r.goto.slice(PREFIXO_ENDING.length))
    }
  }
  // O primeiro final é o desfecho padrão de quem chega ao fim da ordem:
  // ele nunca é órfão, mesmo sem nenhuma regra apontando para ele.
  const padrao = (velho.endings ?? [])[0]?.ref
  const finais_orfaos = (velho.endings ?? [])
    .map((e) => e.ref)
    .filter((ref) => ref !== padrao && !alcancados.has(ref))

  return {
    schema: {
      ...base,
      blocks,
      endings: velho.endings ?? [],
      hidden_fields: velho.hidden_fields ?? [],
      settings: { ...base.settings, ...velho.settings },
    },
    regras_descartadas: descartadas,
    finais_orfaos,
    novos,
  }
}

function alvoExiste(r: LogicRule, refs: Set<string>, endings: Set<string>): boolean {
  if (r.goto.startsWith(PREFIXO_ENDING)) {
    const ref = r.goto.slice(PREFIXO_ENDING.length)
    // `ending:` sem ref nomeado é "termine aqui", sempre válido.
    return ref === "" || endings.has(ref)
  }
  return refs.has(r.goto)
}
