/**
 * Quais campos de texto um slide TEM — decidido pela identidade, não pelo
 * molde.
 *
 * O renderer do cartão de perfil (as duas famílias de print) desenha
 * `titulo` e `corpo`, e só; as famílias da casa desenham o conjunto do tipo
 * (a capa com `subtitulo`, o CTA com `botao`). `camposPost` já declarava
 * isso e **nada consumia**: o conjunto vinha do molde, então bastava um
 * slide chegar de outro lugar para o texto cair num campo que aquela
 * identidade não desenha — presente no documento, invisível na tela, sem
 * erro nenhum.
 *
 * Achado RENDERIZANDO: aplicar o formato da capa da Neon (`titulo` +
 * `subtitulo`) num carrossel Post apagou o parágrafo da tela.
 *
 * A outra metade é a MIGRAÇÃO: quando um campo de texto sai e outro entra,
 * o que estava escrito vai para o que fica. Sem isso, trocar de identidade
 * e voltar perderia o parágrafo no caminho — e perder copy é o que estas
 * funções existem para impedir.
 *
 * `cartaoPerfil` entra como booleano (e não a família) de propósito: é o
 * que quebra o ciclo de importação com `familias.ts`, que também chama
 * daqui.
 */

import { preservarCamposOpcionais } from "./campos"
import { camposPost } from "./formato-post"
import { camposDoTipo } from "./templates"
import type { Campo, DocFrame, FrameTipo } from "./types"

/** Campos de texto que podem receber um parágrafo migrado, em ordem. */
const TEXTO_LONGO: Campo[] = ["corpo", "subtitulo"]

export function camposDaIdentidade(cartaoPerfil: boolean, tipo: FrameTipo): Campo[] {
  return cartaoPerfil ? camposPost(tipo) : camposDoTipo(tipo)
}

export interface CamposReconciliados {
  campos: Campo[]
  textos: Partial<Record<Campo, string>>
}

/**
 * Ajusta o frame ao conjunto de campos da identidade preservando o que
 * está escrito: campo que continua mantém o texto, campo que sai entrega o
 * dele para o primeiro campo longo que entra e está vazio, e os opcionais
 * (gancho, anotação) sobrevivem pela mesma regra de sempre.
 */
export function reconciliarCampos(frame: Pick<DocFrame, "tipo" | "campos" | "textos">, campos: Campo[]): CamposReconciliados {
  const textos: Partial<Record<Campo, string>> = {}
  for (const c of campos) textos[c] = frame.textos[c] ?? ""

  const saiu = frame.campos.filter((c) => !campos.includes(c) && TEXTO_LONGO.includes(c) && (frame.textos[c] ?? "").trim())
  for (const c of saiu) {
    const destino = campos.find((k) => TEXTO_LONGO.includes(k) && !(textos[k] ?? "").trim())
    if (!destino) break
    textos[destino] = frame.textos[c] ?? ""
  }

  return preservarCamposOpcionais(frame, frame.tipo, campos, textos)
}
