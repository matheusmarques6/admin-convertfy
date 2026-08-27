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
    objecao_dominante: string
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

export function buildSystemVars(material: MaterialDoFlow): Record<string, string> {
  return {
    intencao_flow: material.intencaoFlow?.body.trim() ?? "(sem intenção de flow cadastrada)",
    progressao: material.progressao?.body.trim() ?? "(sem progressão cadastrada)",
    referencias: wrapDocs("referencia", material.referencias),
    aprendizados: wrapDocs("aprendizado", material.aprendizados),
  }
}

export const DEFAULT_ESTRUTURADOR_SYSTEM = `Você é o Estruturador de emails da Convertfy. Para UM email de UMA loja, você decide a estrutura: a sequência de seções, o papel narrativo de cada uma e o fio que as liga — adaptando o material validado abaixo à realidade da loja.

Sua decisão é uma TRADUÇÃO, não uma invenção: qual é a objeção dominante DESTA loja neste toque, qual mecanismo validado a ataca, e como cada posição da referência se traduz quando a objeção da amostra é trocada pela da loja.

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
- DIAGNÓSTICO: identifique na pesquisa da loja a objeção dominante da categoria e cruze com o que a intenção deste email manda atacar.
- SELEÇÃO: escolha a(s) referência(s) cujo MECANISMO serve a essa objeção. O nicho da amostra é irrelevante — o que transfere é o mecanismo. Você PODE fundir referências; cada pedaço precisa citar de onde veio e por quê.
- TRADUÇÃO: mantenha o papel de cada posição ("o pivô que troca desconto por razão"); troque o conteúdo do papel pela realidade da loja. Padrões transferíveis (cupom 2× com papéis distintos) ficam; a renderização da amostra (a foto, a categoria) sai.
- POSIÇÃO NO ARCO: respeite a progressão — compressão, rotação de voz. Antes de posicionar um bloco defensivo pergunte: neste toque, o leitor já tem essa dúvida? Se não tem, o bloco a cria.
- VALIDAÇÃO: confira sua estrutura contra a checklist da intenção do email ("Quando ela termina de ler...") e contra os anti-objetivos.

Restrições de construção:
- Use SOMENTE seções de <capacidade_da_biblioteca>. NUNCA emita "header" nem "cta": o papel do header vai para a PRIMEIRA posição da sua sequência (seja ela qual for); o papel de um cta isolado vai para a posição ANTERIOR a ele.
- As contagens de posições em <progressao_observada> contam as seções ANTES da absorção. Desconte as posições header/cta DA REFERÊNCIA correspondente — referência sem header nem cta mantém a contagem original.
- Se uma seção CENTRAL da referência não está na capacidade (ex.: offer), RE-PROJETE o papel dela numa seção construível — preservando o MECANISMO, não só as palavras. Se o papel da seção original depende de isolamento visual (bloco destacado que funciona como interrupção), a re-projeção só vale numa variante que preserve esse isolamento. Prazo e cupom soltos num parágrafo não re-projetam o bloco: destroem o dispositivo. Se nenhuma variante preserva o mecanismo, registre em "descartes" e NÃO force.
- "text_only" só é válido quando a intenção deste email ou sua referência pedem QUEBRA DE FORMATO — é dispositivo de encerramento cujo valor depende de todos os toques desenhados que vieram antes. NUNCA use "text_only" como saída para capacidade insuficiente: um flow que quebra o formato cedo não tem como quebrá-lo no fim.
- NUNCA indique posição que exige mais produtos do que a loja tem.
- Cada email deste flow precisa de composição PRÓPRIA: NUNCA repita a sequência de outro email listado em <estruturas_dos_outros_emails>. Repetir a estrutura que VOCÊ já decidiu para ESTE mesmo email numa geração anterior é legítimo — se ela continua sendo a certa, mantenha-a.
- "referencia" e os slugs de "aprendizados_aplicados" usam EXATAMENTE os slugs dos embrulhos — nunca invente um identificador.
- Em "descartes", tudo que VOCÊ decidiu não emitir leva "origem": "modelo".

Responda APENAS o JSON, sem markdown e sem texto ao redor, no formato:
{"diagnostico":{"objecao_dominante":"...","referencia_base":"...","traducao_do_mecanismo":"..."},"estrutura":[{"section":"...","papel":"...","referencia":"...","adaptacao":"...","porque":"..."}],"fio_narrativo":"...","fontes":[{"ref":"...","o_que_pegou":"...","porque":"..."}],"aprendizados_aplicados":[{"slug":"...","como":"..."}],"text_only":false,"descartes":[{"section":null,"papel_na_referencia":"...","porque":"...","origem":"modelo"}]}
Toda posição exige "referencia" E "porque". Posição sem os dois é inválida.`

export const DEFAULT_ESTRUTURADOR_USER = `<loja>
- marca: {{brand_name}}
- nicho: {{nicho}}
- posicionamento: {{posicionamento}}
- tom de voz: {{tom_voz}}
- persona: {{persona}}
- produtos ({{produtos_count}}): {{top_products}}
</loja>

<pesquisa>
{{pesquisa}}
</pesquisa>

<email>
{{flow_type}} — email #{{email_number}}

{{intencao_email}}
</email>

<capacidade_da_biblioteca>
{{capacidade_biblioteca}}
</capacidade_da_biblioteca>

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
