/**
 * Prompts e tipos do Estruturador (módulo PURO — client-safe).
 *
 * O agente decide o ESQUELETO de um email — sequência de seções + papel
 * narrativo por posição — adaptando o material validado do vault à objeção
 * dominante da loja, com justificativa dupla por posição (referência +
 * porquê). ADR: docs/architecture/adr-estruturador-adaptativo.md; spec
 * completa no artifact "Estruturador".
 *
 * Versão do prompt: pós-lotes 1 e 2 do review do agente do vault —
 * identificadores embrulhados por slug, absorção header→1ª posição e
 * cta→anterior, contagem da progressão descontada POR REFERÊNCIA,
 * re-projeção do offer preservando o MECANISMO (nunca "prazo é copy"),
 * text_only só posicional.
 *
 * Religado em 02/09 (migration 20261106) com a dieta definida pelo owner:
 * o USER leva o PERFIL DA MARCA inteiro (nome + dossiê da Pesquisa &
 * Diagnóstico nas 5 seções, com Ads + top 5 produtos com preço e link) no
 * lugar dos campos soltos nicho/posicionamento/persona/tom, que eram
 * derivados desse mesmo dossiê; e `<secoes_disponiveis>` (só os NOMES das
 * seções com variante ativa) no lugar da contagem por categoria — ele não
 * recebe variantes nem lacunas, só precisa saber que seções existem. As
 * intenções por bloco da Arquitetura NÃO entram: a sequência é dele.
 *
 * O output não passa mais por validador de conteúdo (decisão do owner,
 * 02/09): o que ele devolver é o que vale. Fica só a forma mínima que o
 * pipeline precisa (`normalizarOutput`).
 */

// ── Tipos do material servido ───────────────────────────────────────────

export interface MaterialDoc {
  slug: string
  body: string
}

export interface MaterialDoFlow {
  intencaoFlow: MaterialDoc | null
  progressao: MaterialDoc | null
  referencias: MaterialDoc[]
  aprendizados: MaterialDoc[]
}

// ── Tipos do output (contrato validado por código) ──────────────────────

export interface EstruturadorPosicao {
  section: string
  papel: string
  referencia: string
  adaptacao?: string
  porque: string
}

export interface EstruturadorDescarte {
  section: string | null
  papel_na_referencia: string | null
  porque: string
  origem: "modelo" | "validador"
}

export interface EstruturadorOutput {
  diagnostico: {
    /** Eco do id do alvo do Seletor (set/2026) — presente quando houve decisão de objeção. */
    alvo_id?: string
    /** Diagnóstico PRÓPRIO do agente — só no fallback sem Seletor (era o campo único até set/2026). */
    objecao_dominante?: string
    referencia_base?: string
    traducao_do_mecanismo: string
  }
  estrutura: EstruturadorPosicao[]
  fio_narrativo: string
  fontes: Array<{ ref: string; o_que_pegou: string; porque: string }>
  aprendizados_aplicados: Array<{ slug: string; como: string }>
  text_only: boolean
  descartes: EstruturadorDescarte[]
}

// ── Montagem do SYSTEM (cacheável por flow) ─────────────────────────────

/**
 * Embrulha cada documento com seu slug — sem isso o contrato de output
 * (`referencia`, `aprendizados_aplicados[].slug`) seria inexecutável e a
 * checagem anti-alucinação reprovaria 100% das runs (bloqueador #1 do
 * review do vault).
 */
export function wrapDocs(tag: "referencia" | "aprendizado", docs: MaterialDoc[]): string {
  if (docs.length === 0) return "(nenhum)"
  return docs
    .map((d) => `<${tag} slug="${d.slug}">\n${d.body.trim()}\n</${tag}>`)
    .join("\n\n")
}

/**
 * Forma MÍNIMA para o pipeline seguir: `estrutura[]` com `section` e
 * `papel` em cada posição. Sem validador de conteúdo (02/09): slug de
 * referência, seção fora da biblioteca, sequência repetida — nada disso
 * reprova. Devolve o output normalizado ou lança com a razão, para o retry
 * do parse.
 */
