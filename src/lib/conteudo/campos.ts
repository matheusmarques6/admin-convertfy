/**
 * Campos OPCIONAIS do slide: o gancho (a serif itálica que faz par com o
 * título) e a anotação à mão. Não vêm no molde — o operador liga por slide.
 *
 * Esta é a fonte única de "onde o renderer desenha cada um", e existe por
 * dois defeitos que ela fecha:
 *
 * 1. **Campo fantasma.** O painel oferecia anotação em capa e prova, onde
 *    `frame.tsx` não a desenha: o texto era gravado, sumia da tela e não
 *    havia como descobrir por quê.
 * 2. **Campo apagado em silêncio.** Trocar o TIPO do slide ou o TEMPLATE
 *    reconstrói `campos` a partir do molde, e o gancho escrito pelo
 *    usuário ia junto com o texto. Perder o que alguém escreveu, sem
 *    aviso, é o pior desfecho possível.
 *
 * Mexer aqui sem mexer no renderer volta a criar o campo fantasma — o
 * teste compara esta tabela com os tipos que o `frame.tsx` desenha.
 */

import type { Campo, DocFrame, FrameTipo } from "./types"

export type CampoOpcional = "gancho" | "anotacao" | "destaque"

export const CAMPOS_OPCIONAIS: CampoOpcional[] = ["gancho", "anotacao", "destaque"]

/** Onde o `frame.tsx` desenha cada campo opcional. */
const DESENHA: Record<CampoOpcional, FrameTipo[]> = {
  gancho: ["capa", "dado", "texto", "prova", "lista", "mec"],
  anotacao: ["dado", "texto", "lista", "mec"],
  // A CAIXA sólida de destaque é a assinatura da identidade Manchete e o
  // renderer só a desenha lá (`traco.caixaDeDestaque`) — por isso ela
  // também é filtrada por FAMÍLIA em `camposOpcionaisDaPeca`. Aqui fica o
  // recorte por tipo: na capa e no fecho ela competiria com o próprio
  // título, que já é o bloco de impacto do slide.
  destaque: ["dado", "texto", "prova", "lista", "mec"],
}

export const CAMPO_OPCIONAL_LABEL: Record<CampoOpcional, string> = {
  gancho: "Gancho",
  anotacao: "Anotação",
  destaque: "Caixa de destaque",
}

/** Texto-guia de quando o campo nasce (o operador substitui). */
export const CAMPO_OPCIONAL_GUIA: Record<CampoOpcional, string> = {
  gancho: "a linha que prepara",
  anotacao: "e é aqui que trava",
  destaque: "a frase que fica na cabeça",
}

export function ehCampoOpcional(campo: Campo): campo is CampoOpcional {
  return campo === "gancho" || campo === "anotacao" || campo === "destaque"
}

export function aceitaCampoOpcional(tipo: FrameTipo, campo: CampoOpcional): boolean {
  return DESENHA[campo].includes(tipo)
}

/** Os opcionais que ESTE tipo de slide sabe desenhar. */
export function camposOpcionaisDoTipo(tipo: FrameTipo): CampoOpcional[] {
  return CAMPOS_OPCIONAIS.filter((c) => aceitaCampoOpcional(tipo, c))
}

/**
 * O que a identidade desenha entre os opcionais.
 *
 * `opcionais: false` é o caso das identidades que simulam uma REDE (os dois
 * prints, o cartão de thread e o cartão completo do X): o renderer delas tem
 * UM desenho — cabeçalho, texto, foto — e não desenha gancho, anotação nem
 * caixa em lugar nenhum. Oferecê-los ali era o campo fantasma deste módulo,
 * pela outra porta e desde antes da caixa existir.
 */
export interface DesenhoDosOpcionais {
  caixaDeDestaque: boolean
  cartaoPerfil: boolean
  cartaoThread: boolean
  cartaoTweet: boolean
}

export function desenhaOpcionais(traco: DesenhoDosOpcionais): boolean {
  return !traco.cartaoPerfil && !traco.cartaoThread && !traco.cartaoTweet
}

/**
 * Os opcionais que ESTE slide, NESTA identidade, sabe desenhar.
 *
 * O recorte por tipo não basta desde que a caixa de destaque entrou: ela é
 * desenhada só onde a família a declara, e oferecê-la nas outras criaria o
 * campo fantasma que este módulo existe para impedir — o operador escreve,
 * o texto é gravado e nunca aparece na tela.
 */
export function camposOpcionaisDaPeca(tipo: FrameTipo, traco: DesenhoDosOpcionais): CampoOpcional[] {
  if (!desenhaOpcionais(traco)) return []
  return camposOpcionaisDoTipo(tipo).filter((c) => c !== "destaque" || traco.caixaDeDestaque)
}

/**
 * Carrega para o slide novo os campos opcionais que o anterior tinha — e
 * que o tipo novo desenha. O texto vem junto; sem ele o campo apareceria
 * vazio, o que não é o que o usuário escreveu nem o que ele apagaria.
 */
export function preservarCamposOpcionais(
  anterior: Pick<DocFrame, "campos" | "textos">,
  tipoNovo: FrameTipo,
  campos: Campo[],
  textos: Partial<Record<Campo, string>>,
): { campos: Campo[]; textos: Partial<Record<Campo, string>> } {
  let cs = campos
  let ts = textos
  for (const c of CAMPOS_OPCIONAIS) {
    if (!anterior.campos.includes(c)) continue
    if (!aceitaCampoOpcional(tipoNovo, c)) continue
    if (!cs.includes(c)) cs = [...cs, c]
    const texto = anterior.textos[c]
    if (texto !== undefined) ts = { ...ts, [c]: texto }
  }
  return { campos: cs, textos: ts }
}
