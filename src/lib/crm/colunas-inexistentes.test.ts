/**
 * Coluna que não existe no schema não pode ser pedida.
 *
 * O supabase-js devolve o erro do Postgres em `error`, não como throw.
 * Quem desestrutura só `{ data }` transforma um 42703 em `null` e o
 * anuncia como "não encontrado" — e o sintoma aponta para o lugar
 * errado: em 17/09 o kanban inteiro passou a responder
 * "Deal nao encontrado" em todo arrasto porque um select pediu
 * `deals.org_id`, e o mesmo defeito já matava em silêncio o botão de
 * automação do Instagram ("Pipeline não encontrada").
 *
 * As colunas abaixo NÃO existem — medido em produção em 18/09
 * (`information_schema.columns`). A org de um negócio se DERIVA dos
 * vínculos; ver `lib/crm/org-do-negocio.ts`.
 *
 * `form_sessions.hidden_fields` é o caso irmão, e mais traiçoeiro
 * porque o nome EXISTE no projeto querendo dizer outra coisa: no schema
 * do formulário `hidden_fields` é a lista de NOMES aceitos pela URL; na
 * sessão, o que foi recebido mora em `hidden`. Pedir um pelo outro fez
 * o agendamento público recusar toda sessão como inválida.
 */

import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const RAIZ = join(process.cwd(), "src")

/** tabela → colunas que ela não tem (e que já foram pedidas por engano). */
const NAO_EXISTEM: Record<string, string[]> = {
  deals: ["org_id"],
  pipelines: ["org_id"],
  pipeline_stages: ["org_id"],
  crm_partners: ["org_id"],
  form_sessions: ["hidden_fields"],
  // Varredura de 18/09: os selects de TODO o `src/` foram conferidos
  // contra `information_schema`. Estas são as colunas que existiam só no
  // código — cada uma derrubava o select inteiro e virava tela vazia.
  org_members: ["user_id"],
  profiles: ["org_id", "full_name"],
  clients: ["account_manager_id"],
  organizations: ["logo_url", "primary_color"],
  crm_threads: ["metadata"],
  crm_deal_history: ["created_at"],
  store_revenue_summary: ["total_campaigns", "total_flows"],
  client_stores: ["plan", "mrr_value"],
  operational_pipeline_columns: ["responsible_role", "sla_days"],
  // FORA da lista de propósito: `user_google_tokens.selected_calendar_id`
  // e `auto_meet` também não existem, mas ali o defeito é o inverso — a
  // tela de configuração do Google Calendar (GET/PUT de
  // `/api/integrations/google/calendar/settings`) escreve nas duas, e o
  // sync as lê com fail-open. O conserto é a migration que as cria, não
  // arrancar a funcionalidade; até ela rodar, o calendário é sempre o
  // "primary" com Meet ligado. Ver docs/forms/funil-aplicacao.md.
}

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === "node_modules" || nome === "__tests__") continue
      arquivos(caminho, achados)
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      achados.push(caminho)
    }
  }
  return achados
}

function semComentarios(fonte: string): string {
  // A varredura mede CÓDIGO. Um comentário que nomeia a coluna para
  // explicar por que ela não é pedida — como os que este teste levou
  // alguém a escrever — não é o defeito.
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
}

/**
 * O encadeamento que começa em `.from("<tabela>")` — e só ele. Recortar
 * "até o próximo `.from(`" pareceria mais simples e acusaria qualquer
 * `org_id` de outra tabela escrito depois na mesma função: cinco falsos
 * positivos nas rotas reais, que é como um teste destes vira ruído e
 * acaba desligado.
 *
 * Percorre contando profundidade de `()`/`{}`/`[]` e pulando strings; o
 * encadeamento acaba quando a profundidade volta a zero e o próximo
 * caractere com significado não é um ponto.
 */
