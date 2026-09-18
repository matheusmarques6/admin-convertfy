/**
 * O funil de aplicação — "Operação de Retenção 7 Dias".
 *
 * Este formulário recebe tráfego pago DIRETO do anúncio, sem página de
 * vendas: ele é o funil inteiro. Vende, ensina, faz a conta do que a
 * loja está deixando passar, qualifica e agenda.
 *
 * ## Por que o funil vive em código, e não só no banco
 *
 * Ele tem 24 blocos, duas trilhas, cinco finais, quinze linhas de conta
 * e dezoito regras de salto. Montado só pela tela, não existe um lugar
 * onde alguém CONFIRA o caminho — e os modos de falha daqui são todos
 * silenciosos: a trilha global que não desvia, o score que não soma, a
 * conta que cai no fallback. Aqui a definição é dado versionado e os
 * caminhos da seção de QA são TESTE, percorridos pela engine de
 * produção. O banco é semeado a partir daqui (ver
 * `scripts/seed-funil-aplicacao.ts`), e o operador segue editando pela
 * tela normalmente: depois do seed, quem manda é o banco.
 *
 * ## Três decisões que a spec não podia tomar sozinha
 *
 * 1. **Faturamento e ticket são DOIS blocos cada, não um por moeda.** A
 *    escada do Brasil e a global têm degraus diferentes de propósito
 *    (100/200/500 mil × 10/25/50 mil), e o mecanismo de `opcoes_por_moeda`
 *    serve uma escada só. Dois refs custam duas regras de salto e
 *    preservam o vocabulário de cada mercado.
 * 2. **"Só quero entender" tem final PRÓPRIO.** A spec manda esse caso
 *    para o final de faturamento, cujo texto diz "abaixo de R$100 mil a
 *    operação não se paga" — dito a quem acabou de responder que fatura
 *    um milhão, é uma mentira na cara do lead. Final novo, texto que
 *    corresponde ao que a pessoa respondeu.
 * 3. **O score não recusa ninguém.** Ele é gravado e some para o CRM
 *    priorizar. Quem passou nos cortes duros (perfil, faturamento,
 *    intenção) chega ao final aprovado — a régua de prioridade é do
 *    vendedor, não do formulário.
 */

import type { CampoLegado } from "./schema"
import { montarVersao } from "./publicar"
import type { FormBlock, FormEnding, FormSchema, LogicRule } from "@/types/forms-conversational"
import type { Calculo } from "./calculo"

export const FORM_ID = "a91ca5a0-0000-4000-8000-000000000001"
export const FORM_SLUG = "aplicacao"
export const FORM_NOME = "Aplicação · Operação de Retenção 7 Dias"

const BASE = "a91ca5a0-0000-4000-8000-0000000000"

/**
 * Os refs, por apelido.
 *
 * O `ref` É o `crm_form_fields.id` — não é conveniência: a regra do
 * evento qualificado, `form_submissions.data` e `answers` apontam para
 * ele. Fixá-los aqui é o que torna o seed idempotente e permite escrever
 * a lógica sem consultar o banco.
 */
export const REF = {
  nome: `${BASE}10`,
  whatsapp: `${BASE}11`,
  email: `${BASE}12`,
  site: `${BASE}20`,
  operacao: `${BASE}30`,
  mercado: `${BASE}40`,
  faturamento_br: `${BASE}50`,
  faturamento_global: `${BASE}51`,
  acessos: `${BASE}60`,
  ticket_br: `${BASE}70`,
  ticket_global: `${BASE}71`,
  mat1: `${BASE}80`,
  carrinho: `${BASE}90`,
  recompra: `${BASE}91`,
  mat2: `${BASE}a0`,
  reducao_danos: `${BASE}b0`,
  mensagens_entrega: `${BASE}b1`,
  gateway: `${BASE}b2`,
  estado_email: `${BASE}c0`,
  o_que_muda: `${BASE}c1`,
  ja_tentou: `${BASE}c2`,
  preco: `${BASE}d0`,
  decisao: `${BASE}d1`,
  compromisso: `${BASE}d2`,
} as const

export type ApelidoDoBloco = keyof typeof REF

export const FINAL = {
  aprovado: "fim_aprovado",
  faturamento: "fim_faturamento",
  faturamento_global: "fim_faturamento_global",
  perfil: "fim_perfil",
  sem_intencao: "fim_sem_intencao",
} as const

/** `ending:<ref>` — o vocabulário de destino da engine. */
const fim = (ref: string) => `ending:${ref}`

/** O ponto de entrada da operação, confirmado pelo dono em 18/09. */
export const PRECO_MENSAL = "R$3.500"

// ────────────────────────────── opções ──────────────────────────────

interface Opcao {
  value: string
  label: string
  /** O número que a opção representa na conta. */
  valor?: number
  /** Piso em REAL, para a régua de qualificação. */
  piso?: number
  /** Pontos que a escolha soma no score. */
  score?: number
  /** Marca o lead e o negócio quando esta resposta é escolhida. */
  tag?: string
}

const OPERACAO: Opcao[] = [
  { value: "marca", label: "Marca própria, com loja rodando e vendendo todo dia", score: 15 },
  { value: "drop", label: "Dropshipping, com loja rodando e vendendo todo dia", score: 15 },
  { value: "irregular", label: "Tenho loja, mas as vendas ainda são irregulares" },
  { value: "agencia", label: "Não tenho loja própria (agência, freelancer ou presto serviço)" },
]

