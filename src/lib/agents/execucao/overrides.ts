/**
 * overrides — o que uma execução MANUAL pode mudar no pipeline, e o que
 * ela não pode.
 *
 * É o equivalente do "deactivate node" + "pin data" + "execute step" do
 * n8n, com duas diferenças que vêm da natureza deste pipeline:
 *
 *  1. **A linha manual × produção é dura.** No n8n produção ignora todo
 *     dado pinado. Aqui vale a mesma regra, e ela não é preciosismo: um pin
 *     esquecido numa execução de produção manda ao cliente um e-mail com a
 *     copy congelada de outro e-mail. `gateFor` recebe o modo e devolve
 *     gate NEUTRO em produção, sempre.
 *  2. **Re-rodar os anteriores é caro.** No n8n o "Execute step" re-executa
 *     os nós de trás e ninguém sente; aqui a fase 1 leva ~220s e uma
 *     execução completa custou $0,769 medidos. Por isso o pin não é
 *     conveniência: sem ele, "testar até onde eu quiser" é impagável.
 *
 * ── O que "pin" significa nesta v1 ────────────────────────────────────
 *
 * Pin = **"não execute este nó; a saída que já está gravada vale"**. Para a
 * fase 1 isso é o artefato persistido (`store_email_references`,
 * `store_email_blueprints`, `store_email_objection_targets`); para a copy é
 * o que está em `email_blocks`; para os steps de HTML é o HTML daquele
 * estágio. Repor o `parsed_output` de uma run ARBITRÁRIA (o "edit output
 * data" do n8n) ficou fora: exigiria escrever de volta nos artefatos, e
 * escrever artefato a partir de run velha é como se inventa divergência
 * entre o que a tela mostra e o que o pipeline leu.
 *
 * A consequência boa é que pin e "desativar" convergem no MECANISMO (nenhum
 * dos dois executa o nó) e divergem na INTENÇÃO — e é a intenção que a
 * régua de degradação lê: desativar o Curador é uma lacuna; pinar o Curador
 * é dizer "a referência gravada serve".
 *
 * Módulo PURO e client-safe: a tela usa a mesma régua para desabilitar o
 * botão e explicar o motivo ANTES de gastar, e o runner usa para valer.
 */

import { MAIN_ORDER, STUDIO_NODE_BY_KEY } from "@/lib/agents/studio-graph"

export type ExecutionMode = "manual" | "producao"

/** Só "reusar" na v1 — ver o cabeçalho. */
export type PinKind = "reusar"

export interface PinRef {
  kind: PinKind
}

export interface ExecutionOverrides {
  /** Nós que NÃO devem executar (o "deactivate node"). */
  disabled?: string[]
  /** Nós cuja saída gravada vale (o "pin data"). */
  pinned?: Record<string, PinRef>
  /** Para a execução DEPOIS deste nó, deixando-a pausada. */
  stop_after?: string | null
  /**
   * Retoma a partir deste nó. Só steps de HTML: é traduzido para
   * `email_flow_emails.html_pipeline_stage`, que é o mecanismo de resume
   * que a cadeia de formatação já tem.
   */
  start_from?: string | null
}

// ── A régua de degradação ──────────────────────────────────────────────
//
// "Desativar todos os nós, com aviso" (decisão 08/09) só é honesto se o
// aviso for específico. Genérico ele mente por omissão: desativar a
// Tipografia é inofensivo, desativar o Curador mata a peça — e mata TARDE,
// depois de a fase 1 inteira ter sido paga.

export type Degradacao =
  /** O step seguinte usa a entrada dele. É o que o `resolveAgentSwitch` já faz. */
  | "passa_adiante"
  /** A execução segue, com menos. O que se perde está no motivo. */
  | "roda_degradado"
  /** Sem insumo não há execução. Recusar ANTES de gastar. */
  | "recusa"

export interface NodeDegradacao {
  kind: Degradacao
  motivo: string
}

/**
 * O que acontece com a execução quando o nó é desativado SEM pin.
 *
 * As três `recusa` são a lição do incidente 07/09: a premissa "cai no
 * template global, que TEM hero" é falsa — o global do welcome-1 tem 21.314
 * chars, zero placeholders e nenhum marcador `cfy:hero`, então
 * `locateHeroRegion` não acha região e a peça morre em `hero_failed` de
 * qualquer jeito. Deixar rodar para descobrir custa a fase 1 inteira e
 * termina no mesmo lugar.
 */
