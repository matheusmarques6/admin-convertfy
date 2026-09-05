/**
 * Dados MOCK do Estúdio — documento demo completo, biblioteca inicial,
 * prompts prontos e templates do time. Só `data.ts` lê daqui.
 */

import { BRAND_KIT_PADRAO, CORES_PADRAO, GRADIENTE_PADRAO, SLIDE } from "../brand"
import { frameDoTemplate, novoDocumento } from "../documento"
import { getTemplate } from "../templates"
import type { Documento, ImagemSlot, MeuTemplate, PerfilEditavel } from "../types"
import { CT_LEGENDA } from "./dashboard"

export const ST_IMG = (seed: string) => `https://picsum.photos/seed/${seed}/1080/1350`

export const stImg = (url: string): ImagemSlot => ({ url, zoom: 100, x: 0, y: 0, larguraSlot: 1080, alturaSlot: 1350 })

/** Sugestões do banco de imagens para um frame (3 opções). */
export const ST_SUGESTOES_IMG = (frameId: string) =>
  [1, 2, 3].map((i) => `https://picsum.photos/seed/sug${frameId}${i}/540/675`)

const T0 = "2026-09-02T14:12:00-03:00"

function docInit(): Documento {
  const t = getTemplate("molde-turbo")
  const textos: Record<string, Record<string, string>> = {
    f1: { titulo: "8% dos clientes fazem 41% do faturamento", subtitulo: "e a maioria das lojas trata todo mundo igual" },
    f2: { titulo: "41%", corpo: "da receita vem de menos de 1 em cada 10 clientes. Fonte: Smile.io, 2026." },
    f3: { titulo: "Você sabe quem são os seus 8%?", corpo: "Se a resposta é não, sua estratégia de e-mail está no escuro. Reter um cliente desses vale mais que adquirir cinco novos." },
    f4: { titulo: "Segmentação por valor", corpo: "Separe a base em faixas de LTV e trate cada faixa com uma cadência própria. Acesso antecipado, sem cupom. O privilégio é o produto." },
    f5: { titulo: "Boutique Solar: +R$ 31K por mês", corpo: "Em 60 dias, só reorganizando quem recebe o quê." },
    f6: { titulo: "O custo de não fazer", corpo: "Cada mês sem segmentar é receita recorrente que não volta. Continuar disparando para todos ou começar pelos 8%." },
    f7: { titulo: "Comente 8%", subtitulo: "e eu te mando o modelo de segmentação que usamos nas 250 lojas.", botao: "Comente 8%" },
  }
  const imagens: Record<string, string> = { f1: ST_IMG("cfcapa8"), f4: ST_IMG("cfseg4"), f5: ST_IMG("cfprova5") }
  return {
    id: "d1",
    nome: "8% dos clientes fazem 41% do faturamento",
    projeto: "Convertfy · setembro",
    templateId: t.id,
    perfil: "convertfy",
    proporcaoExport: "4:5",
    status: "rascunho",
    versao: "v2",
    data: "03/09",
    brandKit: { ...BRAND_KIT_PADRAO.convertfy },
    ocultos: {},
    cores: { ...CORES_PADRAO },
    fundoPorFrame: { f1: "gradiente", f2: SLIDE.fundoClaro, f3: SLIDE.fundoClaro, f4: SLIDE.escuro, f5: "gradiente", f6: SLIDE.fundoClaro, f7: "gradiente" },
    gradiente: { ...GRADIENTE_PADRAO },
    cta: { mostrar: true, texto: "Comente 8%", fundo: SLIDE.escuro, cor: "#FFFFFF" },
    estilos: {},
    frames: t.frames.map((tf) => ({
      ...frameDoTemplate(tf),
      textos: textos[tf.id],
      imagens: imagens[tf.id] ? { slot1: stImg(imagens[tf.id]) } : {},
    })),
    legenda: CT_LEGENDA,
    palavraChave: "8%",
    historico: [
      { id: "h4", label: "Headline melhorada (variação 2)", ts: "03/09 · 09:41" },
      { id: "h3", label: "Imagem adicionada na capa", ts: "02/09 · 14:20" },
      { id: "h2", label: "Estrutura gerada pela ConvertIA", ts: "02/09 · 14:13" },
      { id: "h1", label: "Documento criado a partir do template Turbo", ts: "02/09 · 14:12" },
    ],
    criadoEm: T0,
    atualizadoEm: "2026-09-03T09:41:00-03:00",
  }
}

