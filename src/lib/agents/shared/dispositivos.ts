/**
 * Dispositivo — o que o bloco FAZ com o leitor.
 *
 * Nasceu na Trilha B3 (14/09) como o eixo que faltava: a biblioteca era
 * classificada só por `block_type` (hero, body, products, reviews, offer,
 * footer), então para o Curador uma hero de cupom e uma hero de pergunta
 * eram "hero", e o Estruturador só podia pedir "uma hero".
 *
 * ── A redefinição de 17/09 ────────────────────────────────────────────
 *
 * O vocabulário de 22 valores dizia TRÊS coisas ao mesmo tempo — seção,
 * tema e mecanismo — e por isso não separava nada. Medido nas 72 variantes:
 *
 *  - `hero_oferta_cupom` cobria 10 das 18 heroes, juntando a que entrega o
 *    código do opt-in, a que grita o percentual, a que emoldura a data e a
 *    que abre com um contador: quatro trabalhos no mesmo balde.
 *  - `products_grade_sem_preco` cobria 10 das 16 peças de produto — e
 *    definia a variante pelo que ela NÃO tem.
 *  - O prefixo de seção repetia a coluna `block_type` e ESCONDIA que o
 *    mesmo mecanismo aparece em seções diferentes: o marcador que aponta um
 *    detalhe na própria foto era `body_mecanismo_visual` numa peça e
 *    `products_unico_oferta` em outra.
 *  - Alguns nomes contradiziam a peça: `hero_apresentacao` numa peça com
 *    oferta, `products_unico_oferta` numa peça sem oferta nenhuma,
 *    `reviews_com_credencial` em depoimentos sem cargo.
 *
 * As regras da redefinição, que é o que este arquivo trava:
 *
 *  1. O dispositivo nomeia o MECANISMO, não a seção nem o tema.
 *  2. O prefixo de seção SAI — `block_type` já é coluna, e o prefixo
 *     impedia de ver o mesmo dispositivo cruzando seções.
 *  3. Eixo que não separa não serve (a degradação do passo 7 do protocolo).
 *  4. Momento e objeção não entram no nome: a posição muda o efeito do
 *     dispositivo, e momento no nome mataria a reutilização.
 *  5. O que nunca foi julgado não recebe mecanismo — daí
 *     `nao_classificado`, que é valor de CONTROLE e não de uso.
 *
 * Puro (zero I/O). Fonte única: o CHECK da migration 20261166 é gerado
 * desta lista e um teste os compara.
 */

export const DISPOSITIVOS = [
  // ── Oferta e preço ──────────────────────────────────────────────────
  "oferta_em_manchete",
  "campanha_nomeada",
  "oferta_condicionada",
  "oferta_adiada",
  "codigo_entregue",
  "codigo_relembrado",
  "prazo_declarado",
  // ── Argumento ───────────────────────────────────────────────────────
  "tese_declarada",
  "lista_enumerada",
  "mecanismo_apontado",
  "antes_e_depois",
  "comparacao_pareada",
  "duvida_antecipada",
  "pergunta_ao_leitor",
  "cena_de_uso",
  "remocao_de_risco",
  "oferta_de_ajuda",
  "moldura_de_genero",
  "abertura_editorial",
  // ── Catálogo e produto ──────────────────────────────────────────────
  "vitrine_paralela",
  "vitrine_narrada",
  "produto_unico_aprofundado",
  "galeria_de_angulos",
  "lineup_de_colecao",
  "catalogo_por_ocasiao",
  "escassez_por_estoque",
  "carrinho_dinamico",
  // ── Prova social e fechamento ───────────────────────────────────────
  "prova_por_autoridade",
  "prova_por_relato",
  "prova_por_volume",
  "prova_com_vitrine",
  "menu_de_saida",
  "assinatura_minima",
  // ── Controle ────────────────────────────────────────────────────────
  "nao_classificado",
] as const

export type Dispositivo = (typeof DISPOSITIVOS)[number]

/** Seções da biblioteca (`block_type`) que o vocabulário cobre. */
export type SecaoComDispositivo = "hero" | "body" | "products" | "reviews" | "offer" | "footer"

