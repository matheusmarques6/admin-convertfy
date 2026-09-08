/**
 * Os países de uma loja — seleção, presets de mercado e quem é o principal.
 *
 * PURO, sem I/O. O banco já tinha as duas colunas:
 *   - `client_stores.countries` (TEXT[]) — todos os países que a loja vende
 *   - `client_stores.country` (TEXT)     — o PRINCIPAL, = countries[0]
 *
 * O PATCH mantém as duas em sincronia; a tela de edição é que só oferecia
 * um Select único, então quem vende para cinco países tinha de escolher um
 * e perder os outros.
 *
 * **A ordem é significativa** e é o detalhe que engana: `country` sai de
 * `countries[0]`, então "adicionar um país" e "trocar o principal" são
 * operações diferentes. Um `Set` resolveria a duplicidade e destruiria a
 * informação de qual é o principal — por isso aqui é lista ordenada.
 */

import { COUNTRIES, type CountryValue } from "@/lib/constants/onboarding"

const VALIDOS = new Set<string>(COUNTRIES.map((c) => c.value))

/** Códigos conhecidos, em MAIÚSCULA, sem repetir, na ordem de entrada. */
export function sanitizarPaises(entrada: Array<string | null | undefined>): CountryValue[] {
  const saida: CountryValue[] = []
  for (const bruto of entrada) {
    if (typeof bruto !== "string") continue
    const code = bruto.trim().toUpperCase()
    if (VALIDOS.has(code) && !saida.includes(code as CountryValue)) {
      saida.push(code as CountryValue)
    }
  }
  return saida
}

export interface PresetDeMercado {
  id: string
  /** O rótulo DECLARA os membros quando o nome é jargão ("Big Five"):
   *  presete que o operador não sabe o que contém ele não usa, ou usa
   *  errado e descobre depois. */
  label: string
  descricao: string
  paises: readonly CountryValue[]
}

/**
 * Conjuntos que a operação usa como uma coisa só.
 *
 * "Big Five" é o jargão do dropshipping para os cinco mercados
 * anglófonos de maior ticket — não é o G5 nem os cinco maiores países.
 * Está escrito no rótulo justamente porque o termo é ambíguo fora do
 * contexto.
 */
export const PRESETS_DE_MERCADO: readonly PresetDeMercado[] = [
  {
    id: "big-five",
    label: "Big Five",
    descricao: "EUA, Reino Unido, Canadá, Austrália e Nova Zelândia",
    paises: ["US", "GB", "CA", "AU", "NZ"],
  },
  {
    id: "america-do-norte",
    label: "América do Norte",
    descricao: "EUA, Canadá e México",
    paises: ["US", "CA", "MX"],
  },
  {
    id: "latam",
    label: "LATAM",
    descricao: "Brasil, México, Argentina, Chile, Colômbia, Peru, Uruguai e Paraguai",
    paises: ["BR", "MX", "AR", "CL", "CO", "PE", "UY", "PY"],
  },
  {
    id: "uniao-europeia",
    label: "União Europeia",
    descricao: "Os 20 países da UE que temos cadastrados",
    paises: [
      "PT", "ES", "FR", "DE", "IT", "NL", "BE", "LU", "AT", "IE",
      "PL", "CZ", "SK", "HU", "RO", "BG", "HR", "GR", "DK", "SE", "FI",
    ],
  },
  {
    id: "zona-do-euro",
    label: "Zona do euro",
    descricao: "Países da nossa lista que usam o euro",
    paises: ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "LU", "AT", "IE", "GR", "SK", "HR", "FI"],
  },
  {
    id: "dach",
    label: "DACH",
    descricao: "Alemanha, Áustria e Suíça — o mercado de língua alemã",
    paises: ["DE", "AT", "CH"],
  },
  {
    id: "benelux",
    label: "Benelux",
    descricao: "Países Baixos, Bélgica e Luxemburgo",
    paises: ["NL", "BE", "LU"],
  },
  {
    id: "nordicos",
    label: "Nórdicos",
    descricao: "Dinamarca, Suécia, Noruega, Finlândia e Islândia",
    paises: ["DK", "SE", "NO", "FI", "IS"],
  },
  {
    id: "iberia",
    label: "Ibéria",
    descricao: "Portugal e Espanha",
    paises: ["PT", "ES"],
  },
  {
    id: "anglofonos-europa",
    label: "Reino Unido e Irlanda",
    descricao: "GB e IE",
    paises: ["GB", "IE"],
  },
  {
    id: "oceania",
    label: "Oceania",
    descricao: "Austrália e Nova Zelândia",
    paises: ["AU", "NZ"],
  },
  {
    id: "golfo",
    label: "Golfo",
    descricao: "Emirados Árabes Unidos e Arábia Saudita",
    paises: ["AE", "SA"],
  },
] as const

