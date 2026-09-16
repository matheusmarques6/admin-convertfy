/**
 * Quem PAGA o cliente: pessoa/empresa brasileira (CPF/CNPJ) ou empresa no
 * exterior (LLC, Ltd, Inc).
 *
 * O campo CPF/CNPJ era a única identificação possível e recusava salvar
 * qualquer coisa que não tivesse 11 ou 14 dígitos. Quem cobra pela LLC não
 * tem o que digitar ali — e o que acontecia, medido em 08/2026, é que a
 * razão social + endereço americano iam PARA O CAMPO DO DOCUMENTO (o print
 * do pedido) ou o operador enchia de zeros para o formulário deixar passar
 * (1 cliente com 22 zeros gravados).
 *
 * **Por que o nome da LLC não pode morar em `cpf_cnpj`**: essa coluna é o
 * documento brasileiro e é por ela que o Asaas casa cliente
 * (`listCustomers({ cpfCnpj })`) e cria cadastro. Texto livre ali faz a
 * busca comparar lixo e a criação automática mandar lixo ao provedor — que
 * recusa com mensagem obscura, depois do save, como aviso amarelo.
 *
 * **O exterior não vai para o Asaas, e isso é do provedor**: o Asaas exige
 * CPF/CNPJ válido. Cobrança de pagador do exterior é o caminho que já
 * existe na casa — "pagamento por fora" (transferência internacional/Wise/
 * PIX direto → `receiveInCash` em `PUT /api/integrations/asaas/charges`).
 * A tela DIZ isso em vez de deixar o operador descobrir pela falha.
 *
 * Módulo puro: sem I/O, usado pelas três portas que editam cliente (criar,
 * editar e o painel de configurações) — três réguas diferentes é como os
 * 22 zeros entraram por uma delas.
 */

export type TipoDePagador = "br" | "exterior"

export interface PagadorBR {
  tipo: "br"
}

export interface PagadorExterior {
  tipo: "exterior"
  /** Razão social como está no registro da empresa. Ex.: "JFJA DIGITAL LLC". */
  razao_social: string
  /** EIN, VAT, CIF… livre de propósito: validar formato de EIN recusaria VAT. */
  tax_id?: string
  /** ISO-3166 alfa-2 em caixa alta quando informado. */
  pais?: string
  /** Endereço em UMA linha: o formato BR (rua/número/bairro/CEP) não cabe. */
  endereco?: string
}

export type Pagador = PagadorBR | PagadorExterior

export const PAGADOR_PADRAO: PagadorBR = { tipo: "br" }

/** O que a tela edita — tudo string, como todo formulário. */
export interface EntradaDePagador {
  tipo: TipoDePagador
  cpf_cnpj?: string
  razao_social?: string
  tax_id?: string
  pais?: string
  endereco?: string
}

export type CampoDePagador = "cpf_cnpj" | "razao_social" | "tax_id" | "pais" | "endereco"

export interface ResultadoDaValidacao {
  ok: boolean
  /** Um por campo: a tela pinta o campo, não um toast genérico. */
  erros: Partial<Record<CampoDePagador, string>>
  /** Não bloqueia. Ex.: dígito verificador que o Asaas vai recusar. */
  avisos: Partial<Record<CampoDePagador, string>>
}

export function digitosDoDocumento(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "")
}

/** Todos os dígitos iguais nunca é documento — é o preenchimento de fuga. */
export function ehSequenciaRepetida(digitos: string): boolean {
  return digitos.length > 0 && /^(.)\1+$/.test(digitos)
}