/**
 * Em que seções cada dispositivo aparece — mapa EXPLÍCITO.
 *
 * Antes isto era derivado do prefixo (`hero_oferta_cupom` → `hero`), e era
 * justamente o que escondia o mesmo mecanismo em seções diferentes. Medido
 * no banco em 17/09, quatro dispositivos cruzam seção de fato:
 * `codigo_entregue` (hero 3 + offer 1), `lineup_de_colecao` (hero 2 +
 * products 1), `mecanismo_apontado` (body 1 + products 1) e
 * `prova_por_relato` (reviews 2 + products 1).
 *
 * A PRIMEIRA da lista é a seção primária — é ela que o gerador de anatomias
 * usa para decidir o `block_type` da variante nova (ver
 * `secaoPrimariaDoDispositivo`).
 *
 * `nao_classificado` sai com lista VAZIA de propósito: ele não é um lugar
 * na peça, é a marca de que ninguém julgou a variante ainda. Lista vazia o
 * torna impossível de pedir, por construção.
 */
export const SECOES_DO_DISPOSITIVO: Record<Dispositivo, readonly SecaoComDispositivo[]> = {
  oferta_em_manchete: ["hero"],
  campanha_nomeada: ["hero"],
  oferta_condicionada: ["offer"],
  oferta_adiada: ["offer"],
  codigo_entregue: ["hero", "offer"],
  codigo_relembrado: ["offer"],
  prazo_declarado: ["hero"],
  tese_declarada: ["body"],
  lista_enumerada: ["body"],
  mecanismo_apontado: ["body", "products"],
  antes_e_depois: ["body"],
  comparacao_pareada: ["body"],
  duvida_antecipada: ["body"],
  pergunta_ao_leitor: ["hero"],
  cena_de_uso: ["body"],
  remocao_de_risco: ["body"],
  oferta_de_ajuda: ["hero"],
  moldura_de_genero: ["hero"],
  abertura_editorial: ["hero"],
  vitrine_paralela: ["products"],
  vitrine_narrada: ["products"],
  produto_unico_aprofundado: ["products"],
  galeria_de_angulos: ["products"],
  lineup_de_colecao: ["products", "hero"],
  catalogo_por_ocasiao: ["body"],
  escassez_por_estoque: ["products"],
  carrinho_dinamico: ["offer"],
  prova_por_autoridade: ["reviews"],
  prova_por_relato: ["reviews", "products"],
  prova_por_volume: ["reviews"],
  prova_com_vitrine: ["reviews"],
  menu_de_saida: ["footer"],
  assinatura_minima: ["footer"],
  nao_classificado: [],
}

/**
 * Valor de CONTROLE: a variante existe, nunca foi julgada, e por isso não
 * recebe mecanismo. Fica fora de tudo que o Estruturador pode pedir —
 * bloquear a escolha às cegas é o trabalho dele.
 */
export const DISPOSITIVO_NAO_CLASSIFICADO: Dispositivo = "nao_classificado"

/** O que o Estruturador pode pedir — todos menos o valor de controle. */
export const DISPOSITIVOS_PEDIVEIS: readonly Dispositivo[] = DISPOSITIVOS.filter(
  (d) => d !== DISPOSITIVO_NAO_CLASSIFICADO,
)

/** Uma linha por dispositivo — o que o Estruturador lê em `<secoes_disponiveis>`. */
export const DESCRICAO_DO_DISPOSITIVO: Record<Dispositivo, string> = {
  oferta_em_manchete:
    "o percentual ou o valor é o maior elemento da peça — a oferta é o argumento, não o acessório",
  campanha_nomeada:
    "o nome próprio da data ou da campanha emoldura a oferta; sem o nome a peça não funciona",
  oferta_condicionada:
    "a mecânica é o conteúdo (combo, brinde, frete, duas ofertas, valor fixo) e precisa ser lida para ser entendida",
  oferta_adiada: "o código só aparece depois do argumento: primeiro a razão, depois o gatilho",
  codigo_entregue:
    "entrega um código NOVO, em texto real — é o mecanismo que cumpre o contrato do opt-in",
  codigo_relembrado:
    "repete um código já concedido; pressupõe um toque anterior e não pode abrir um flow",
  prazo_declarado: "o relógio é a peça — entrega prazo com hora",
  tese_declarada: "uma afirmação carrega o bloco: sem lista, sem prova, sem tabela",
  lista_enumerada: "três a cinco itens com título próprio, que contam a história sozinhos",
  mecanismo_apontado: "marcadores apontam pontos da própria foto — a prova está na imagem",
  antes_e_depois: "duas fotos do mesmo ângulo, etiquetadas; prova por comparação temporal",
  comparacao_pareada: "nós contra eles, critério a critério — contra a categoria, nunca contra um nome",
  duvida_antecipada: "nomeia a dúvida antes que ela vire veto, em pergunta e resposta",
  pergunta_ao_leitor: "abre com uma pergunta dirigida que posiciona a marca",
  cena_de_uso: "o argumento é a cena, não o atributo — vende por afeto e contexto",
  remocao_de_risco: "garantias como conteúdo principal, no ponto da decisão",
  oferta_de_ajuda: "dois caminhos de suporte em escada, sem venda",
  moldura_de_genero: "a peça se disfarça de outro formato e vende por estranhamento",
  abertura_editorial: "foto e frase, sem oferta: apresenta conceito, coleção ou tema",
  vitrine_paralela: "N produtos equivalentes, um destino cada, sem descrição por item",
  vitrine_narrada: "poucos produtos, cada um com frase de uso ou benefício próprio",
  produto_unico_aprofundado: "um produto explicado antes de precificado",
  galeria_de_angulos: "o mesmo produto visto de vários ângulos; exige acervo por ângulo",
  lineup_de_colecao: "o conjunto é o argumento — kit, rotina, linha — e o destino é a coleção",
  catalogo_por_ocasiao: "navegação por ocasião, não por produto: descoberta, não decisão",
  escassez_por_estoque: "a disponibilidade é o argumento; exige estoque integrado, ou mente",
  carrinho_dinamico: "devolve o item abandonado, renderizado por destinatário",
  prova_por_autoridade: "o cargo ou a credencial de quem fala é o argumento",
  prova_por_relato: "um relato longo e específico vale mais que três genéricos",
  prova_por_volume: "vários depoimentos curtos, ou a nota agregada — o argumento é quantidade",
  prova_com_vitrine: "prova social que também mostra produto (por isso não convive com grade)",
  menu_de_saida: "destinos de navegação no fim da peça",
  assinatura_minima: "assina em vez de oferecer menu: poucos links e bloco legal",
  nao_classificado: "a variante nunca foi julgada — valor de controle, não de uso",
}