const MERCADO: Opcao[] = [
  { value: "br", label: "Brasil" },
  { value: "eu", label: "Europa" },
  { value: "us", label: "Estados Unidos" },
  { value: "multi", label: "Mais de um país" },
]

/** O `valor` é o ponto de referência da faixa, não o piso: usar o chão
 * faria toda conta sair pelo mínimo, e a spec escolheu o meio. O `piso`
 * viaja junto porque é ele que a qualificação compara. */
const FATURAMENTO_BR: Opcao[] = [
  { value: "ate_100k", label: "Até R$100 mil", piso: 0 },
  { value: "100_200k", label: "De R$100 mil a R$200 mil", valor: 150_000, piso: 100_000, score: 15 },
  { value: "200_500k", label: "De R$200 mil a R$500 mil", valor: 350_000, piso: 200_000, score: 20 },
  { value: "500k_1m", label: "De R$500 mil a R$1 milhão", valor: 750_000, piso: 500_000, score: 25 },
  { value: "1_5m", label: "De R$1 milhão a R$5 milhões", valor: 2_000_000, piso: 1_000_000, score: 30 },
  { value: "acima_5m", label: "Acima de R$5 milhões", valor: 5_000_000, piso: 5_000_000, score: 30 },
]

/** Em dólar. O `piso` converte pela taxa fixa de `lib/forms/moeda`
 * (US$1 = R$5): faixa de qualificação é decisão comercial, e com cotação
 * do dia o mesmo lead mudaria de lado conforme o câmbio da manhã. */
const FATURAMENTO_GLOBAL: Opcao[] = [
  { value: "ate_10k", label: "Até US$10 mil", piso: 0 },
  { value: "10_25k", label: "De US$10 mil a US$25 mil", valor: 17_500, piso: 50_000, score: 15 },
  { value: "25_50k", label: "De US$25 mil a US$50 mil", valor: 37_500, piso: 125_000, score: 20 },
  { value: "50_150k", label: "De US$50 mil a US$150 mil", valor: 100_000, piso: 250_000, score: 25 },
  { value: "150_500k", label: "De US$150 mil a US$500 mil", valor: 325_000, piso: 750_000, score: 30 },
  { value: "acima_500k", label: "Acima de US$500 mil", valor: 500_000, piso: 2_500_000, score: 30 },
]

const ACESSOS: Opcao[] = [
  { value: "ate_300", label: "Até 300", valor: 300 },
  { value: "300_1000", label: "De 300 a 1.000", valor: 1_000 },
  { value: "1000_3000", label: "De 1.000 a 3.000", valor: 2_000 },
  { value: "3000_10000", label: "De 3.000 a 10.000", valor: 5_000 },
  { value: "mais_10000", label: "Mais de 10.000", valor: 10_000 },
  { value: "nao_sei", label: "Não sei dizer", valor: 1_000 },
]

const TICKET_BR: Opcao[] = [
  { value: "ate_100", label: "Até R$100", valor: 80 },
  { value: "100_200", label: "De R$100 a R$200", valor: 150 },
  { value: "200_400", label: "De R$200 a R$400", valor: 300 },
  { value: "400_800", label: "De R$400 a R$800", valor: 600 },
  { value: "acima_800", label: "Acima de R$800", valor: 1_000 },
]

const TICKET_GLOBAL: Opcao[] = [
  { value: "ate_30", label: "Até US$30", valor: 25 },
  { value: "30_60", label: "De US$30 a US$60", valor: 45 },
  { value: "60_120", label: "De US$60 a US$120", valor: 90 },
  { value: "120_250", label: "De US$120 a US$250", valor: 185 },
  { value: "acima_250", label: "Acima de US$250", valor: 300 },
]

const CARRINHO: Opcao[] = [
  { value: "nada", label: "Nada", score: 15 },
  {
    value: "email_padrao",
    label: "Recebe um e-mail, aquele que já veio pronto na plataforma",
    score: 12,
  },
  { value: "sequencia", label: "Recebe uma sequência que alguém montou de propósito" },
  { value: "nao_sei", label: "Não sei dizer", score: 12 },
]

const RECOMPRA: Opcao[] = [
  { value: "quase_nenhum", label: "Quase nenhum", score: 15 },
  { value: "dois_tres", label: "Uns 2 ou 3", score: 10 },
  { value: "metade", label: "Metade ou mais" },
  { value: "nao_sei", label: "Não sei dizer", score: 12 },
]

const MENSAGENS_ENTREGA: Opcao[] = [
  { value: "nenhuma", label: "Nenhuma, só a confirmação automática da loja", score: 15 },
  { value: "rastreio", label: "Só o código de rastreio, quando sai", score: 12 },
  { value: "duas_tres", label: "Duas ou três, montadas por mim", score: 5 },
  { value: "regua", label: "Uma régua completa, etapa por etapa" },
  { value: "nao_sei", label: "Não sei dizer", score: 12 },
]

/** As quatro primeiras são o sinal de risco — quem marca qualquer uma
 * ganha esta tag e vai para o topo da fila. A marca mora na OPÇÃO, onde
 * quem escreve a pergunta a enxerga, e não numa regra separada. */