export const DEGRADACAO: Record<string, NodeDegradacao> = {
  seletor: {
    kind: "roda_degradado",
    motivo:
      "sem alvo de objeção, Estruturador e Curador recebem ausência declarada e voltam ao comportamento anterior",
  },
  estruturador: {
    kind: "roda_degradado",
    motivo: "a sequência de seções volta a ser a da aba Arquitetura",
  },
  assembler_chooser: {
    kind: "recusa",
    motivo:
      "sem Curador nenhuma variante é escolhida: a montagem não tem o que concatenar e a referência é apagada por cobertura insuficiente. Pine o Curador para reusar a referência gravada, ou reative-o",
  },
  assembler: {
    kind: "roda_degradado",
    motivo:
      "já é o padrão (montador_mode=off): o rank 1 do Curador vai direto para a montagem",
  },
  blueprint: {
    kind: "recusa",
    motivo:
      "sem blueprint a copy não tem contrato de campos (`fields[]`) e o merge não ancora nada — o e-mail sai com placeholder cru. Pine o Blueprint para reusar o gravado",
  },
  subject: {
    kind: "roda_degradado",
    motivo: "o assunto fica o do fallback, não o gerado para esta peça",
  },
  copy_dispatch: {
    kind: "recusa",
    motivo:
      "sem dispatch o n8n não recebe pedido de copy. Pine a Copy para reusar a que já está nos blocos",
  },
  copy: {
    kind: "recusa",
    motivo:
      "sem copy os placeholders chegam crus ao e-mail. Pine a Copy para reusar a que já está nos blocos",
  },
  copy_fit: {
    kind: "passa_adiante",
    motivo: "a copy segue sem encurtamento; campo longo pode estourar a caixa",
  },
  image: {
    kind: "roda_degradado",
    motivo: "nenhuma imagem é gerada; os slots de imagem ficam sem URL",
  },
  copy_merge: {
    kind: "roda_degradado",
    motivo:
      "o merge determinístico não roda e a Formatação de Texto assume o trabalho — mais caro e menos previsível",
  },
  hero_section: { kind: "passa_adiante", motivo: "a hero segue como a montagem a deixou" },
  text_format: { kind: "passa_adiante", motivo: "o texto segue como o merge o deixou" },
  image_format: { kind: "passa_adiante", motivo: "as imagens não são aplicadas no HTML" },
  typography: { kind: "passa_adiante", motivo: "a tipografia segue a das variantes" },
  color_format: { kind: "passa_adiante", motivo: "as cores seguem as das variantes" },
  background_fit: { kind: "passa_adiante", motivo: "faixa de fundo não é ajustada" },
  qa: { kind: "roda_degradado", motivo: "o e-mail sai sem o selo de qualidade" },
  qavision: { kind: "roda_degradado", motivo: "sem conferência visual da peça" },
}

/** Nós que aceitam override. `trigger` e `out` são sintéticos. */
export const NOS_COM_OVERRIDE: readonly string[] = MAIN_ORDER.filter(
  (k) => k !== "trigger" && k !== "out",
)

/**
 * Steps de HTML e o estágio que `html_pipeline_stage` guarda para retomar
 * ANTES deles. A coluna grava o último step CONCLUÍDO, então "retomar da
 * Tipografia" é gravar 'image' (o step anterior).
 *
 * `null` = começo da cadeia (nada concluído). Nó fora deste mapa não aceita
 * `start_from`: a fase 1 e a copy não têm ponto de retomada persistido —
 * quem cobre isso é o pin.
 */
export const ESTAGIO_ANTES: Record<string, "hero" | "text" | "image" | null> = {
  hero_section: null,
  text_format: "hero",
  image_format: "text",
  typography: "image",
  // Tipografia e Cores concluem DENTRO do estágio 'image' (a coluna só tem
  // três degraus), então retomar delas cai no mesmo ponto. Documentado em
  // vez de fingir granularidade que a coluna não tem.
  color_format: "image",
  background_fit: "image",
}

export interface Recusa {
  node: string
  motivo: string
}

const ordem = (node: string): number =>
  (MAIN_ORDER as readonly string[]).indexOf(node)

/** O nó existe no grafo do pipeline? */
export function nodeExiste(node: string): boolean {
  return node in STUDIO_NODE_BY_KEY
}

/**
 * O que impede esta execução de ser disparada.
 *
 * Lista vazia = pode ir. Rodar isto na TELA e no servidor é de propósito:
 * a tela explica antes de gastar, o servidor garante que ninguém contorna
 * pelo `curl`.
 */