export function presetPorId(id: string): PresetDeMercado | undefined {
  return PRESETS_DE_MERCADO.find((p) => p.id === id)
}

/**
 * Preset "ativo" = todos os países dele estão selecionados.
 *
 * NÃO exige exclusividade: uma loja pode ser Big Five + Brasil, e o chip
 * do Big Five continua aceso. Exigir que a seleção fosse exatamente o
 * preset apagaria o chip assim que alguém somasse um país, e a tela
 * pareceria ter esquecido o que o operador fez.
 */
export function presetEstaAtivo(preset: PresetDeMercado, selecionados: string[]): boolean {
  return preset.paises.every((p) => selecionados.includes(p))
}

/**
 * Liga/desliga um preset inteiro.
 *
 * Adicionar: acrescenta só o que falta, no FIM — o principal
 * (`selecionados[0]`) nunca muda por causa de um preset. Aplicar "Big
 * Five" numa loja brasileira não pode transformá-la numa loja
 * americana.
 *
 * Remover: tira os do preset, mas **nunca esvazia a seleção** — loja sem
 * país nenhum é pior que loja com país sobrando, e o botão que zera tudo
 * de uma vez sem intenção explícita é uma armadilha.
 */
export function alternarPreset(selecionados: CountryValue[], preset: PresetDeMercado): CountryValue[] {
  if (presetEstaAtivo(preset, selecionados)) {
    const restante = selecionados.filter((c) => !preset.paises.includes(c))
    return restante.length > 0 ? restante : selecionados
  }
  const faltando = preset.paises.filter((p) => !selecionados.includes(p))
  return [...selecionados, ...faltando]
}

/** Marca/desmarca um país. Desmarcar o último é ignorado (ver acima). */
export function alternarPais(selecionados: CountryValue[], pais: CountryValue): CountryValue[] {
  if (!selecionados.includes(pais)) return [...selecionados, pais]
  const restante = selecionados.filter((c) => c !== pais)
  return restante.length > 0 ? restante : selecionados
}

/**
 * Move um país para a primeira posição — é ele que vira `country`.
 *
 * Operação SEPARADA de marcar/desmarcar de propósito: o operador que
 * quer trocar o principal não deveria precisar desmarcar e remarcar
 * todos na ordem certa.
 */
export function definirPrincipal(selecionados: CountryValue[], pais: CountryValue): CountryValue[] {
  if (!selecionados.includes(pais)) return selecionados
  return [pais, ...selecionados.filter((c) => c !== pais)]
}

/** "Estados Unidos, Reino Unido e mais 3" — o resumo de uma linha. */
export function resumoDePaises(
  selecionados: string[],
  rotulo: (code: string) => string,
  maxNomes = 2,
): string {
  if (selecionados.length === 0) return "Nenhum país definido"
  const nomes = selecionados.map(rotulo)
  if (nomes.length <= maxNomes) {
    return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
  }
  const restantes = nomes.length - maxNomes
  return `${nomes.slice(0, maxNomes).join(", ")} e mais ${restantes}`
}