function dvCpf(d: string): boolean {
  const soma = (ate: number, peso: number) =>
    [...d.slice(0, ate)].reduce((acc, n, i) => acc + Number(n) * (peso - i), 0)
  const dv = (s: number) => {
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(soma(9, 10)) === Number(d[9]) && dv(soma(10, 11)) === Number(d[10])
}

function dvCnpj(d: string): boolean {
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, ...pesos1]
  const calc = (pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(pesos1) === Number(d[12]) && calc(pesos2) === Number(d[13])
}

/**
 * O dígito verificador é AVISO, não bloqueio.
 *
 * Bloquear por DV cria atrito retroativo: quem abrir um cadastro antigo com
 * documento torto para mexer em OUTRO campo passaria a não conseguir salvar.
 * Não deu para medir quantos documentos gravados têm DV inválido sem
 * despejar CPF de cliente no log, então a régua fica onde dá para afirmar —
 * tamanho e sequência repetida, os dois medidos — e o DV aparece com o que
 * ele significa na prática: o Asaas recusa.
 */
export function dvDoDocumentoConfere(valor: string | null | undefined): boolean | null {
  const d = digitosDoDocumento(valor)
  if (d.length === 11) return dvCpf(d)
  if (d.length === 14) return dvCnpj(d)
  return null
}

export function documentoBRValido(valor: string | null | undefined): boolean {
  const d = digitosDoDocumento(valor)
  return (d.length === 11 || d.length === 14) && !ehSequenciaRepetida(d)
}

export function validarPagador(entrada: EntradaDePagador): ResultadoDaValidacao {
  const erros: ResultadoDaValidacao["erros"] = {}
  const avisos: ResultadoDaValidacao["avisos"] = {}

  if (entrada.tipo === "exterior") {
    // A razão social É a identificação do pagador aqui: sem ela, o cadastro
    // do exterior não identifica ninguém e volta a ser o campo vazio de antes.
    if (!entrada.razao_social?.trim()) {
      erros.razao_social = "Informe a razão social da empresa (ex.: JFJA DIGITAL LLC)."
    }
    const pais = (entrada.pais ?? "").trim()
    if (pais && !/^[A-Za-z]{2}$/.test(pais)) {
      erros.pais = "Use o código de 2 letras do país (US, PT, GB…)."
    }
    // CPF/CNPJ no modo exterior é ignorado, não recusado: cliente que migrou
    // de um cadastro BR mantém o documento gravado, e apagá-lo em silêncio
    // perderia o histórico de quem já foi cobrado pelo Asaas.
    return { ok: Object.keys(erros).length === 0, erros, avisos }
  }

  const bruto = (entrada.cpf_cnpj ?? "").trim()
  if (bruto) {
    const d = digitosDoDocumento(bruto)
    if (d.length !== 11 && d.length !== 14) {
      erros.cpf_cnpj = "CPF tem 11 dígitos e CNPJ tem 14. Empresa no exterior? Troque o tipo de pagador."
    } else if (ehSequenciaRepetida(d)) {
      erros.cpf_cnpj = "Documento com todos os dígitos iguais não existe. Empresa no exterior? Troque o tipo de pagador."
    } else if (dvDoDocumentoConfere(d) === false) {
      avisos.cpf_cnpj = "O dígito verificador não confere — o Asaas vai recusar este documento."
    }
  }

  return { ok: Object.keys(erros).length === 0, erros, avisos }
}

export interface VeredictoAsaas {
  pode: boolean
  /** Sempre preenchido quando `pode` é falso — recusa muda não vira mistério. */
  motivo?: string
}

/**
 * O Asaas exige CPF/CNPJ. Pagador do exterior não tem, então a criação
 * automática é DESLIGADA com a razão dita, em vez de sair, falhar no
 * provedor e voltar como aviso amarelo depois do save.
 */
export function podeCriarNoAsaas(entrada: EntradaDePagador): VeredictoAsaas {
  if (entrada.tipo === "exterior") {
    return {
      pode: false,
      motivo: "O Asaas exige CPF/CNPJ e este cliente paga por uma empresa no exterior. Registre o recebimento como pagamento por fora.",
    }
  }
  if (!documentoBRValido(entrada.cpf_cnpj)) {
    return { pode: false, motivo: "Sem CPF/CNPJ válido não há como criar o cliente no Asaas." }
  }
  return { pode: true }
}

/**
 * Sincronizar cadastro existente no Asaas é OUTRA pergunta: ali o documento
 * pode estar só do lado deles — medido, 25 dos 56 clientes têm
 * `asaas_customer_id` e NENHUM documento gravado aqui, e a rota de update
 * omite o campo quando ele falta. Exigir documento válido para sincronizar
 * quebraria esses 25; o que não pode sincronizar é o pagador do exterior,
 * porque lá não há cadastro no provedor para atualizar.
 */
export function podeSincronizarNoAsaas(entrada: Pick<EntradaDePagador, "tipo">): VeredictoAsaas {
  if (entrada.tipo === "exterior") {
    return { pode: false, motivo: "Pagador do exterior não tem cadastro no Asaas para sincronizar." }
  }
  return { pode: true }
}

interface FonteDoPagador {
  cpf_cnpj?: string | null
  custom_fields?: Record<string, unknown> | null
}

export interface DocumentoDoCliente {
  /** O que vale: a COLUNA, que é o que o Asaas, a exportação e o sync leem. */
  valor: string
  /** Veio do JSONB legado porque a coluna está vazia — some ao salvar. */
  legado: boolean
  /**
   * Coluna e JSONB com dígitos DIFERENTES: duas verdades sobre quem é o
   * cliente, e nenhuma delas dá para escolher por código.
   */
  conflito?: { coluna: string; custom_fields: string }
}

/**
 * Onde o documento realmente está.
 *
 * A tela de criação gravava `cpf_cnpj` só em `custom_fields` enquanto a de
 * edição grava na COLUNA — medido em 09/2026: **26 dos 56 clientes têm o
 * documento só no JSONB** (invisível para o casamento de faturas do Asaas,
 * para a exportação e para o sync, que leem a coluna) e **6 têm dígitos
 * diferentes nos dois lugares**.
 *
 * A coluna vence porque é ela que os consumidores leem. O JSONB serve de
 * fallback de LEITURA — salvar o cadastro sobe o valor para a coluna
 * (auto-cura), e divergência de dígitos vira aviso na tela, nunca escolha
 * silenciosa.
 */
export function documentoDoCliente(cliente: FonteDoPagador | null | undefined): DocumentoDoCliente {
  const coluna = (cliente?.cpf_cnpj ?? "").trim()
  const doJson = (cliente?.custom_fields as Record<string, unknown> | undefined)?.cpf_cnpj
  const legado = typeof doJson === "string" ? doJson.trim() : ""
  if (!coluna) return { valor: legado, legado: Boolean(legado) }
  if (legado && digitosDoDocumento(legado) !== digitosDoDocumento(coluna)) {
    return { valor: coluna, legado: false, conflito: { coluna, custom_fields: legado } }
  }
  return { valor: coluna, legado: false }
}

/**
 * Lê o pagador do cliente. Ausente ⇒ `br` — é o que todos os 56 cadastros
 * de hoje são, e tratar ausência como "desconhecido" faria a tela inteira
 * pedir uma escolha que ninguém precisa fazer.
 */
export function lerPagador(cliente: FonteDoPagador | null | undefined): Pagador {
  const bruto = (cliente?.custom_fields as Record<string, unknown> | undefined)?.pagador
  if (!bruto || typeof bruto !== "object") return PAGADOR_PADRAO
  const p = bruto as Record<string, unknown>
  if (p.tipo !== "exterior") return PAGADOR_PADRAO
  const razao = typeof p.razao_social === "string" ? p.razao_social.trim() : ""
  // Exterior sem razão social é registro quebrado; cair para `br` mostra o
  // cadastro como ele de fato está (com ou sem documento) em vez de uma
  // empresa sem nome.
  if (!razao) return PAGADOR_PADRAO
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  return {
    tipo: "exterior",
    razao_social: razao,
    tax_id: texto(p.tax_id),
    pais: texto(p.pais)?.toUpperCase(),
    endereco: texto(p.endereco),
  }
}

/**
 * O que vai para `custom_fields.pagador`.
 *
 * `br` grava `undefined` (a chave some) em vez de `{tipo:"br"}`: é o padrão,
 * e chave presente só onde há decisão faz "quem paga pelo exterior" ser uma
 * consulta de uma linha no banco.
 */
export function gravarPagador(entrada: EntradaDePagador): PagadorExterior | undefined {
  if (entrada.tipo !== "exterior") return undefined
  const texto = (v: string | undefined) => (v?.trim() ? v.trim() : undefined)
  return {
    tipo: "exterior",
    razao_social: (entrada.razao_social ?? "").trim(),
    tax_id: texto(entrada.tax_id),
    pais: texto(entrada.pais)?.toUpperCase(),
    endereco: texto(entrada.endereco),
  }
}

export function rotuloDoPagador(p: Pagador): string {
  return p.tipo === "exterior" ? "Empresa no exterior" : "Pessoa ou empresa no Brasil"
}

/** Uma linha para a ficha do cliente. */
export function resumoDoPagador(p: Pagador, cpfCnpj?: string | null): string {
  if (p.tipo === "exterior") {
    const partes = [p.razao_social, p.tax_id, p.pais].filter(Boolean)
    return partes.join(" · ")
  }
  const d = digitosDoDocumento(cpfCnpj)
  if (!d) return "Sem CPF/CNPJ"
  return formatarDocumento(d)
}

export function formatarDocumento(valor: string | null | undefined): string {
  const d = digitosDoDocumento(valor)
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return valor ?? ""
}