function encadeamento(fonte: string, inicio: number): string {
  let i = inicio
  let nivel = 0
  // Logo depois de `.from("x")` o que pode vir é o `.` do método
  // seguinte. Sem este estado o percurso para na primeira letra de
  // `.select` — o caso de auto-verificação lá embaixo pegou isso.
  let esperandoPonto = true

  while (i < fonte.length) {
    const c = fonte[i]

    if (c === '"' || c === "'" || c === "`") {
      const aspa = c
      i++
      while (i < fonte.length && fonte[i] !== aspa) {
        if (fonte[i] === "\\") i++
        i++
      }
      i++
      continue
    }

    if (nivel > 0) {
      if (c === "(" || c === "{" || c === "[" || c === "<") nivel++
      else if (c === ")" || c === "}" || c === "]" || c === ">") {
        nivel--
        if (nivel === 0) esperandoPonto = true
      }
      i++
      continue
    }

    if (/\s/.test(c)) {
      i++
      continue
    }

    if (esperandoPonto) {
      if (c !== ".") break
      esperandoPonto = false
      i++
      continue
    }

    // Nome do método; `<` abre os genéricos de `.maybeSingle<T>()`.
    if (/[A-Za-z0-9_$]/.test(c)) {
      i++
      continue
    }
    if (c === "(" || c === "<") {
      nivel++
      i++
      continue
    }
    break
  }
  return fonte.slice(inicio, i)
}

function trechosDaTabela(fonteBruta: string, tabela: string): string[] {
  const fonte = semComentarios(fonteBruta)
  const abre = new RegExp(`\\.from\\(\\s*["'\`]${tabela}["'\`]\\s*\\)`, "g")
  const trechos: string[] = []
  for (const m of fonte.matchAll(abre)) {
    trechos.push(encadeamento(fonte, m.index! + m[0].length))
  }
  return trechos
}

describe("colunas que o schema não tem", () => {
  const fontes = arquivos(RAIZ).map((caminho) => ({
    caminho: caminho.slice(process.cwd().length + 1),
    texto: readFileSync(caminho, "utf8"),
  }))

  it("encontra arquivos para varrer", () => {
    expect(fontes.length).toBeGreaterThan(500)
  })

  for (const [tabela, colunas] of Object.entries(NAO_EXISTEM)) {
    for (const coluna of colunas) {
      it(`nenhum acesso a "${tabela}" pede ${coluna}`, () => {
        const ofensores: string[] = []
        for (const { caminho, texto } of fontes) {
          for (const trecho of trechosDaTabela(texto, tabela)) {
            // A coluna dentro de um join embutido é de OUTRA tabela:
            // `store:client_stores!inner (id, org_id, …)` é legítimo, e
            // o `!inner`/`!fk` faz parte da sintaxe do PostgREST.
            const semJoins = trecho.replace(
              /\w+\s*:\s*\w+(?:![\w.]+)?\s*\(([^()]|\([^()]*\))*\)/g,
              "",
            )
            // `.eq("store.org_id", …)` também é do join — coluna
            // qualificada por relação não é da tabela base.
            if (new RegExp(`(?<![\\w.])${coluna}\\b`).test(semJoins)) {
              ofensores.push(caminho)
            }
          }
        }
        expect([...new Set(ofensores)]).toEqual([])
      })
    }
  }

  it("a varredura acha o defeito quando ele existe", () => {
    // Sem este caso, um recorte quebrado passaria em tudo por não achar
    // nada — e o teste inteiro viraria enfeite.
    const falso = `await admin.from("deals").select("id, org_id").eq("id", x)`
    expect(trechosDaTabela(falso, "deals").join()).toContain("org_id")

    // E para no fim do encadeamento: `org_id` de outra tabela, escrito
    // depois na mesma função, não é deste acesso.
    const outro = [
      `const a = await admin.from("deals").select("id").eq("id", x)`,
      `const b = await admin.from("clients").select("org_id")`,
    ].join("\n")
    expect(trechosDaTabela(outro, "deals").join()).not.toContain("org_id")
  })

  it("o join legítimo é ignorado sem engolir a coluna pedida ao lado", () => {
    // As duas formas convivem numa query real. Se a exclusão do join
    // apagasse o trecho inteiro, a varredura passaria em tudo.
    const soJoin = `.select("id, store:client_stores!inner (id, org_id)")`
    const comAmbas = `.select("id, org_id, store:client_stores!inner (id, org_id)")`
    const limpa = (t: string) =>
      t.replace(/\w+\s*:\s*\w+(?:![\w.]+)?\s*\(([^()]|\([^()]*\))*\)/g, "")
    const pede = (t: string) => /(?<![\w.])org_id\b/.test(limpa(t))

    expect(pede(soJoin)).toBe(false)
    expect(pede(comAmbas)).toBe(true)
    expect(pede(`.eq("store.org_id", orgId)`)).toBe(false)
    expect(pede(`.eq("org_id", orgId)`)).toBe(true)
  })
})