export function validarOverrides(ov: ExecutionOverrides): Recusa[] {
  const out: Recusa[] = []
  const disabled = new Set(ov.disabled ?? [])
  const pinned = ov.pinned ?? {}

  for (const node of disabled) {
    if (!nodeExiste(node)) {
      out.push({ node, motivo: "nó inexistente no pipeline" })
      continue
    }
    if (!NOS_COM_OVERRIDE.includes(node)) {
      out.push({ node, motivo: "nó sintético (gatilho/saída) não aceita override" })
      continue
    }
    // Pin declara "a saída gravada serve" — é o que torna a lacuna
    // aceitável. Sem ele, a régua manda.
    if (pinned[node]) continue
    const d = DEGRADACAO[node]
    if (d?.kind === "recusa") out.push({ node, motivo: d.motivo })
  }

  for (const node of Object.keys(pinned)) {
    if (!nodeExiste(node)) {
      out.push({ node, motivo: "nó inexistente no pipeline" })
    } else if (!NOS_COM_OVERRIDE.includes(node)) {
      out.push({ node, motivo: "nó sintético (gatilho/saída) não aceita pin" })
    }
  }

  if (ov.stop_after) {
    if (!NOS_COM_OVERRIDE.includes(ov.stop_after)) {
      out.push({
        node: ov.stop_after,
        motivo: "não é um nó que possa encerrar a execução",
      })
    } else if (disabled.has(ov.stop_after) && !pinned[ov.stop_after]) {
      // Parar depois de um nó que não vai rodar é pedir para parar num
      // ponto que não existe nesta execução.
      out.push({
        node: ov.stop_after,
        motivo: "parar depois de um nó desativado — reative-o ou escolha outro ponto",
      })
    }
  }

  if (ov.start_from) {
    if (!(ov.start_from in ESTAGIO_ANTES)) {
      out.push({
        node: ov.start_from,
        motivo:
          "só os steps de HTML têm ponto de retomada persistido (hero, texto, imagens, tipografia, cores, fundo). Para começar antes disso, pine os nós anteriores",
      })
    } else if (
      ov.stop_after &&
      NOS_COM_OVERRIDE.includes(ov.stop_after) &&
      ordem(ov.stop_after) < ordem(ov.start_from)
    ) {
      out.push({
        node: ov.stop_after,
        motivo: "parar antes de começar: o ponto de parada vem antes do de retomada",
      })
    }
  }

  return out
}

export interface NodeGate {
  /** O nó não deve executar. */
  disabled: boolean
  /** Por que não — `null` quando vai rodar. */
  motivo: string | null
  /** A saída gravada vale (pin), em vez de lacuna. */
  pinned: boolean
}

const NEUTRO: NodeGate = { disabled: false, motivo: null, pinned: false }

/**
 * O gate de um nó nesta execução.
 *
 * **Produção devolve NEUTRO sempre**, e é aqui que a linha dura vive: nem
 * pin nem desativação por execução atravessam para o e-mail do cliente.
 * Vale para `overrides` gravado por engano, por corrida ou por um `curl`
 * que passou o `mode` errado — o gate não consulta intenção, consulta modo.
 */
export function gateFor(
  node: string,
  ov: ExecutionOverrides | null | undefined,
  mode: ExecutionMode,
): NodeGate {
  if (mode !== "manual" || !ov) return NEUTRO
  const pinned = Boolean(ov.pinned?.[node])
  if (pinned) {
    return {
      disabled: true,
      motivo: "pinado nesta execução — a saída gravada vale",
      pinned: true,
    }
  }
  if ((ov.disabled ?? []).includes(node)) {
    return {
      disabled: true,
      motivo: "desativado nesta execução",
      pinned: false,
    }
  }
  return NEUTRO
}

/** A execução termina DEPOIS deste nó? */
export function deveParar(
  node: string,
  ov: ExecutionOverrides | null | undefined,
  mode: ExecutionMode,
): boolean {
  if (mode !== "manual" || !ov?.stop_after) return false
  return ov.stop_after === node
}

/**
 * Overrides de "rodar SÓ este nó": tudo antes dele pinado, parada logo
 * depois.
 *
 * É o atalho que resolve o caso de 80% — "mexi no prompt da Tipografia e
 * quero ver" — e o que o n8n chama de "Execute step", com a diferença de
 * que aqui os anteriores NÃO re-executam (seria a fase 1 inteira de novo).
 *
 * `start_from` sai junto quando o nó tem ponto de retomada: sem ele a
 * cadeia de formatação recomeçaria da hero e reescreveria o HTML que se
 * quer preservar.
 */
export function overridesSoEsteNo(node: string): ExecutionOverrides {
  const i = ordem(node)
  const pinned: Record<string, PinRef> = {}
  for (const k of NOS_COM_OVERRIDE) {
    if (ordem(k) < i) pinned[k] = { kind: "reusar" }
  }
  const start = node in ESTAGIO_ANTES ? node : null
  return {
    pinned,
    stop_after: node,
    ...(start ? { start_from: start } : {}),
  }
}

/** Resumo legível dos overrides, para o log e para a tela. */
export function resumirOverrides(ov: ExecutionOverrides | null | undefined): string {
  if (!ov) return "sem overrides"
  const partes: string[] = []
  const d = ov.disabled ?? []
  const p = Object.keys(ov.pinned ?? {})
  if (d.length > 0) partes.push(`${d.length} desativado(s): ${d.join(", ")}`)
  if (p.length > 0) partes.push(`${p.length} pinado(s)`)
  if (ov.start_from) partes.push(`retoma de ${ov.start_from}`)
  if (ov.stop_after) partes.push(`para depois de ${ov.stop_after}`)
  return partes.length > 0 ? partes.join(" · ") : "sem overrides"
}
