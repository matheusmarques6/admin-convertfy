/**
 * Prompt do Gerador de Anatomias (Trilha B4) — puro.
 *
 * O agente escreve UMA variante nova da biblioteca: HTML de e-mail em 600px,
 * table-based, com tokens de identidade (B5) no lugar de hex/fonte fixos,
 * mais o `output_schema` que dá endereço a todo texto visível. O que ele
 * devolve passa pelo validador (`validar-anatomia.ts`) — lint de envio,
 * largura, tokens, cobertura schema × HTML, contrato do dispositivo — e só
 * entra na biblioteca desativada, para a curadoria aprovar.
 *
 * A saída é em DOIS blocos cercados (```json com os metadados, ```html com
 * o documento): HTML escapado dentro de JSON é onde o modelo mais erra.
 */

import { DESCRICAO_DO_DISPOSITIVO, type Dispositivo } from "../shared/dispositivos"
import { DESCRICAO_DO_TOKEN, TOKENS_DE_IDENTIDADE } from "../html/identity-tokens"
import type { SegmentOrigin } from "../shared/prompt-provenance"

export type DensidadeDaAnatomia = "minimal" | "balanced" | "rich"

/**
 * O que o validador vai cobrar de cada dispositivo — escrito para o modelo
 * NA MESMA régua (`contratoDoDispositivo` em validar-anatomia.ts). Chaves
 * do schema são o contrato: `product_N_*`, `review_N_*`, `feature_N_*`/
 * `seal_N_*`, `*_item_N`, `cta_*`, `*_price`, `*_coupon_code`, `review_N_role`.
 */