export const TAG_RISCO = "risco-de-gateway"
export const GATEWAY_DE_RISCO = ["reserva", "time_risco", "conta_desligada", "aviso_disputa"]

const GATEWAY: Opcao[] = [
  { value: "reserva", label: "Já seguraram meu dinheiro (reserva ou aqueles 120 dias)", tag: TAG_RISCO },
  { value: "time_risco", label: "Já recebi e-mail do time de risco pedindo explicação", tag: TAG_RISCO },
  { value: "conta_desligada", label: "Já tive conta desligada e precisei migrar de gateway", tag: TAG_RISCO },
  { value: "aviso_disputa", label: "Já levei aviso por índice de disputa ou de reembolso", tag: TAG_RISCO },
  { value: "nunca_nao_acompanho", label: "Nunca aconteceu, mas eu não acompanho o meu índice" },
  { value: "abaixo_05", label: "Acompanho e está abaixo de 0,5%" },
]

const ESTADO_EMAIL: Opcao[] = [
  { value: "nada", label: "Não tenho nada montado", score: 15 },
  { value: "parado", label: "Tenho fluxos montados, mas parados", score: 15 },
  { value: "pouco", label: "Roda, mas traz pouco, menos de 10% do faturamento", score: 15 },
  { value: "bom", label: "Roda e já traz uma boa parte, mais de 25%" },
  { value: "agencia_insatisfeito", label: "Tem uma agência cuidando e eu não estou satisfeito", score: 15 },
  { value: "nao_sei", label: "Não faço ideia de quanto traz", score: 12 },
]

const O_QUE_MUDA: Opcao[] = [
  { value: "verba", label: "Subo a verba sabendo que não dependo só do anúncio pra vender" },
  { value: "margem", label: "Recupero margem: vendo de novo pro mesmo cliente sem pagar CPM outra vez" },
  { value: "caixa", label: "Caixa previsível, sem depender do que o gateway libera" },
  { value: "bolso", label: "Sobra pra mim: pró-labore e respiro no bolso" },
  { value: "time", label: "Contrato time e saio de dentro da operação" },
]

const JA_TENTOU: Opcao[] = [
  { value: "agencia", label: "Contratei agência e não deu resultado" },
  { value: "freela", label: "Contratei freelancer e ficou pela metade" },
  { value: "sozinho", label: "Tentei fazer sozinho e não tive tempo" },
  { value: "basico", label: "Montei o básico e nunca mais mexi" },
  { value: "nunca", label: "Nunca tentei nada" },
]

const DECISAO: Opcao[] = [
  { value: "sozinho", label: "Bato o martelo na hora", score: 20 },
  { value: "socio", label: "Decido com o meu sócio, e ele pode entrar na call", score: 10 },
  { value: "time", label: "Preciso levar pro time ou pra diretoria" },
  { value: "so_entender", label: "Não penso em contratar agora, só quero entender" },
]

const COMPROMISSO: Opcao[] = [
  { value: "sim", label: "Sim, me comprometo", score: 10 },
  { value: "nao_garanto", label: "Não consigo garantir", score: -15 },
]

// ─────────────────────────────── a conta ────────────────────────────

/**
 * As quinze linhas da conta, na ordem em que se lê.
 *
 * `visitas`, `ticket_val` e `fat_val` chegam das respostas (o `variavel`
 * do bloco mais o `valor` da opção). As linhas que só repetem uma
 * entrada — `visitas_dia`, `fat_mes` — existem porque o recall lê o
 * TEXTO formatado dos cálculos, não os números crus: sem elas, escrever
 * `{{visitas}}` na tela imprimiria o fallback.
 */
export const CALCULOS: Calculo[] = [
  { nome: "visitas_dia", expressao: "visitas", formato: "numero" },
  { nome: "carrinhos", expressao: "visitas * 0.10", formato: "numero" },
  { nome: "checkouts", expressao: "visitas * 0.05", formato: "numero" },
  { nome: "vendas", expressao: "visitas * 0.015", formato: "numero" },
  { nome: "carrinhos_perdidos", expressao: "carrinhos - vendas", formato: "numero" },
  { nome: "checkouts_perdidos", expressao: "checkouts - vendas", formato: "numero" },
  { nome: "pedidos_dia", expressao: "carrinhos_perdidos * 0.05", formato: "numero" },
  { nome: "receita_dia", expressao: "pedidos_dia * ticket_val", formato: "dinheiro" },
  { nome: "receita_mes", expressao: "receita_dia * 30", formato: "dinheiro" },
  {
    nome: "receita_checkout",
    expressao: "checkouts_perdidos * 0.08 * ticket_val * 30",
    formato: "dinheiro",
  },
  { nome: "receita_total", expressao: "receita_mes + receita_checkout", formato: "dinheiro" },
  { nome: "fat_mes", expressao: "fat_val", formato: "dinheiro" },
  { nome: "pedidos_mes", expressao: "fat_val / ticket_val", formato: "numero" },
  { nome: "base_ano", expressao: "pedidos_mes * 12 * 0.85", formato: "numero" },
  { nome: "pedidos_campanha", expressao: "base_ano * 0.005", formato: "numero" },
  { nome: "receita_campanha", expressao: "pedidos_campanha * ticket_val", formato: "dinheiro" },
]