export function ehDispositivo(x: unknown): x is Dispositivo {
  return typeof x === "string" && (DISPOSITIVOS as readonly string[]).includes(x)
}

/** É um dispositivo que o Estruturador pode PEDIR? (exclui o de controle) */
export function ehDispositivoPedivel(x: unknown): x is Dispositivo {
  return ehDispositivo(x) && x !== DISPOSITIVO_NAO_CLASSIFICADO
}

/**
 * A seção que o gerador de anatomias usa como `block_type` da variante
 * nova.
 *
 * Existe porque o gerador escreve UMA linha e a coluna aceita UM valor —
 * mas o dispositivo pode viver em duas seções. A primária é a primeira da
 * lista, escolhida por onde o mecanismo é mais comum na biblioteca de hoje
 * (`lineup_de_colecao` é products porque duas das três são hero por
 * herança do vocabulário antigo, e o conjunto é catálogo). `null` para o
 * valor de controle: não se gera anatomia do que ninguém julgou.
 */
export function secaoPrimariaDoDispositivo(d: Dispositivo): SecaoComDispositivo | null {
  return SECOES_DO_DISPOSITIVO[d][0] ?? null
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Dispositivos de uma seção (`block_type`), na ordem do vocabulário.
 *
 * Devolve só os PEDÍVEIS: esta lista alimenta `<secoes_disponiveis>` e a
 * capacidade por seção, e oferecer `nao_classificado` ali seria ensinar o
 * Estruturador a pedir o que não é mecanismo. Quem cadastra variante vê o
 * valor de controle por outro caminho (o editor o acrescenta à mão).
 */
export function dispositivosDaSecao(secao: string): Dispositivo[] {
  const s = norm(secao)
  return DISPOSITIVOS_PEDIVEIS.filter((d) =>
    (SECOES_DO_DISPOSITIVO[d] as readonly string[]).includes(s),
  )
}

/** O dispositivo pertence à seção da posição? Seção fora do vocabulário nunca casa. */
export function dispositivoPertenceASecao(d: Dispositivo, secao: string): boolean {
  return (SECOES_DO_DISPOSITIVO[d] as readonly string[]).includes(norm(secao))
}

/**
 * Conflito dispositivo pedido × dispositivo da variante. `null` = sem
 * conflito. Variante SEM dispositivo (cadastro novo, antes da
 * classificação) nunca conflita — o filtro é fail-open, e é o
 * `dispositivo_sem_variante` da auditoria que denuncia a lacuna.
 *
 * `nao_classificado` NÃO é exceção: ele é um valor como outro qualquer
 * aqui, e como nenhuma posição consegue pedi-lo, toda posição que pede
 * algo elimina a variante não julgada. É esse o efeito desejado.
 */
export function conflitoDeDispositivo(
  daVariante: string | null | undefined,
  pedido: string | null | undefined,
): string | null {
  if (!pedido || !daVariante) return null
  if (norm(daVariante) === norm(pedido)) return null
  return `dispositivo ${daVariante} e a decisão pede ${pedido}`
}
