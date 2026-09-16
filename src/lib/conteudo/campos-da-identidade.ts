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
 * Achado RENDERIZANDO: aplicar o formato da capa da Manchete (`titulo` +
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

import { aceitaCampoOpcional, preservarCamposOpcionais } from "./campos"
import { camposPost } from "./formato-post"
import { camposThread } from "./formato-thread"
import { camposDoTipo } from "./templates"
import type { Campo, DocFrame, FrameTipo } from "./types"

/** Campos de texto que podem receber um parágrafo migrado, em ordem. */
const TEXTO_LONGO: Campo[] = ["corpo", "subtitulo"]

/**
 * Qual DESENHO a identidade usa. Três hoje: o cartão de perfil (print de
 * tweet), o cartão de thread e o desenho da casa, onde o conjunto vem do
 * tipo do frame. Entra como objeto e não como booleano porque um terceiro
 * desenho não cabe num `sim/não` — e o booleano antigo faria o cartão de
 * thread herdar o conjunto do print, com `botao` fantasma no fecho.
 */
export interface DesenhoDeCampos {
  cartaoPerfil: boolean
  cartaoThread: boolean
}

export function camposDaIdentidade(desenho: DesenhoDeCampos, tipo: FrameTipo): Campo[] {
  if (desenho.cartaoThread) return camposThread(tipo)
  return desenho.cartaoPerfil ? camposPost(tipo) : camposDoTipo(tipo)
}

export interface CamposReconciliados {
  campos: Campo[]
  textos: Partial<Record<Campo, string>>
}

/**
 * O que a identidade de destino DESENHA entre os campos opcionais.
 *
 * Não tem valor padrão de propósito: `preservarCamposOpcionais` julga pelo
 * TIPO do frame, e um opcional que só uma família desenha (hoje a caixa de
 * destaque) passaria por ele intacto para dentro de uma identidade que não
 * o desenha — o campo fantasma que `camposOpcionaisDaPeca` fecha no painel,
 * entrando pela outra porta. Chamada nova é obrigada a decidir.
 */
export interface DesenhoDaIdentidade {
  caixaDeDestaque: boolean
}

/**
 * Ajusta o frame ao conjunto de campos da identidade preservando o que
 * está escrito: campo que continua mantém o texto, campo que sai entrega o
 * dele para o primeiro campo longo que entra e está vazio, e os opcionais
 * (gancho, anotação) sobrevivem pela mesma regra de sempre.
 *
 * O opcional que a identidade de destino não desenha sai de `campos` mas o
 * TEXTO fica guardado em `textos` — quem volta para a identidade que o
 * desenha recebe o campo de volta escrito. Apagar seria perder copy na
 * troca de identidade, que é justamente o que este módulo existe para
 * impedir.
 */
export function reconciliarCampos(
  frame: Pick<DocFrame, "tipo" | "campos" | "textos">,
  campos: Campo[],
  desenho: DesenhoDaIdentidade,
): CamposReconciliados {
  const textos: Partial<Record<Campo, string>> = {}
  for (const c of campos) textos[c] = frame.textos[c] ?? ""

  const saiu = frame.campos.filter((c) => !campos.includes(c) && TEXTO_LONGO.includes(c) && (frame.textos[c] ?? "").trim())
  for (const c of saiu) {
    const destino = campos.find((k) => TEXTO_LONGO.includes(k) && !(textos[k] ?? "").trim())
    if (!destino) break
    textos[destino] = frame.textos[c] ?? ""
  }

  const r = preservarCamposOpcionais(frame, frame.tipo, campos, textos)
  return desenho.caixaDeDestaque ? reporCaixaDeDestaque(frame, r) : semCaixaDeDestaque(frame, r)
}

/** Guarda o texto e tira o campo da lista. */
function semCaixaDeDestaque(frame: Pick<DocFrame, "textos">, r: CamposReconciliados): CamposReconciliados {
  if (!r.campos.includes("destaque")) return r
  const guardado = r.textos.destaque ?? frame.textos.destaque
  return {
    campos: r.campos.filter((c) => c !== "destaque"),
    textos: guardado === undefined ? r.textos : { ...r.textos, destaque: guardado },
  }
}

/**
 * Devolve o campo a quem volta para a identidade que o desenha.
 *
 * `preservarCamposOpcionais` só repõe o que está em `anterior.campos`, e a
 * ida tirou de lá — sem este passo o texto ficaria no documento sem campo
 * que o mostre, que é o mesmo fantasma de sinal trocado.
 */
function reporCaixaDeDestaque(frame: Pick<DocFrame, "tipo" | "textos">, r: CamposReconciliados): CamposReconciliados {
  const guardado = (frame.textos.destaque ?? "").trim()
  if (!guardado || r.campos.includes("destaque") || !aceitaCampoOpcional(frame.tipo, "destaque")) return r
  return { campos: [...r.campos, "destaque"], textos: { ...r.textos, destaque: frame.textos.destaque ?? "" } }
}