// ───────────────────────── textos das telas ─────────────────────────

const TEXTO_MAT1 = [
  "Com cerca de **{{visitas_dia}}** pessoas entrando por dia, numa loja como a sua o caminho costuma ser esse:",
  "",
  "{{visitas_dia}} entram · {{carrinhos}} colocam no carrinho · {{checkouts}} chegam no checkout · {{vendas}} compram",
  "",
  "Ou seja: {{carrinhos_perdidos}} carrinhos abandonados por dia, e {{checkouts_perdidos}} pessoas que já tinham digitado os dados e travaram na última tela.",
  "",
  "Recuperar carrinho no mercado dá de 3% a 5%. Quem opera bem, com e-mail e SMS juntos, chega em 8% a 12%.",
  "",
  "Sendo conservador, 5%: {{pedidos_dia}} pedidos a mais por dia. Com o seu ticket, são {{receita_dia}} por dia. {{receita_mes}} por mês.",
  "",
  "Some o checkout abandonado, que converte ainda melhor: mais uns {{receita_checkout}}.",
  "",
  "{{receita_total}} por mês, sem subir um real de tráfego. E isso é só o carrinho.",
].join("\n")

const TEXTO_MAT2 = [
  "Faturando {{fat_mes}} com o seu ticket, você faz por volta de {{pedidos_mes}} pedidos por mês. Em um ano, são quase {{base_ano}} clientes que já compraram de você, já confiaram no site e já passaram o cartão.",
  "",
  "Uma campanha bem segmentada pra essa base converte de 0,2% a 1%. Em 0,5%, são {{pedidos_campanha}} pedidos: {{receita_campanha}} em um único dia de envio.",
  "",
  "Agora multiplica pelas datas: 9.9, 10.10, 11.11, Black Friday, Natal. Mais as 8 a 12 campanhas do mês.",
  "",
  "Quem opera isso direito tira de 25% a 35% do faturamento de e-mail e SMS. Você me disse que está longe disso.",
].join("\n")

const TEXTO_REDUCAO = [
  "Desde 1º de abril de 2026 a Visa derrubou o limite de disputa de 2,2% para 1,5%, e quem passa paga 8 dólares por disputa. Só que o seu gateway trabalha com limite bem menor, entre 0,5% e 0,7%. É por isso que ele segura pagamento por 120 dias, cria reserva ou simplesmente desliga a conta, quase sempre sem explicar o motivo.",
  "",
  "E cerca de 75% das disputas não são fraude: é gente que comprou, cansou de esperar e abriu disputa no banco.",
  "",
  "O que a gente monta pra quem vende fora: pedido confirmado, em separação, aguardando coleta, a caminho, saiu pra entrega. Cada etapa com prazo real, por e-mail e SMS. O cliente reclama com você antes de reclamar com o banco.",
  "",
  "Isso não é só receita. É a sua conta de pagamento continuar viva mês que vem.",
].join("\n")

const TEXTO_PRECO = [
  `A nossa operação começa em ${PRECO_MENSAL} por mês. E está no contrato: se em 30 dias o e-mail não trouxer 10% do seu faturamento, você não paga nada.`,
  "",
  "Faturando {{fat_mes}}, esses 10% pagam a operação várias vezes já no primeiro mês.",
].join("\n")


// ───────────────────────── as provas na tela ────────────────────────

/**
 * Os prints, tirados da própria página de vendas (convertfy.me).
 *
 * A escolha é por **o que cada print PROVA**, não por preencher espaço:
 * a tela que acabou de projetar receita de e-mail recebe um painel com
 * receita de e-mail; a que afirma "25% a 35%" recebe o painel que marca
 * 25,4%. Print bonito numa tela que afirma outra coisa é enfeite, e
 * enfeite numa página que pede o WhatsApp de alguém custa confiança.
 *
 * **Endereço da página de vendas, não cópia nossa.** Trocar a imagem lá
 * troca aqui, o que é o certo enquanto são a mesma prova — e é também o
 * risco: apagar o arquivo lá deixa a tela sem imagem aqui, em silêncio.
 * Quando o print for exclusivo do funil, suba pelo botão do editor, que
 * grava no nosso bucket.
 */
const LP = "https://convertfy.me/imagens"

const PROVAS: Partial<Record<ApelidoDoBloco, { url: string; alt: string }>> = {
  // A conta acabou de projetar receita de e-mail; o painel mostra
  // receita de e-mail de uma loja real, no mesmo mês.
  mat1: {
    url: `${LP}/omnisend-2.webp`,
    alt: "Painel de uma loja brasileira em julho de 2026: 26,9% do faturamento veio do e-mail, R$372.564 no mês.",
  },
  // A tela afirma "de 25% a 35% do faturamento". Este painel marca 25,4%
  // — o piso da faixa que o texto acabou de citar.
  mat2: {
    url: `${LP}/omnisend-3.webp`,
    alt: "Painel de outra loja brasileira em julho de 2026: 25,4% do faturamento veio do e-mail, R$467.061 no mês.",
  },
  // A pergunta é "o que você já tentou, e por que parou". A resposta mais
  // comum é agência que não deu resultado; o contraponto certo é um
  // cliente dizendo o que aconteceu, não mais um número nosso.
  ja_tentou: {
    url: `${LP}/feedback-02.png`,
    alt: "Print de conversa com um cliente relatando 20% de crescimento depois da operação.",
  },
}