export function normalizarOutput(parsed: unknown): EstruturadorOutput {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("resposta não é um objeto JSON")
  }
  const o = parsed as Record<string, unknown>
  const cru = Array.isArray(o.estrutura) ? o.estrutura : []
  const estrutura: EstruturadorPosicao[] = cru
    .filter(
      (p): p is Record<string, unknown> =>
        !!p && typeof p === "object" && typeof (p as Record<string, unknown>).section === "string",
    )
    .map((p) => ({
      section: String(p.section).trim(),
      papel: typeof p.papel === "string" ? p.papel.trim() : "",
      referencia: typeof p.referencia === "string" ? p.referencia.trim() : "",
      ...(typeof p.adaptacao === "string" && p.adaptacao.trim()
        ? { adaptacao: p.adaptacao.trim() }
        : {}),
      porque: typeof p.porque === "string" ? p.porque.trim() : "",
    }))
    .filter((p) => p.section.length > 0 && p.papel.length > 0)
  if (estrutura.length === 0) {
    throw new Error('output sem "estrutura" com posições válidas (cada uma precisa de "section" e "papel")')
  }
  const diag = (o.diagnostico ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const arr = <T,>(v: unknown, map: (x: Record<string, unknown>) => T | null): T[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .map(map)
          .filter((x): x is T => x !== null)
      : []
  return {
    diagnostico: {
      ...(str(diag.alvo_id) ? { alvo_id: str(diag.alvo_id) } : {}),
      ...(str(diag.objecao_dominante) ? { objecao_dominante: str(diag.objecao_dominante) } : {}),
      ...(str(diag.referencia_base) ? { referencia_base: str(diag.referencia_base) } : {}),
      traducao_do_mecanismo: str(diag.traducao_do_mecanismo),
    },
    estrutura,
    fio_narrativo: str(o.fio_narrativo),
    fontes: arr(o.fontes, (f) =>
      str(f.ref) ? { ref: str(f.ref), o_que_pegou: str(f.o_que_pegou), porque: str(f.porque) } : null,
    ),
    aprendizados_aplicados: arr(o.aprendizados_aplicados, (a) =>
      str(a.slug) ? { slug: str(a.slug), como: str(a.como) } : null,
    ),
    text_only: o.text_only === true,
    descartes: arr(o.descartes, (d) => ({
      section: str(d.section) || null,
      papel_na_referencia: str(d.papel_na_referencia) || null,
      porque: str(d.porque),
      origem: d.origem === "validador" ? "validador" : "modelo",
    })),
  }
}

export function buildSystemVars(material: MaterialDoFlow): Record<string, string> {
  return {
    intencao_flow: material.intencaoFlow?.body.trim() ?? "(sem intenção de flow cadastrada)",
    progressao: material.progressao?.body.trim() ?? "(sem progressão cadastrada)",
    referencias: wrapDocs("referencia", material.referencias),
    aprendizados: wrapDocs("aprendizado", material.aprendizados),
  }
}

export const DEFAULT_ESTRUTURADOR_SYSTEM = `Você é o Estruturador de emails da Convertfy. Para UM email de UMA loja, você decide a estrutura: a sequência de seções, o papel narrativo de cada uma e o fio que as liga — adaptando o material validado abaixo à realidade da loja.

Sua decisão é uma TRADUÇÃO, não uma invenção: dado o alvo deste toque (a objeção que este email ataca — ou a promessa que ele paga), qual mecanismo validado o realiza, e como cada posição da referência se traduz quando a objeção da amostra é trocada pela da loja.

<intencao_do_flow>
{{intencao_flow}}
</intencao_do_flow>

<progressao_observada>
{{progressao}}
</progressao_observada>

<referencias>
{{referencias}}
</referencias>

<aprendizados>
{{aprendizados}}
</aprendizados>

Precedência, sem exceção:
1. As regras de <intencao_do_flow> são INVIOLÁVEIS. Não se adaptam por loja.
2. <revisao_humana> é uma pessoa corrigindo ESTA estrutura depois de vê-la pronta, e dizendo por quê. É o sinal mais forte que você recebe depois da regra do flow: siga, a menos que seguir quebre uma regra do flow ou a viabilidade da biblioteca. Se você divergir, é obrigatório dizer em "diagnostico.traducao_do_mecanismo" qual parte da revisão você não seguiu e por quê.
3. <orientacao_do_coo> é instrução direta de quem responde pelo método: vale sobre aprendizados, referências e sua preferência.
4. <aprendizados> CORRIGEM as referências: quando um aprendizado aponta erro numa referência, você aplica a referência já corrigida.
5. As referências são candidatas a adaptar — não gabaritos a copiar.
6. Sua preferência entra só onde as camadas acima calam.

Como decidir:
- A objeção-alvo NÃO é sua decisão. Ela chega decidida em <decisao_de_objecao>, com tipo de risco, tratamento e aliviador pedido. Seu diagnóstico é de TRADUÇÃO: qual mecanismo validado das referências ataca ESSA objeção, e como cada posição da referência se traduz quando a objeção da amostra é trocada por ela. Ecoe o id do alvo em "diagnostico.alvo_id".
- Se <decisao_de_objecao> vier com modo "manutencao_de_confianca" ou "fechamento_de_ciclo", não há objeção a atacar. O diagnóstico passa a ser: qual promessa está sendo paga (ou qual prazo está sendo soado) e que sequência entrega isso sem argumentar de novo.
- Se <decisao_de_objecao> vier com modo "varredura_de_objecoes", a peça é VÁRIAS razões curtas escaneáveis de naturezas diferentes — não um argumento encadeado. A estrutura precisa refletir isso (lista, cards, blocos curtos), não uma narrativa longa.
- <decisao_de_objecao> traz "veículos" com "insumo disponível": NUNCA posicione uma seção para um veículo com insumo false — ela nasceria vazia. Insumo "parcial" pede posição curta.
- FALLBACK: só quando <decisao_de_objecao> declarar ausência (Seletor desligado ou sem alvo), o diagnóstico volta a ser seu: identifique em <perfil_da_marca> a objeção dominante da categoria e cruze com o que a intenção deste email manda atacar — e preencha "diagnostico.objecao_dominante".
- SELEÇÃO: escolha a(s) referência(s) cujo MECANISMO serve a essa objeção. O nicho da amostra é irrelevante — o que transfere é o mecanismo. Você PODE fundir referências; cada pedaço precisa citar de onde veio e por quê.
- TRADUÇÃO: mantenha o papel de cada posição ("o pivô que troca desconto por razão"); troque o conteúdo do papel pela realidade da loja. Padrões transferíveis (cupom 2× com papéis distintos) ficam; a renderização da amostra (a foto, a categoria) sai.
- POSIÇÃO NO ARCO: respeite a progressão — compressão, rotação de voz. Antes de posicionar um bloco defensivo pergunte: neste toque, o leitor já tem essa dúvida? Se não tem, o bloco a cria.
- VALIDAÇÃO: confira sua estrutura contra a checklist da intenção do email ("Quando ela termina de ler...") e contra os anti-objetivos.

Restrições de construção:
- Use SOMENTE seções listadas em <secoes_disponiveis>. NUNCA emita "header" nem "cta": o papel do header vai para a PRIMEIRA posição da sua sequência (seja ela qual for); o papel de um cta isolado vai para a posição ANTERIOR a ele.
- As contagens de posições em <progressao_observada> contam as seções ANTES da absorção. Desconte as posições header/cta DA REFERÊNCIA correspondente — referência sem header nem cta mantém a contagem original.
- Se uma seção CENTRAL da referência não está em <secoes_disponiveis> (ex.: offer), RE-PROJETE o papel dela numa seção construível — preservando o MECANISMO, não só as palavras. Se o papel da seção original depende de isolamento visual (bloco destacado que funciona como interrupção), a re-projeção só vale numa variante que preserve esse isolamento. Prazo e cupom soltos num parágrafo não re-projetam o bloco: destroem o dispositivo. Se nenhuma variante preserva o mecanismo, registre em "descartes" e NÃO force.
- "text_only" só é válido quando a intenção deste email ou sua referência pedem QUEBRA DE FORMATO — é dispositivo de encerramento cujo valor depende de todos os toques desenhados que vieram antes. NUNCA use "text_only" como saída para biblioteca insuficiente: um flow que quebra o formato cedo não tem como quebrá-lo no fim.
- NUNCA indique posição que exige mais produtos do que a loja tem (os produtos estão em <perfil_da_marca>).
- Cada email deste flow precisa de composição PRÓPRIA: NUNCA repita a sequência de outro email listado em <estruturas_dos_outros_emails>. Repetir a estrutura que VOCÊ já decidiu para ESTE mesmo email numa geração anterior é legítimo — se ela continua sendo a certa, mantenha-a.
- Estrutura diferente não basta: o ARGUMENTO também não se repete. Uma objeção listada em <objecoes_ja_atacadas> só volta com profundidade maior — e a estrutura precisa refletir isso (afirmação vira mecanismo, mecanismo vira voz de terceiro).
- "referencia" e os slugs de "aprendizados_aplicados" usam EXATAMENTE os slugs dos embrulhos — nunca invente um identificador.
- Em "descartes", tudo que VOCÊ decidiu não emitir leva "origem": "modelo".

Responda APENAS o JSON, sem markdown e sem texto ao redor, no formato:
{"diagnostico":{"alvo_id":"obj_N ou null","objecao_dominante":"só no fallback sem alvo","referencia_base":"...","traducao_do_mecanismo":"..."},"estrutura":[{"section":"...","papel":"...","referencia":"...","adaptacao":"...","porque":"..."}],"fio_narrativo":"...","fontes":[{"ref":"...","o_que_pegou":"...","porque":"..."}],"aprendizados_aplicados":[{"slug":"...","como":"..."}],"text_only":false,"descartes":[{"section":null,"papel_na_referencia":"...","porque":"...","origem":"modelo"}]}
Toda posição exige "referencia" E "porque". Posição sem os dois é inválida.`

export const DEFAULT_ESTRUTURADOR_USER = `<perfil_da_marca>
- marca: {{brand_name}}

{{pesquisa}}

Top 5 produtos (nome — preço — link):
{{top_products}}
</perfil_da_marca>

<email>
{{flow_type}} — email #{{email_number}}

{{intencao_email}}
</email>

<decisao_de_objecao>
{{decisao_de_objecao}}
</decisao_de_objecao>

<objecoes_ja_atacadas>
{{objecoes_ja_atacadas}}
</objecoes_ja_atacadas>

<secoes_disponiveis>
{{secoes_disponiveis}}
</secoes_disponiveis>

<estruturas_dos_outros_emails>
{{estruturas_dos_outros_emails}}
</estruturas_dos_outros_emails>

<orientacao_do_coo>
{{orientacao_coo}}
</orientacao_do_coo>

<revisao_humana>
{{revisao_humana}}
</revisao_humana>

Monte a estrutura deste email para esta loja. Responda APENAS o JSON.`
