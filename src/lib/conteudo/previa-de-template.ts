/**
 * A prévia do template tem de ser o que o template DÁ.
 *
 * Os três lugares que desenham a capa de um template — o card do molde da
 * casa (`template-card`), "Meus templates" na home e "Meus templates" no
 * diálogo de criação — montavam o documento SEM a identidade visual:
 * `novoDocumento`/`documentoDeEstrutura` nascem na família padrão (a azul da
 * casa) e ninguém chamava `aplicarFamilia`. Só que escolher o molde APLICA a
 * identidade que ele pressupõe (`Template.familia`, o `setFamilia` do
 * diálogo), então o "Print de post" — preto, cartão de perfil, sem contador
 * — aparecia na prateleira como um slide azul da casa, e o que o usuário
 * recebia ao clicar era outra peça.
 *
 * O defeito não quebra teste nenhum: as duas telas renderizam um documento
 * válido, só que de outra identidade. É o tipo de divergência que só aparece
 * olhando, e é por isso que ela mora num módulo puro com a regra declarada,
 * em vez de uma chamada a mais espalhada em três componentes.
 *
 * **A identidade do template do time é PERSISTIDA** (`MeuTemplate.familia`).
 * Derivá-la do molde base não basta: o template salvo de um carrossel guarda
 * a estrutura e o molde base, e a identidade é escolha da peça — um "Print
 * de post" montado na paleta da casa e um carrossel da casa montado no preto
 * do print têm o mesmo molde base e capas opostas. Sem a coluna, a prévia
 * volta ao palpite do molde, que é melhor que o azul fixo e ainda assim
 * palpite: por isso `familiaDaPrevia` declara a cascata em vez de escondê-la.
 *
 * Puro e testado — quem desenha é o `frame.tsx`.
 */

import { documentoDeEstrutura, novoDocumento } from "./documento"
import { FAMILIA_PADRAO, aplicarFamilia, ehFamilia } from "./familias"
import { getTemplate } from "./templates"
import type { BrandKit, Documento, FamiliaVisual, MeuTemplate, PerfilEditavel, Template } from "./types"

/**
 * Identidade que um molde da casa pressupõe. Molde sem `familia` declarada
 * é da casa — a maioria — e continua na padrão.
 */
export function familiaDoMolde(templateId: string | undefined): FamiliaVisual {
  if (!templateId) return FAMILIA_PADRAO
  return getTemplate(templateId).familia ?? FAMILIA_PADRAO
}

/**
 * Identidade de um template do time, na ordem em que a informação é
 * confiável: o que foi GRAVADO com ele > o que o molde base pressupõe >
 * a padrão. O meio da cascata existe para os templates criados antes da
 * coluna — sem ele a prateleira mentiria justamente sobre os antigos.
 */
export function familiaDaPrevia(m: Pick<MeuTemplate, "familia" | "templateId">): FamiliaVisual {
  if (ehFamilia(m.familia)) return m.familia
  return familiaDoMolde(m.templateId)
}

/**
 * Onde a legenda do card pousa na capa.
 *
 * O card escreve o nome do molde no título e a descrição na linha de baixo —
 * e "a linha de baixo" muda com a identidade: as famílias da casa desenham
 * `subtitulo` na capa, o cartão de perfil desenha `corpo`. Escrever no campo
 * que o frame não desenha faz a descrição sumir da prévia em silêncio.
 */
export function campoDaLegenda(campos: readonly string[]): "subtitulo" | "corpo" | null {
  if (campos.includes("subtitulo")) return "subtitulo"
  if (campos.includes("corpo")) return "corpo"
  return null
}

/** Prévia de um molde da casa: a capa na identidade que ele pressupõe. */
export function previaDoMolde(tpl: Template, brandKit?: BrandKit): Documento {
  const d = aplicarFamilia(novoDocumento(tpl.nome, "", tpl.id, { brandKit }), familiaDoMolde(tpl.id))
  const capa = d.frames[0]
  if (!capa) return d
  const textos = { ...capa.textos, titulo: tpl.nome }
  const campo = campoDaLegenda(capa.campos)
  if (campo) textos[campo] = tpl.descricao.split(".")[0]
  return { ...d, frames: [{ ...capa, textos }, ...d.frames.slice(1)] }
}

/**
 * Prévia de um template do time: o documento que criar a partir dele
 * produziria, com os textos-guia intactos. Trocar a copy por um rótulo aqui
 * refaria o defeito que este módulo conserta — a prateleira mostraria o que
 * o card quer dizer em vez do que o template entrega.
 */
export function previaDoMeuTemplate(m: Pick<MeuTemplate, "nome" | "estrutura" | "templateId" | "familia">, perfil: PerfilEditavel, brandKit?: BrandKit): Documento {
  return aplicarFamilia(documentoDeEstrutura(m.nome, perfil, m.estrutura, { templateBase: m.templateId, brandKit }), familiaDaPrevia(m))
}