// ────────────────────────────── os campos ───────────────────────────

interface DefCampo extends Omit<CampoLegado, "id" | "position" | "options"> {
  apelido: ApelidoDoBloco
  opcoes?: Opcao[]
}

/** O que vai para `crm_form_fields` — a forma viva que o editor edita. */
const DEFS: DefCampo[] = [
  {
    apelido: "nome",
    field_type: "text",
    label: "Seu nome",
    placeholder: "Como você se chama",
    required: true,
    map_to_lead_field: "first_name",
  },
  {
    apelido: "whatsapp",
    field_type: "phone",
    label: "WhatsApp",
    required: true,
    map_to_lead_field: "phone",
    validation: { countryCode: true },
  },
  {
    apelido: "email",
    field_type: "email",
    label: "E-mail",
    description:
      "Ao continuar, você concorda em ser contatado pela Convertfy sobre esta aplicação.",
    required: true,
    map_to_lead_field: "email",
  },
  {
    apelido: "site",
    field_type: "url",
    label: "{{nome}}, qual o link da sua loja?",
    description:
      "Eu abro a sua loja e a sua conta antes da conversa. Você chega na call com a análise pronta, não com um questionário.",
    placeholder: "sualoja.com.br",
    required: true,
    map_to_lead_field: "URL da sua loja",
  },
  {
    apelido: "operacao",
    field_type: "radio",
    label: "E como é a sua operação hoje?",
    description:
      "Essa operação é pra loja que já vende todo dia. Não atendo agência, freelancer nem loja parada.",
    required: true,
    opcoes: OPERACAO,
  },
  {
    apelido: "mercado",
    field_type: "radio",
    label: "A sua loja vende pra onde?",
    required: true,
    opcoes: MERCADO,
  },
  {
    apelido: "faturamento_br",
    field_type: "radio",
    label: "Quanto a loja fatura por mês hoje?",
    description:
      "Média dos últimos 3 meses. Me fala o número real, é ele que decide se eu consigo te ajudar.",
    required: true,
    opcoes: FATURAMENTO_BR,
  },
  {
    apelido: "faturamento_global",
    field_type: "radio",
    label: "Quanto a loja fatura por mês hoje?",
    description:
      "Média dos últimos 3 meses, em dólar. Me fala o número real, é ele que decide se eu consigo te ajudar.",
    required: true,
    opcoes: FATURAMENTO_GLOBAL,
  },
  {
    apelido: "acessos",
    field_type: "radio",
    label: "Quantas pessoas entram na sua loja por dia?",
    description: "Chute pela média da última semana, não precisa abrir o painel.",
    required: true,
    opcoes: ACESSOS,
  },
  {
    apelido: "ticket_br",
    field_type: "radio",
    label: "E qual o seu ticket médio?",
    required: true,
    opcoes: TICKET_BR,
  },
  {
    apelido: "ticket_global",
    field_type: "radio",
    label: "E qual o seu ticket médio?",
    description: "Em dólar.",
    required: true,
    opcoes: TICKET_GLOBAL,
  },
  {
    apelido: "mat1",
    field_type: "statement",
    label: "Então vamos fazer a sua conta, {{nome}}.",
    description: TEXTO_MAT1,
  },
  {
    apelido: "carrinho",
    field_type: "radio",
    label: "E hoje, quando alguém coloca no carrinho e vai embora, o que acontece?",
    required: true,
    opcoes: CARRINHO,
  },
  {
    apelido: "recompra",
    field_type: "radio",
    label: "E de cada 10 clientes que já compraram, quantos voltam a comprar?",
    required: true,
    opcoes: RECOMPRA,
  },
  { apelido: "mat2", field_type: "statement", label: "Agora a outra ponta.", description: TEXTO_MAT2 },
  {
    apelido: "reducao_danos",
    field_type: "statement",
    label:
      "{{nome}}, quem vende fora tem um problema que loja de Brasil não tem: o tempo entre a compra e a entrega.",
    description: TEXTO_REDUCAO,
  },
  {
    apelido: "mensagens_entrega",
    field_type: "radio",
    label: "Hoje, entre a compra e a entrega, quantas mensagens o seu cliente recebe?",
    required: true,
    opcoes: MENSAGENS_ENTREGA,
  },
  {
    apelido: "gateway",
    field_type: "multi_select",
    label: "E com o seu gateway, já aconteceu alguma dessas?",
    description: "Pode marcar mais de uma.",
    required: true,
    validation: { maxEscolhas: 3 },
    opcoes: GATEWAY,
  },
  {
    apelido: "estado_email",
    field_type: "radio",
    label: "Como está o seu e-mail hoje?",
    required: true,
    opcoes: ESTADO_EMAIL,
  },
  {
    apelido: "o_que_muda",
    field_type: "radio",
    label: "Se daqui a 30 dias essa receita estiver entrando todo mês, o que muda pra você?",
    required: true,
    opcoes: O_QUE_MUDA,
  },
  {
    apelido: "ja_tentou",
    field_type: "radio",
    label: "O que você já tentou pra resolver isso, e por que parou?",
    required: true,
    opcoes: JA_TENTOU,
  },
  {
    apelido: "preco",
    field_type: "statement",
    label: "Antes de seguir, é justo você saber dois números.",
    description: TEXTO_PRECO,
  },
  {
    apelido: "decisao",
    field_type: "radio",
    label:
      "Se na conversa a conta fechar pra você, consegue bater o martelo na hora ou precisa falar com mais alguém antes?",
    required: true,
    opcoes: DECISAO,
  },
  {
    apelido: "compromisso",
    field_type: "radio",
    label:
      "Se a sua aplicação for aprovada, você se compromete a estar na chamada no horário que escolher?",
    required: true,
    opcoes: COMPROMISSO,
  },
]