export const REQUISITOS_DO_DISPOSITIVO: Record<Dispositivo, string> = {
  oferta_em_manchete:
    "o percentual/valor é o MAIOR elemento: `discount_headline` em corpo enorme, linha de apoio `offer_support`, 1 CTA; cupom opcional (`coupon_code`).",
  campanha_nomeada:
    "o nome da data emoldura a oferta: `campaign_name` em selo ou faixa, `campaign_headline`, 1 CTA; imagem de campanha.",
  oferta_condicionada:
    "a mecânica é o conteúdo: `offer_headline` + `offer_condition` (combo, brinde, frete, valor mínimo) + 1 CTA; SEM chave de cupom.",
  oferta_adiada:
    "argumento primeiro: 2 a 3 parágrafos `reason_paragraph_N`, DEPOIS `coupon_code` e 1 CTA.",
  codigo_entregue:
    "entrega um código novo: `coupon_code` em texto real e destacado, `coupon_value` no CTA ou ao lado, `coupon_instruction` de onde aplicar, 1 CTA.",
  codigo_relembrado:
    "repete código já concedido: `reminder_headline` que pressupõe o toque anterior, `coupon_code`, `deadline` opcional, 1 CTA.",
  prazo_declarado:
    "o relógio é a peça: `deadline_headline` com data e HORA, `deadline_value` grande, 1 CTA.",
  tese_declarada:
    "título + 1 a 2 parágrafos (`paragraph_1`, `paragraph_2`) + 1 CTA; SEM grade de itens.",
  lista_enumerada:
    "3 a 5 itens com título PRÓPRIO: `item_N_title` + `item_N_text` (+ `item_N_image` opcional). Os títulos contam a história sozinhos.",
  mecanismo_apontado:
    "1 imagem central + 2 a 4 marcadores `marker_N_title`/`marker_N_text` apontando pontos DA FOTO.",
  antes_e_depois:
    "duas fotos do mesmo ângulo: `before_image`/`before_label` e `after_image`/`after_label`, mais `comparison_caption`.",
  comparacao_pareada:
    "nós × a categoria, lado a lado: `us_title`/`them_title` + 3 a 6 linhas `us_item_N`/`them_item_N`. Nunca contra um nome próprio.",
  duvida_antecipada:
    "3 a 5 perguntas `question_item_N` com `answer_item_N`, nomeando a trava antes que ela vire veto.",
  pergunta_ao_leitor:
    "headline é uma PERGUNTA dirigida (`headline_question`) + 1 CTA; SEM cupom.",
  cena_de_uso:
    "a cena é o argumento: 1 a 2 fotos de uso (`scene_image`, `scene_image_2`), `scene_headline`, `scene_text`, 1 CTA.",
  remocao_de_risco:
    "2 a 4 garantias `guarantee_N_label`/`guarantee_N_text` (cada uma com `guarantee_N_icon` image); SEM cupom.",
  oferta_de_ajuda:
    "dois caminhos de suporte em escada: `help_headline`, `help_primary_label`/`help_primary_url`, `help_secondary_label`/`help_secondary_url`; SEM oferta, SEM cupom.",
  moldura_de_genero:
    "a peça se disfarça de outro formato (janela de sistema, recibo, bilhete): `frame_title` e `frame_body` no vocabulário do formato imitado, 1 CTA.",
  abertura_editorial:
    "foto e frase: `editorial_headline`, `editorial_text` curto, 1 imagem grande, 1 CTA; SEM oferta e SEM cupom.",
  vitrine_paralela:
    "2 a 9 produtos EQUIVALENTES: `product_N_image`, `product_N_name`, `product_N_url`; sem descrição por item.",
  vitrine_narrada:
    "2 a 4 produtos, cada um com frase própria: `product_N_image`, `product_N_name`, `product_N_pitch`, `product_N_url`.",
  produto_unico_aprofundado:
    "UM produto explicado antes de precificado: `product_1_image`, `product_1_name`, 2 parágrafos `product_1_text_N`, `product_1_price` (+ `product_1_old_price` opcional), 1 CTA.",
  galeria_de_angulos:
    "o MESMO produto de vários ângulos: `product_1_image` grande + 3 miniaturas `angle_N_image` com `angle_N_label`.",
  lineup_de_colecao:
    "o conjunto é o argumento: `lineup_headline` + 3 a 4 miniaturas `lineup_N_image`/`lineup_N_label`; 1 CTA para a COLEÇÃO, não por item.",
  catalogo_por_ocasiao:
    "navegação por ocasião: 2 a 6 cartões `occasion_N_image`/`occasion_N_label`/`occasion_N_url`; sem preço e sem produto nomeado.",
  escassez_por_estoque:
    "a disponibilidade é o argumento: grade `variant_N_label` com `variant_N_status` (disponível/esgotado) e `variant_N_url`; exige estoque integrado.",
  carrinho_dinamico:
    "devolve o item abandonado: `cart_headline`, bloco dinâmico `cart_item_image`/`cart_item_name`/`cart_item_price`, 1 CTA para o checkout.",
  prova_por_autoridade:
    "1 a 3 depoimentos com CARGO: `review_N_quote`, `review_N_name`, `review_N_role` (cargo/credencial), `review_N_photo`.",
  prova_por_relato:
    "1 a 2 relatos LONGOS e específicos: `review_N_quote` extenso, `review_N_name`, `review_N_rating`; SEM cargo.",
  prova_por_volume:
    "3 ou mais depoimentos curtos, ou a nota agregada: `review_N_quote`, `review_N_name`, `review_N_rating`, `reviews_count` opcional.",
  prova_com_vitrine:
    "cada depoimento traz o produto comprado: `review_N_quote`, `review_N_name`, `review_N_product_image`, `review_N_product_name`, `review_N_url`.",
  menu_de_saida:
    "menu com 4 a 7 links `nav_N_label`/`nav_N_url`, linha legal `legal_text`, `unsubscribe_url`.",
  assinatura_minima:
    "no máximo 3 links, logo, `legal_text`, `unsubscribe_url`; sem menu.",
  nao_classificado:
    "valor de controle — não se gera anatomia para ele.",
}