function docDemo(
  id: string,
  nome: string,
  perfil: PerfilEditavel,
  templateId: string,
  status: Documento["status"],
  data: string,
  seed: string,
  agenda?: Documento["agenda"],
): Documento {
  const d = novoDocumento(nome, perfil, templateId, { agora: new Date(T0) })
  d.id = id
  d.status = status
  d.data = data
  d.frames[0].textos.titulo = nome
  d.frames[0].imagens.slot1 = stImg(ST_IMG(seed))
  d.historico = [{ id: `${id}h1`, label: `Documento criado a partir do template ${getTemplate(templateId).nome}`, ts: `${data} · 10:00` }]
  if (agenda) d.agenda = agenda
  return d
}

/** Biblioteca inicial (semeada uma vez no armazenamento local). */
export function bibliotecaInicial(): Documento[] {
  return [
    docInit(),
    docDemo("d2", "A Sephora cresceu 75% em fidelidade sem desconto", "convertfy", "molde-benchmark", "publicado", "22/08", "cfseph"),
    docDemo("d3", "Os 4 e-mails que toda loja deveria ter no pós-compra", "convertfy", "molde-lista", "agendado", "05/09", "cfpos4", { perfil: "convertfy", data: "05/09", hora: "11:30" }),
    docDemo("d4", "Como eu leio o relatório de e-mail em 10 minutos", "bruno", "molde-mec", "pronto", "03/09", "cfrel10"),
    docDemo("d5", "Por que a maioria dos fluxos de carrinho perde dinheiro", "bruno", "molde-turbo", "rascunho", "02/09", "cfcart"),
    docDemo("d6", "O que eu fiz para dobrar a receita de SMS da FERATTO", "bruno", "molde-bastidor", "rascunho", "01/09", "cfsms"),
  ]
}

/** O documento demo (textos completos) — referência para a IA em fallback e para prévias. */
export const DOC_REFERENCIA = docInit

export interface PromptPronto {
  n: string
  d: string
  tpl: string
  pilar: string
  /** Pauta completa que o prompt envia para a IA. */
  pauta: string
}

export const ST_PROMPTS_IA: PromptPronto[] = [
  { n: "Foto de produto editorial", d: "Produto em cena premium, luz natural, 6 slides com benefício por slide", tpl: "molde-lista", pilar: "Educacional", pauta: "Carrossel com um benefício por slide sobre como apresentar produto em cena premium no e-mail e no Instagram: luz natural, fundo limpo, ângulo consistente, texto curto. Público: donos de e-commerce de moda e beleza. Tom direto e prático." },
  { n: "Case de cliente com número", d: "Resultado forte na capa, mecanismo em 3 slides, prova e CTA", tpl: "molde-benchmark", pilar: "Case", pauta: "Case de cliente da Convertfy com número forte na capa, três slides explicando o mecanismo que gerou o resultado, um slide de prova com o dado e CTA com comment gate. Público: donos de e-commerce que faturam acima de R$ 100 mil por mês." },
  { n: "Mito vs. verdade", d: "Afirmação comum, dado que derruba, o que fazer no lugar", tpl: "molde-turbo", pilar: "Educacional", pauta: "Derrubar um mito comum do e-mail marketing para e-commerce: começar pela afirmação que todo mundo repete, mostrar o dado que derruba, explicar o que fazer no lugar e fechar com convite. Tom direto, sem jargão." },
  { n: "Bastidor da operação", d: "O que fizemos por dentro, em primeira pessoa, com convite no fim", tpl: "molde-bastidor", pilar: "Bastidor", pauta: "Bastidor em primeira pessoa: o que fizemos por dentro numa loja cliente para dobrar a receita de um canal, decisões, erros e o que funcionou. Fechar com convite para conversa no direct." },
]

export function meusTemplatesIniciais(): MeuTemplate[] {
  return [
    { id: "meu-1", nome: "Editorial preto e branco", origem: "inspiração", frames: 8, usos: 3, seed: "meutpl1", templateId: "molde-benchmark", criadoEm: "2026-08-20T10:00:00-03:00" },
    { id: "meu-2", nome: "Depoimento com foto", origem: "inspiração", frames: 6, usos: 1, seed: "meutpl2", templateId: "molde-bastidor", criadoEm: "2026-08-27T10:00:00-03:00" },
  ]
}

/** Estrutura "detectada" numa inspiração quando a IA não está disponível. */
export const ESTRUTURA_INSPIRACAO_FALLBACK: Array<[string, string]> = [
  ["Capa", "imagem full + título 2 linhas"],
  ["Dado", "número gigante + apoio serif"],
  ["Texto", "título + corpo, fundo claro"],
  ["Texto", "título + corpo + imagem"],
  ["Prova", "citação sobre foto escura"],
  ["Texto", "título + corpo"],
  ["CTA", "gradiente + pílula"],
]