export function camposDoFunil(): CampoLegado[] {
  return DEFS.map((d, i) => ({
    id: REF[d.apelido],
    field_type: d.field_type,
    label: d.label,
    placeholder: d.placeholder ?? null,
    description: d.description ?? null,
    required: d.required ?? false,
    position: i + 1,
    options: (d.opcoes ?? []).map((o) => ({
      label: o.label,
      value: o.value,
      ...(o.valor !== undefined ? { valor: o.valor } : {}),
      ...(o.piso !== undefined ? { piso: o.piso } : {}),
      ...(o.tag ? { tag: o.tag } : {}),
    })),
    validation: d.validation ?? {},
    map_to_lead_field: d.map_to_lead_field ?? null,
    media: PROVAS[d.apelido] ? { tipo: "imagem", ...PROVAS[d.apelido] } : (d.media ?? null),
  }))
}

// ─────────────────────────── lógica e finais ────────────────────────

const soma = (n: number) => [{ nome: "score", operacao: "add" as const, valor: n }]

/**
 * Uma regra por opção que pontua, todas indo para o mesmo destino.
 *
 * O `set` da engine roda quando a regra CASA, então somar score sem
 * desviar exige uma regra por opção apontando para a tela seguinte.
 * Opção sem pontos não entra: ela cai no destino padrão, que é o mesmo
 * lugar.
 */
function pontos(ref: string, opcoes: Opcao[], goto: string): LogicRule[] {
  return opcoes
    .filter((o) => typeof o.score === "number" && o.score !== 0)
    .map((o) => ({
      conditions: [{ ref, operator: "equals" as const, value: o.value }],
      logic: "and" as const,
      goto,
      set: soma(o.score as number),
    }))
}

const LOGICA: Partial<Record<ApelidoDoBloco, LogicRule[]>> = {
  operacao: [
    {
      conditions: [{ ref: REF.operacao, operator: "equals", value: "agencia" }],
      logic: "and",
      goto: fim(FINAL.perfil),
    },
    ...pontos(REF.operacao, OPERACAO, REF.mercado),
  ],
  mercado: [
    {
      conditions: [{ ref: REF.mercado, operator: "equals", value: "br" }],
      logic: "and",
      goto: REF.faturamento_br,
      set: [
        { nome: "trilha", operacao: "set", valor: "br" },
        { nome: "moeda", operacao: "set", valor: "BRL" },
      ],
    },
    {
      conditions: [{ ref: REF.mercado, operator: "in", value: ["eu", "us", "multi"] }],
      logic: "and",
      goto: REF.faturamento_global,
      set: [
        { nome: "trilha", operacao: "set", valor: "global" },
        { nome: "moeda", operacao: "set", valor: "USD" },
      ],
    },
  ],
  faturamento_br: [
    {
      conditions: [{ ref: REF.faturamento_br, operator: "equals", value: "ate_100k" }],
      logic: "and",
      goto: fim(FINAL.faturamento),
    },
    ...pontos(REF.faturamento_br, FATURAMENTO_BR, REF.acessos),
  ],
  faturamento_global: [
    {
      conditions: [{ ref: REF.faturamento_global, operator: "equals", value: "ate_10k" }],
      logic: "and",
      goto: fim(FINAL.faturamento_global),
    },
    ...pontos(REF.faturamento_global, FATURAMENTO_GLOBAL, REF.acessos),
  ],
  // A trilha é lida da RESPOSTA de mercado, não da variável `trilha`: as
  // duas dizem o mesmo e a resposta sobrevive a voltar e trocar, enquanto
  // a variável depende de a regra ter casado de novo no caminho.
  acessos: [
    {
      conditions: [{ ref: REF.mercado, operator: "not_equals", value: "br" }],
      logic: "and",
      goto: REF.ticket_global,
    },
  ],
  carrinho: pontos(REF.carrinho, CARRINHO, REF.recompra),
  recompra: pontos(REF.recompra, RECOMPRA, REF.mat2),
  mat2: [
    {
      conditions: [{ ref: REF.mercado, operator: "not_equals", value: "br" }],
      logic: "and",
      goto: REF.reducao_danos,
    },
  ],
  mensagens_entrega: pontos(REF.mensagens_entrega, MENSAGENS_ENTREGA, REF.gateway),
  gateway: [
    {
      conditions: [{ ref: REF.gateway, operator: "in", value: GATEWAY_DE_RISCO }],
      logic: "and",
      goto: REF.estado_email,
      set: soma(20),
    },
    {
      conditions: [{ ref: REF.gateway, operator: "equals", value: "nunca_nao_acompanho" }],
      logic: "and",
      goto: REF.estado_email,
      set: soma(12),
    },
  ],
  estado_email: pontos(REF.estado_email, ESTADO_EMAIL, REF.o_que_muda),
  decisao: [
    {
      conditions: [{ ref: REF.decisao, operator: "equals", value: "so_entender" }],
      logic: "and",
      goto: fim(FINAL.sem_intencao),
    },
    ...pontos(REF.decisao, DECISAO, REF.compromisso),
  ],
  compromisso: pontos(REF.compromisso, COMPROMISSO, fim(FINAL.aprovado)),
}