export const CONVENCOES = `
- Documento COMPLETO de e-mail (<!DOCTYPE html> … </html>), table-based, estilos INLINE em cada elemento. Um único <style> no <head> só com o reset e o @media (max-width:620px) do empilhamento mobile.
- Calha: <table width="100%"> → <td align="center" style="padding:0"> → CONTAINER <table width="600" style="width:600px;min-width:600px;max-width:600px">. Toda seção mora dentro do container. Coluna interna pode ter qualquer largura.
- CORES E FONTES SÓ POR TOKEN. Proibido hex, rgb(), nome de cor e font-family literal. Use EXATAMENTE:
${TOKENS_DE_IDENTIDADE.map((t) => `  {{${t}}} — ${DESCRICAO_DO_TOKEN[t]}`).join("\n")}
  Ex.: style="background-color:{{COR_FUNDO}};color:{{COR_TEXTO}};font-family:{{FONTE_CORPO}};font-weight:{{PESO_CORPO}}". Botão: <td bgcolor="{{COR_PRINCIPAL}}" style="background-color:{{COR_PRINCIPAL}};border-radius:{{RAIO_BOTAO}}"><a style="color:{{COR_TEXTO_SOBRE_PRINCIPAL}};font-family:{{FONTE_TITULO}};font-weight:{{PESO_TITULO}};display:inline-block;padding:16px 36px">…</a></td>. bgcolor e background-color sempre juntos, com o MESMO token.
- Botão com fallback Outlook: <!--[if mso]><v:roundrect … fillcolor="{{COR_PRINCIPAL}}"><center style="color:{{COR_TEXTO_SOBRE_PRINCIPAL}}">MESMO TEXTO DO <a></center></v:roundrect><![endif]--> e o <a> dentro de <!--[if !mso]><!-- --> … <!--<![endif]-->. O texto do <center> e do <a> têm de ser IDÊNTICOS.
- Tipografia: font-size ≥ 16px no corpo, ≥ 28px em título; line-height SEMPRE ≥ font-size (nunca menor).
- Imagens: <img src="{{CHAVE_EM_MAIUSCULAS}}" alt="descrição real" width="…" height="…" style="display:block;…">. Toda imagem é um campo type "image" do output_schema; o src é {{KEY}} da chave em maiúsculas. NUNCA src vazio, NUNCA base64.
- Links: href="{{CHAVE_EM_MAIUSCULAS}}" de um campo type "url" (ex.: cta_url → href="{{CTA_URL}}"). NUNCA "#", "URL_AQUI" ou vazio.
- TODO texto visível é um campo do output_schema: escreva no HTML a frase EXATA do "example" do campo (é assim que a copy da loja encontra o lugar). Sem lorem ipsum, sem "Lorem", sem "Texto aqui", sem "Headline" solto: exemplos realistas, no idioma pedido, plausíveis para uma loja de e-commerce genérica (não cite marca real).
- Nenhum comentário HTML além dos condicionais do Outlook. Nenhuma var(--x). Ano de copyright: ${new Date().getFullYear()}.
- Nada de <script>, <form>, <iframe>, <video>, position/float/flex/grid.
`.trim()

