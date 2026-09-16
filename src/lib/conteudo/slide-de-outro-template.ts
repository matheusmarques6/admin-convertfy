/**
 * Pegar um slide emprestado de outro molde.
 *
 * A prateleira decide a sequência inteira na criação, e depois disso o
 * editor só oferecia "Adicionar" (um slide de texto em branco) e "Trocar"
 * (tipo e variação). Faltava o gesto do meio: *quero o passo daquele
 * outro molde aqui* — a capa de um, o "Por que funciona" de outro.
 *
 * Duas ações, e a diferença entre elas é o que acontece com a COPY:
 *
 * - `importarSlide` INSERE um passo novo, com o texto-guia do tipo. Não há
 *   copy do molde de origem: molde é forma, não conteúdo.
 * - `aplicarSlideNoFrame` TROCA a forma do slide onde o operador está e
 *   **preserva o que ele escreveu**. É o "usar outro formato de capa":
 *   trocar o desenho não pode custar o texto.
 *
 * Regras que erram em silêncio, todas travadas por teste:
 *
 * 1. **O `frameId` importado é NOVO.** `fundoPorFrame`, `estilos` e as
 *    imagens são chaveados por ele, e os moldes usam `f1`, `f2`… — reusar
 *    o id de origem sobrescreveria o fundo e o estilo do slide que já
 *    ocupa aquele id no documento.
 * 2. **A identidade é a do DESTINO.** O slide entra desenhado pela família
 *    do documento; trazer o preto da Manchete para dentro de um carrossel Post
 *    seria importar uma segunda identidade sem ninguém ter escolhido. Por
 *    isso o fundo sai de `ritmoDeFundos`, e não do molde de origem.
 * 3. **Slot de imagem só onde o tipo DESENHA foto** (`tipoDesenhaImagem`):
 *    `dado` e `cta` não têm lugar para imagem, e marcar o slot ali grava
 *    uma foto que nunca aparece na tela.
 */

import { comHistorico, novoId, textosGuia, trocarTipoFrame } from "./documento"
import { FAMILIAS, familiaDe, ritmoDeFundos, tracoDe } from "./familias"
import { camposDaIdentidade, reconciliarCampos } from "./campos-da-identidade"
import { tipoDesenhaImagem } from "./referencia-para-documento"
import { ST_TEMPLATES } from "./templates"
import type { DocFrame, Documento, FrameTipo, Template } from "./types"

export interface SlideImportavel {
  templateId: string
  templateNome: string
  /** Id do frame NO MOLDE DE ORIGEM — endereço, nunca o id do frame novo. */
  origemId: string
  label: string
  tipo: FrameTipo
  slotsImagem: 0 | 1
}

function doTemplate(t: Template): SlideImportavel[] {
  return t.frames.map((f) => ({
    templateId: t.id,
    templateNome: t.nome,
    origemId: f.id,
    label: f.label,
    tipo: f.tipo,
    slotsImagem: f.slotsImagem,
  }))
}

/**
 * Os slides dos OUTROS moldes, agrupados pelo molde de origem.
 *
 * O molde do próprio documento fica de fora: a sequência dele já está na
 * peça, e oferecê-lo de novo é o botão que não leva a lugar nenhum.
 */
export function slidesDeOutrosMoldes(templateIdAtual: string): Array<{ template: Template; slides: SlideImportavel[] }> {
  return ST_TEMPLATES.filter((t) => t.id !== templateIdAtual).map((t) => ({ template: t, slides: doTemplate(t) }))
}

/**
 * Os slides de outros moldes que servem NESTE lugar — os do mesmo tipo.
 *
 * Trocar um slide de texto pela capa de outro molde mudaria o papel dele
 * na sequência, não o formato; o operador pediu outro desenho para o
 * mesmo passo. Quem quer mudar o papel tem "Tipo de frame" ao lado.
 */
export function formatosParaOTipo(templateIdAtual: string, tipo: FrameTipo): SlideImportavel[] {
  return slidesDeOutrosMoldes(templateIdAtual).flatMap((g) => g.slides.filter((s) => s.tipo === tipo))
}

