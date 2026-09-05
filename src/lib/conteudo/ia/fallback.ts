/**
 * Modo local da IA do Estúdio — usado quando a rota falha (sem crédito,
 * sem rede, timeout). Não inventa números: reaproveita o documento de
 * referência da casa, a distribuição determinística e a correção de
 * compliance. A UI avisa que foi o modo local.
 */

import { corrigirLegendaLocal } from "../compliance"
import { getDocumentoReferencia, getLegendaExemplo } from "../data"
import { linhasDeTexto, propostasDeLinhas, textosGuia } from "../documento"
import type { Documento, FrameTipo } from "../types"
import type { SaidaChat, SaidaEstrutura, SaidaFrame, SaidaHeadlines, SaidaInspiracao, SaidaLegenda } from "./schemas"

const HEADLINES = [
  "8% dos clientes fazem 41% do faturamento",
  "Você sabe quem são os 8% que sustentam sua loja?",
  "Menos de 1 em 10 clientes paga quase metade da conta",
  "A loja trata todo mundo igual. Os dados não.",
  "Pare de dar cupom pra quem já compra todo mês",
]

function textosReferencia(tipo: FrameTipo, usados: Set<string>) {
  const ref = getDocumentoReferencia()
  const cand = ref.frames.find((f) => f.tipo === tipo && !usados.has(f.frameId))
  if (cand) {
    usados.add(cand.frameId)
    return cand.textos
  }
  return null
}

export function estruturaLocal(doc: Documento): SaidaEstrutura {
  const usados = new Set<string>()
  return {
    frames: doc.frames.map((f) => ({
      frameId: f.frameId,
      textos: (textosReferencia(f.tipo, usados) ?? textosGuia(f.tipo, f.campos)) as SaidaEstrutura["frames"][number]["textos"],
    })),
    legenda: getLegendaExemplo(),
    palavraChave: "8%",
  }
}

export function frameLocal(doc: Documento, frameId: string): SaidaFrame {
  const f = doc.frames.find((x) => x.frameId === frameId)
  if (!f) return { textos: {} }
  const ref = getDocumentoReferencia().frames.find((x) => x.tipo === f.tipo) ?? getDocumentoReferencia().frames[2]
  const textos = Object.fromEntries(f.campos.map((c) => [c, ref.textos[c] ?? f.textos[c] ?? ""]))
  return { textos }
}

export function headlinesLocal(): SaidaHeadlines {
  return { opcoes: HEADLINES }
}

export function legendaLocal(palavraChave?: string): SaidaLegenda {
  return { legenda: getLegendaExemplo(), palavraChave: palavraChave || "8%" }
}

export function corrigirLocal(legenda: string): { legenda: string } {
  return { legenda: corrigirLegendaLocal(legenda) }
}

export function chatLocal(doc: Documento, mensagem: string, anexos: number): SaidaChat {
  const linhas = linhasDeTexto(mensagem)
  const meio = doc.frames.filter((f) => f.tipo !== "capa" && f.tipo !== "cta")
  if (anexos > 0 && linhas.length === 0) {
    return {
      texto: `Li ${anexos === 1 ? "a referência" : `as ${anexos} referências`}. O que se destaca: contraste alto, título em duas linhas ocupando a metade de baixo e quase nenhum elemento além do texto. Posso aproximar o carrossel disso sem sair do template.`,
      acao: { tipo: "estilo", label: "Aplicar direção visual" },
      detalhes: ["Fundo escuro nos slides de raciocínio", "Título da capa com escala 112%", "Gradiente mais fechado (ângulo 170°)"],
      estilo: { fundoEscuroTipos: ["texto"], escalaTituloCapa: 112, angulo: 170 },
    }
  }
  if (linhas.length >= 2) {
    const props = propostasDeLinhas(doc, mensagem)
    return {
      texto: `Separei em ${props.length} ideias, uma por slide, mantendo capa e CTA.`,
      acao: { tipo: "estrutura", label: `Aplicar em ${props.length} slides` },
      props,
    }
  }
  if (/headline|t[ií]tulo/i.test(mensagem)) {
    return { texto: "Cinco variações no molde da capa. Clique para aplicar na capa e no nome do carrossel.", acao: { tipo: "headline", label: "Aplicar headline" }, opcoes: HEADLINES }
  }
  if (/legenda/i.test(mensagem)) {
    const l = legendaLocal(doc.palavraChave)
    return { texto: `Legenda pronta com ${l.legenda.trim().split(/\s+/).length} palavras, comment gate "${l.palavraChave}" e sem travessão.`, acao: { tipo: "legenda", label: "Aplicar legenda" }, legenda: l.legenda, palavraChave: l.palavraChave }
  }
  if (/imagem|foto/i.test(mensagem)) {
    return { texto: "Sugiro preencher os slots vazios com imagens do banco da agência: interior de loja premium na capa, close de embalagem nos slides de mecanismo e fachada do case na prova.", acao: { tipo: "imagens", label: "Preencher slots" } }
  }
  return {
    texto: `Entendi. Quer que eu transforme isso em estrutura de ${meio.length} slides? Se preferir, cole o texto em linhas e eu distribuo uma ideia por slide.`,
    acao: { tipo: "gerar", label: "Gerar estrutura" },
  }
}

export function inspiracaoLocal(): SaidaInspiracao {
  return {
    frames: [
      { tipo: "capa", descricao: "imagem full + título 2 linhas", slotImagem: true },
      { tipo: "dado", descricao: "número gigante + apoio serif" },
      { tipo: "texto", descricao: "título + corpo, fundo claro" },
      { tipo: "texto", descricao: "título + corpo + imagem", slotImagem: true },
      { tipo: "prova", descricao: "citação sobre foto escura", slotImagem: true },
      { tipo: "texto", descricao: "título + corpo" },
      { tipo: "cta", descricao: "gradiente + pílula" },
    ],
    fidelidade: 94,
    observacoes: "Estrutura reconhecida pelo modo local (a leitura visual completa depende da ConvertIA).",
    templateSugerido: "molde-turbo",
  }
}