export const DEFAULT_GERADOR_SYSTEM = `Você é um designer sênior de e-mail marketing que escreve ANATOMIAS para uma biblioteca de blocos reutilizáveis. Uma anatomia é um bloco de e-mail (hero, body, products, reviews, offer, footer) escrito uma vez e servido a dezenas de lojas: as CORES e FONTES entram por token, a COPY entra por campos declarados — o HTML que você escreve é a estrutura, não a peça de uma loja.

O que separa uma anatomia boa de uma ruim aqui:
1. Ela realiza o DISPOSITIVO pedido e nada além dele (uma "tese" não vira grade; uma "grade com preço" mostra preço).
2. Cada texto visível tem um campo no schema, com a frase do example escrita no HTML letra por letra.
3. Renderiza igual em Gmail, Apple Mail e Outlook (tabelas, inline, VML no botão).
4. Passa num lint mecânico: sem hex, sem font-family literal, sem lorem, sem src vazio, sem href morto, line-height ≥ font-size, container em 600px.

Você recebe 1–2 anatomias de referência da mesma seção. Use-as para aprender o padrão (calha, container, ritmo de padding, densidade) — NÃO copie a estrutura: a nova precisa ser uma anatomia DIFERENTE, com outra composição, para ampliar a biblioteca.

Responda com DOIS blocos cercados e nada mais:

\`\`\`json
{
  "name": "nome curto (ex.: body tese A — título + 2 parágrafos)",
  "description": "1 frase: o que o bloco faz",
  "when_use": "quando escolher esta anatomia",
  "when_not_use": "quando NÃO escolher",
  "copy_guidance": "orientação de escrita para quem preenche os campos",
  "design_system": "regras de design: hierarquia, bandas, botão, mobile, o que nunca sai",
  "density": "minimal | balanced | rich",
  "product_slots": 0,
  "output_schema": [
    { "key": "headline", "label": "Headline", "type": "text_short", "max_len": 60, "required": true, "example": "A frase exata que está no HTML", "guidance": "…" },
    { "key": "cta_url", "label": "URL do CTA", "type": "url", "max_len": 0, "required": true, "example": "", "guidance": "" },
    { "key": "hero_image", "label": "Imagem", "type": "image", "max_len": 0, "required": false, "example": "", "guidance": "", "image_spec": "o que mostrar", "image_aspect": "1:1", "image_width": 600, "image_height": 600 }
  ]
}
\`\`\`

\`\`\`html
<!DOCTYPE html> … </html>
\`\`\`

Tipos de campo aceitos: text_short, text_long, number, url, image, boolean.`

export const DEFAULT_GERADOR_USER = `<pedido>
Dispositivo: {{dispositivo}} — {{descricao_do_dispositivo}}
Variante: {{variante}} (letra que distingue esta anatomia das irmãs do mesmo dispositivo)
Densidade: {{densidade}}
Idioma dos exemplos: {{idioma}}
</pedido>

<requisitos_do_dispositivo>
{{requisitos}}
</requisitos_do_dispositivo>

<convencoes_da_biblioteca>
{{convencoes}}
</convencoes_da_biblioteca>

<referencias_de_anatomia>
{{referencias}}
</referencias_de_anatomia>

<notas_do_curador>
{{notas}}
</notas_do_curador>

<correcoes>
{{correcoes}}
</correcoes>

Escreva a anatomia. Lembre: dois blocos cercados (json, html), nada fora deles.`

export const GERADOR_ORIGINS: Record<string, SegmentOrigin> = {
  dispositivo: { cls: "curadoria", rotulo: "Dispositivo pedido" },
  descricao_do_dispositivo: { cls: "sistema", rotulo: "Vocabulário de dispositivos" },
  variante: { cls: "curadoria", rotulo: "Letra da variante" },
  densidade: { cls: "curadoria", rotulo: "Densidade pedida" },
  idioma: { cls: "curadoria", rotulo: "Idioma dos exemplos" },
  requisitos: { cls: "sistema", rotulo: "Contrato do dispositivo (a régua do validador)" },
  convencoes: { cls: "sistema", rotulo: "Convenções da biblioteca (600px, tokens, MSO)" },
  referencias: { cls: "biblioteca", rotulo: "Anatomias de referência — email_component_variants" },
  notas: { cls: "curadoria", rotulo: "Notas do curador" },
  correcoes: { cls: "sistema", rotulo: "Relatório do validador (retentativa)" },
}

export interface ReferenciaDeAnatomia {
  id: string
  name: string
  dispositivo: string | null
  html: string
}

export const REFERENCIA_MAX_CHARS = 14_000