/**
 * Destino padrão de cada tela — só onde a ordem crua levaria ao lugar
 * errado.
 *
 * Faturamento e ticket existem em duas versões seguidas na ordem: sem
 * isto, quem responde a de real cairia na de dólar logo depois, e o
 * formulário perguntaria duas vezes a mesma coisa em duas moedas.
 */
const PROXIMO: Partial<Record<ApelidoDoBloco, string>> = {
  faturamento_br: REF.acessos,
  faturamento_global: REF.acessos,
  acessos: REF.ticket_br,
  ticket_br: REF.mat1,
  ticket_global: REF.mat1,
  mat2: REF.estado_email,
  gateway: REF.estado_email,
  decisao: REF.compromisso,
  compromisso: fim(FINAL.aprovado),
}

/** Blocos que dividem tela com o anterior. */
const AGRUPADOS: ApelidoDoBloco[] = ["whatsapp", "email"]

const TITULO_DA_TELA: Partial<Record<ApelidoDoBloco, string>> = {
  nome: "Antes de tudo, qual seu nome e contato?",
}

/** A variável da conta que cada resposta alimenta. */
/**
 * A resposta que vai em destaque no card.
 *
 * É a frase que o closer devolve na conversa — "você disse que o que
 * muda é recuperar margem". Enterrada no meio de vinte respostas,
 * ninguém lê antes de ligar.
 */
const EM_DESTAQUE: ApelidoDoBloco = "o_que_muda"

const VARIAVEL: Partial<Record<ApelidoDoBloco, string>> = {
  faturamento_br: "fat_val",
  faturamento_global: "fat_val",
  acessos: "visitas",
  ticket_br: "ticket_val",
  ticket_global: "ticket_val",
}

export const FINAIS: FormEnding[] = [
  {
    ref: FINAL.aprovado,
    tags: ["qualificado"],
    // O título AFIRMA o desfecho e não instrui: quem instrui é o
    // cabeçalho do seletor de horário, que some depois de marcado. Com
    // "agora é só escolher o seu horário" fixo aqui, a tela mandava
    // escolher ao lado do cartão dizendo "Horário confirmado" — duas
    // frases opostas, achadas renderizando. O "✔" também saiu: o
    // círculo verde da tela final já é o sinal, e dois check na mesma
    // altura só competem.
    title: "Aplicação pré-aprovada, {{nome}}.",
    description: [
      "Na conversa eu abro a sua conta comigo e a gente refaz essa conta com os seus números de verdade, não com média de mercado. Se fizer sentido, a operação entra no ar em 7 dias.",
      "",
      "Faltar sem remarcar libera a sua vaga pro próximo da fila — conto com você.",
    ].join("\n"),
    // A agenda é a NOSSA, desenhada dentro desta tela — sem levar para
    // outro domínio quem acabou de ser aprovado. `automatico` não se
    // aplica: não há para onde navegar.
    destino: { tipo: "agenda" },
  },
  {
    ref: FINAL.faturamento,
    tags: ["fora-do-corte"],
    // Recusado na tela não vira card: o time abriria o Inbound e veria,
    // no meio dos leads bons, gente que acabou de ler que a conta não
    // fecha. O lead fica gravado, com a tag, fora da pipeline.
    cria_negocio: false,
    title: "Valeu pela sinceridade, {{nome}}.",
    description: [
      "Abaixo de R$100 mil por mês a minha operação não se paga na sua loja, e eu prefiro te falar isso agora do que te vender uma conversa.",
      "",
      "Te mandei por e-mail os 4 fluxos que mais dão dinheiro pra quem está na sua faixa, do jeito que a gente monta aqui. Monta você mesmo. Quando passar desse número, me chama.",
    ].join("\n"),
    disqualified: true,
  },
  {
    ref: FINAL.faturamento_global,
    tags: ["fora-do-corte"],
    // Recusado na tela não vira card: o time abriria o Inbound e veria,
    // no meio dos leads bons, gente que acabou de ler que a conta não
    // fecha. O lead fica gravado, com a tag, fora da pipeline.
    cria_negocio: false,
    title: "Valeu pela sinceridade, {{nome}}.",
    description: [
      "Abaixo de 10 mil dólares por mês a minha operação não se paga na sua loja, e eu prefiro te falar isso agora do que te vender uma conversa.",
      "",
      "Te mandei por e-mail os 4 fluxos que mais dão dinheiro pra quem está na sua faixa, do jeito que a gente monta aqui. Monta você mesmo. Quando passar desse número, me chama.",
    ].join("\n"),
    disqualified: true,
  },
  {
    ref: FINAL.perfil,
    tags: ["perfil-fora"],
    // Recusado na tela não vira card: o time abriria o Inbound e veria,
    // no meio dos leads bons, gente que acabou de ler que a conta não
    // fecha. O lead fica gravado, com a tag, fora da pipeline.
    cria_negocio: false,
    title: "Eu só opero retenção pra loja que já vende todo dia.",
    description:
      "Não atendo agência nem prestador de serviço. Se você cuida do marketing de lojas e quer conversar sobre parceria, me chama no Instagram — mas por aqui não é o caminho.",
    disqualified: true,
  },
  {
    // A spec mandava este caso para o final de faturamento, cujo texto
    // diz "abaixo de R$100 mil a operação não se paga". Dito a quem
    // acabou de responder que fatura um milhão, é uma mentira na cara do
    // lead — e ele é justamente o que a gente quer de volta depois.
    ref: FINAL.sem_intencao,
    tags: ["sem-intencao-agora"],
    // Recusado na tela não vira card: o time abriria o Inbound e veria,
    // no meio dos leads bons, gente que acabou de ler que a conta não
    // fecha. O lead fica gravado, com a tag, fora da pipeline.
    cria_negocio: false,
    title: "Fechado, {{nome}}. Sem conversa de venda então.",
    description: [
      "Te mandei por e-mail a conta que a gente fez aqui, com os seus números, mais os 4 fluxos que mais dão dinheiro numa loja do seu tamanho.",
      "",
      "Quando quiser tirar isso do papel, me chama. A conta não muda; o que muda é quanto tempo ela fica parada.",
    ].join("\n"),
    disqualified: true,
  },
]

