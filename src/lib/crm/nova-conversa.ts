/**
 * Quem pode puxar a PRIMEIRA mensagem — e por qual caminho.
 *
 * O inbox nasceu só para responder: a conversa existia porque o contato
 * escreveu. Iniciar do nosso lado é outro problema, porque a janela de
 * atendimento está FECHADA por definição — ninguém escreveu ainda — e cada
 * canal reage a isso de um jeito:
 *
 *  - `evolution` (Baileys, não-oficial): free-form sempre, sem templates.
 *    Texto livre funciona. É o número da loja falando pelo aparelho.
 *  - `whatsapp_cloud` (Meta oficial): fora da janela a Meta SÓ aceita
 *    template aprovado. Oferecer caixa de texto aqui entrega uma mensagem
 *    que é recusada — e hoje isso já acontece calado.
 *  - `instagram`: tem janela de 24h e NÃO tem template
 *    (`service-window-bar.tsx`). Não existe caminho: o contato precisa
 *    escrever primeiro.
 *
 * A regra dos dois primeiros está declarada em `whatsapp/channel-client.ts`;
 * este módulo é a leitura dela do lado da UI, isolada e testável, para que a
 * tela nunca ofereça um caminho que o provedor recusa.
 *
 * O que o modal faz com isso: abre a CONVERSA no canal escolhido, e o
 * envio acontece no composer completo do inbox (texto, imagem, áudio,
 * arquivo, template). Pedir a mensagem dentro do modal limitaria a
 * primeira mensagem a texto — justamente a que costuma ser um áudio ou
 * um catálogo.
 *
 * Módulo PURO — sem I/O, sem React.
 */

/** Como a primeira mensagem pode sair, quando pode. */
export type CaminhoDeAbertura = "texto_livre" | "template"

export interface CanalParaAbertura {
  id: string
  type: string
  display_name: string
  /** `whatsapp_cloud` | `evolution` — ausente em canais não-WhatsApp. */
  provider?: string | null
  is_active?: boolean
  /**
   * Só de canal Evolution; `open` é o único estado que entrega mensagem.
   * O GET de canais devolve a string literal `"unknown"` quando a config
   * não guardou o estado — que é ausência de informação, não desconexão.
   */
  connection_state?: string | null
}

export interface CanalAvaliado {
  canal: CanalParaAbertura
  pode: boolean
  /** Como abrir, quando `pode`. */
  caminho?: CaminhoDeAbertura
  /**
   * Por que NÃO pode — texto de gente, para a tela mostrar no lugar do
   * canal em vez de simplesmente omiti-lo. Canal que some sem explicação
   * vira "o sistema está quebrado".
   */
  motivo?: string
}

/**
 * Avalia UM canal. Nunca inventa capacidade: provedor desconhecido é
 * recusado, porque o custo de errar é uma mensagem rejeitada pela
 * plataforma que o atendente não consegue explicar.
 */
export function avaliarCanal(canal: CanalParaAbertura): CanalAvaliado {
  if (canal.is_active === false) {
    return { canal, pode: false, motivo: "canal desativado" }
  }

  if (canal.type === "instagram") {
    return {
      canal,
      pode: false,
      motivo:
        "o Instagram não permite iniciar conversa — só dá para responder depois que a pessoa escrever",
    }
  }

  if (canal.type !== "whatsapp") {
    return { canal, pode: false, motivo: `canal de ${canal.type} não envia mensagem` }
  }

  if (canal.provider === "evolution") {
    // `connection_state` só existe no Evolution. Desconhecido PASSA — o
    // GET devolve a string `"unknown"` quando a config não guardou o
    // estado, e bloquear por falta de informação esconderia o canal que
    // funciona. Se estiver mesmo fora do ar, o envio falha com a
    // mensagem do provedor, que diz mais que um sumiço na lista.
    const estado = canal.connection_state
    if (estado && estado !== "open" && estado !== "unknown") {
      return {
        canal,
        pode: false,
        motivo: `número desconectado (${estado}) — reconecte em Canais`,
      }
    }
    return { canal, pode: true, caminho: "texto_livre" }
  }

  if (canal.provider === "whatsapp_cloud") {
    return { canal, pode: true, caminho: "template" }
  }

  return { canal, pode: false, motivo: "provedor não reconhecido" }
}