function frameImportado(s: SlideImportavel, cartaoPerfil: boolean): DocFrame {
  // Os campos são os da IDENTIDADE DE DESTINO, não os do molde de origem:
  // a capa da Manchete tem subtítulo e o cartão de perfil não o desenha — o
  // texto-guia nasceria invisível.
  const campos = camposDaIdentidade(cartaoPerfil, s.tipo)
  return {
    frameId: novoId("f"),
    tipo: s.tipo,
    label: s.label,
    slotsImagem: s.slotsImagem && tipoDesenhaImagem(s.tipo) ? 1 : 0,
    campos,
    textos: textosGuia(s.tipo, campos),
    imagens: {},
  } satisfies DocFrame
}

/**
 * Onde o slide novo entra quando ninguém diz: antes do CTA final, como
 * "Adicionar" já fazia. Entrar depois do fecho deixaria o carrossel com um
 * slide órfão atrás da chamada.
 */
export function posicaoPadrao(doc: Documento): number {
  const n = doc.frames.length
  return n && doc.frames[n - 1].tipo === "cta" ? n - 1 : n
}

/** Insere um slide de outro molde no documento. */
export function importarSlide(doc: Documento, s: SlideImportavel, posicao?: number): Documento {
  const pos = Math.max(0, Math.min(posicao ?? posicaoPadrao(doc), doc.frames.length))
  const nf = frameImportado(s, tracoDe(familiaDe(doc)).cartaoPerfil)
  const frames = [...doc.frames]
  frames.splice(pos, 0, nf)
  return comHistorico(
    ritmoDeFundos({
      ...doc,
      frames,
      // Fundo provisório da família do destino; `ritmoDeFundos` decide o
      // definitivo nas identidades cujo fundo é função da posição.
      fundoPorFrame: { ...doc.fundoPorFrame, [nf.frameId]: FAMILIAS[familiaDe(doc)].fundoClaro },
    }),
    `“${s.label}” importado de ${s.templateNome}`,
  )
}

/**
 * Aplica o FORMATO de um slide de outro molde no frame atual, mantendo a
 * copy. O `frameId` não muda — é ele que carrega fundo, estilo e imagem, e
 * trocá-lo aqui apagaria os três de um slide que o operador só queria
 * redesenhar.
 */
export function aplicarSlideNoFrame(doc: Documento, i: number, s: SlideImportavel): Documento {
  const atual = doc.frames[i]
  if (!atual) return doc
  // Trocar o FORMATO não mexe no conjunto de campos: ele é da identidade do
  // documento, e recompô-lo a partir do molde de origem descartava o
  // parágrafo do operador (achado renderizando — a capa da Manchete apagava o
  // corpo de um carrossel Post). Quando o TIPO muda, quem decide os campos
  // é `trocarTipoFrame`, que já preserva o texto.
  const comTipo = atual.tipo === s.tipo ? doc : trocarTipoFrame(doc, i, s.tipo)
  const f = comTipo.frames[i]
  const { campos, textos } = reconciliarCampos(f, camposDaIdentidade(tracoDe(familiaDe(doc)).cartaoPerfil, s.tipo))
  const slot = (s.slotsImagem && tipoDesenhaImagem(s.tipo) ? 1 : 0) as 0 | 1
  return comHistorico(
    {
      ...comTipo,
      frames: comTipo.frames.map((x, j) =>
        j === i
          ? {
              ...x,
              label: s.label,
              campos,
              textos,
              slotsImagem: slot,
              // A imagem FICA mesmo quando o formato novo não tem slot:
              // ela some do canvas e volta inteira se o operador desfizer
              // ou religar o slot. Apagá-la aqui perderia o upload.
              imagens: x.imagens,
              // A variação volta ao padrão: ela endereça o desenho do molde
              // anterior, e mantê-la deixaria a pose do formato novo errada.
              variante: undefined,
            }
          : x,
      ),
      // Histórico: o documento continua sendo do molde dele. Um slide
      // emprestado não muda o molde da peça, e gravar o contrário faria a
      // ficha e o painel de moldes mentirem sobre a origem.
    },
    `${atual.label}: formato de “${s.label}” (${s.templateNome})`,
  )
}