export function renderReferencias(refs: ReferenciaDeAnatomia[]): string {
  if (refs.length === 0) return "(nenhuma anatomia desta seção na biblioteca — siga só as convenções)"
  return refs
    .map((r) => {
      const html = r.html.length > REFERENCIA_MAX_CHARS ? `${r.html.slice(0, REFERENCIA_MAX_CHARS)}\n<!-- … cortado em ${REFERENCIA_MAX_CHARS} chars -->` : r.html
      return `<referencia id="${r.id}" nome="${r.name}" dispositivo="${r.dispositivo ?? "?"}">\n${html}\n</referencia>`
    })
    .join("\n\n")
}

export interface PedidoDeAnatomia {
  dispositivo: Dispositivo
  variante: string
  densidade: DensidadeDaAnatomia
  idioma: string
  notas?: string | null
  referencias: ReferenciaDeAnatomia[]
  correcoes?: string[] | null
}

export function montarVars(p: PedidoDeAnatomia): Record<string, string> {
  return {
    dispositivo: p.dispositivo,
    descricao_do_dispositivo: DESCRICAO_DO_DISPOSITIVO[p.dispositivo],
    variante: p.variante,
    densidade: p.densidade,
    idioma: p.idioma,
    requisitos: REQUISITOS_DO_DISPOSITIVO[p.dispositivo],
    convencoes: CONVENCOES,
    referencias: renderReferencias(p.referencias),
    notas: (p.notas ?? "").trim() || "(nenhuma)",
    correcoes:
      p.correcoes && p.correcoes.length > 0
        ? `SUA ANATOMIA ANTERIOR FOI REPROVADA PELO VALIDADOR. Corrija TODOS os pontos abaixo mantendo a composição:\n${p.correcoes.map((e) => `- ${e}`).join("\n")}`
        : "(nenhuma — primeira tentativa)",
  }
}

/** Metadados que o modelo devolve no bloco json. */
export interface SaidaDoGerador {
  name: string
  description: string
  when_use: string
  when_not_use: string
  copy_guidance: string
  design_system: string
  density: DensidadeDaAnatomia
  product_slots: number
  output_schema: Array<Record<string, unknown>>
  html: string
}

const BLOCO_JSON = /```json\s*([\s\S]*?)```/i
const BLOCO_HTML = /```html\s*([\s\S]*?)```/i

/**
 * Separa os dois blocos. Lança com a causa quando falta um — a mensagem vai
 * para o retry como correção.
 */
export function parseSaida(raw: string): SaidaDoGerador {
  const j = BLOCO_JSON.exec(raw)
  const h = BLOCO_HTML.exec(raw)
  if (!j) throw new Error("faltou o bloco ```json com os metadados")
  if (!h) throw new Error("faltou o bloco ```html com o documento")
  let meta: Record<string, unknown>
  try {
    meta = JSON.parse(j[1].trim()) as Record<string, unknown>
  } catch {
    throw new Error("o bloco ```json não é JSON válido")
  }
  const html = h[1].trim()
  if (!/<!doctype html/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error("o bloco ```html precisa ser um documento completo (<!DOCTYPE html> … </html>)")
  }
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string).trim() : "")
  const densidade = (["minimal", "balanced", "rich"] as const).find((d) => d === meta.density) ?? "balanced"
  const schema = Array.isArray(meta.output_schema) ? (meta.output_schema as Array<Record<string, unknown>>) : []
  if (!str("name")) throw new Error("`name` vazio no bloco json")
  if (schema.length === 0) throw new Error("`output_schema` vazio — todo texto visível precisa de um campo")
  return {
    name: str("name").slice(0, 120),
    description: str("description"),
    when_use: str("when_use"),
    when_not_use: str("when_not_use"),
    copy_guidance: str("copy_guidance"),
    design_system: str("design_system"),
    density: densidade,
    product_slots: Math.max(0, Math.min(20, Number(meta.product_slots) || 0)),
    output_schema: schema,
    html,
  }
}