/**
 * O rascunho que vai para `crm_forms.draft_schema`.
 *
 * Guarda SÓ o que a tabela de campos não guarda — alias, agrupamento,
 * destino, variável, lógica, finais e settings. Quem junta os dois é
 * `montarVersao`, a mesma função da publicação, tanto no editor quanto
 * no preview. Gravar o schema inteiro funcionaria e criaria uma segunda
 * cópia de cada rótulo e cada opção: editar a pergunta na tela mudaria
 * uma e deixaria a outra, e ninguém saberia qual está sendo lida.
 */
export function rascunhoDoFunil(version = 1): FormSchema {
  const blocks: FormBlock[] = DEFS.map((d) => {
    const logica = LOGICA[d.apelido]
    const proximo = PROXIMO[d.apelido]
    const variavel = VARIAVEL[d.apelido]
    const titulo = TITULO_DA_TELA[d.apelido]
    return {
      ref: REF[d.apelido],
      type: d.field_type as FormBlock["type"],
      label: "",
      alias: d.apelido,
      ...(AGRUPADOS.includes(d.apelido) ? { mesma_tela: true } : {}),
      ...(titulo ? { titulo_da_tela: titulo } : {}),
      ...(variavel ? { variavel } : {}),
      ...(d.apelido === EM_DESTAQUE ? { destaque: true } : {}),
      ...(proximo ? { proximo } : {}),
      ...(logica && logica.length > 0 ? { logic: logica } : {}),
    }
  })

  return {
    version,
    display_mode: "conversational",
    locale: "pt-BR",
    blocks,
    endings: FINAIS,
    hidden_fields: [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "ad_id",
      "adset_id",
      "campaign_id",
    ],
    settings: {
      mostrar_progresso: true,
      enter_avanca: true,
      calculos: CALCULOS,
      /**
       * Sem vídeo, por decisão do dono em 18/09.
       *
       * A abertura tinha sido escrita PARA acompanhar um vídeo de 40
       * segundos: era ele que dizia quem fala e por que o leitor deveria
       * responder. Tirar o vídeo e deixar o texto como estava entregaria
       * uma primeira tela sem nenhuma dessas duas coisas — e a primeira
       * tela é onde a pessoa decide se continua. O roteiro do vídeo não
       * foi jogado fora: ele virou as duas primeiras linhas, com os
       * números que o próprio roteiro afirmava.
       */
      welcome: {
        title: "Seja bem-vindo!",
        description: [
          "Aqui é o Bruno. Comecei no e-commerce há 6 anos com a minha própria loja, e hoje a gente cuida da retenção de mais de 250 lojas, no Brasil, na Europa e nos Estados Unidos.",
          "",
          "Em 7 dias eu coloco no ar a operação de e-mail e SMS da sua loja, com garantia no contrato: 10% do seu faturamento vindo de e-mail em 30 dias.",
          "",
          "Antes de conversar eu preciso entender a sua loja, e no meio do caminho eu te mostro, com os seus números, quanto ela está deixando passar todo mês. Quem lê as respostas sou eu.",
          "",
          "Leva menos de 2 minutos. Bora lá?",
        ].join("\n"),
        button_label: "Vamos lá!",
      },
    },
  }
}

/**
 * O funil inteiro: os campos de hoje mais o rascunho, juntados pela
 * MESMA função que a publicação e o editor chamam.
 *
 * Montar o schema por um caminho próprio produziria um objeto
 * ligeiramente diferente do que o sistema produz — e a diferença
 * apareceria só em produção, no dia em que alguém salvasse pela tela.
 */
export function schemaDoFunil(version = 1): FormSchema {
  return montarVersao(camposDoFunil(), rascunhoDoFunil(version), {
    display_mode: "conversational",
    locale: "pt-BR",
    version,
  }).schema
}