export interface CanaisParaAbertura {
  /** Prontos para iniciar, na ordem em que devem aparecer. */
  disponiveis: CanalAvaliado[]
  /** Recusados, com o motivo — a tela mostra, não esconde. */
  bloqueados: CanalAvaliado[]
}

/**
 * Separa a lista de canais do inbox entre quem pode e quem não pode abrir
 * conversa. Evolution vem primeiro entre os disponíveis: é o caminho sem
 * fricção (texto livre), enquanto o Cloud exige escolher um template.
 */
export function separarCanais(canais: CanalParaAbertura[]): CanaisParaAbertura {
  const avaliados = canais.map(avaliarCanal)
  const peso = (a: CanalAvaliado) => (a.caminho === "texto_livre" ? 0 : 1)
  return {
    disponiveis: avaliados.filter((a) => a.pode).sort((a, b) => peso(a) - peso(b)),
    bloqueados: avaliados.filter((a) => !a.pode),
  }
}

/**
 * O aviso que a tela mostra quando NENHUM canal pode iniciar.
 *
 * Devolve null quando há canal disponível — a ausência de aviso é o caso
 * normal e não deve virar string vazia na tela.
 */
export function motivoDeNenhumCanal(sep: CanaisParaAbertura): string | null {
  if (sep.disponiveis.length > 0) return null
  if (sep.bloqueados.length === 0) {
    return "Nenhum canal conectado. Conecte um número em Canais para iniciar conversas."
  }
  const so_instagram = sep.bloqueados.every((b) => b.canal.type === "instagram")
  if (so_instagram) {
    return "Só há canais de Instagram conectados, e o Instagram não permite iniciar conversa — a pessoa precisa escrever primeiro."
  }
  return "Nenhum canal pode iniciar conversa agora. Confira os motivos abaixo."
}

/**
 * O que o atendente vai encontrar quando a conversa abrir.
 *
 * A conversa abre no composer COMPLETO do inbox, então o texto tem de
 * dizer o que estará disponível lá — e, no Cloud, POR QUE a caixa de
 * texto aparece bloqueada. Sem isso a restrição parece defeito, e a
 * primeira reação é procurar o que "sumiu".
 */
export function explicacaoDoCaminho(caminho: CaminhoDeAbertura): string {
  return caminho === "texto_livre"
    ? "A conversa abre pronta para enviar: texto, imagem, áudio, arquivo e respostas rápidas."
    : "Número oficial da Meta: como ninguém escreveu ainda, a janela de 24h está fechada e a conversa abre com envio de TEMPLATE. Quando a pessoa responder, libera texto, imagem e áudio por 24h."
}

/** O que a tela mostra no lugar da lista de canais. */
export type EstadoDaLista =
  | { tipo: "ok" }
  | { tipo: "carregando"; texto: string }
  | { tipo: "aviso"; texto: string }

/**
 * Decide entre "ainda não sei" e "não há canal".
 *
 * A lista de canais chega por SWR: no primeiro render ela é VAZIA, e
 * `motivoDeNenhumCanal` responderia "Nenhum canal conectado" — mandando
 * configurar o que já está configurado. É a mesma régua do
 * `connection_state` desconhecido: ausência de informação não é ausência
 * de canal.
 *
 * Com canal já disponível o carregamento não segura nada — o dado que
 * importa chegou, e travar a tela por causa de uma revalidação em
 * andamento só atrasaria quem quer mandar mensagem.
 */
export function estadoDaLista(sep: CanaisParaAbertura, carregando = false): EstadoDaLista {
  if (sep.disponiveis.length > 0) return { tipo: "ok" }
  if (carregando) return { tipo: "carregando", texto: "Carregando os canais conectados…" }
  const motivo = motivoDeNenhumCanal(sep)
  return motivo ? { tipo: "aviso", texto: motivo } : { tipo: "ok" }
}
