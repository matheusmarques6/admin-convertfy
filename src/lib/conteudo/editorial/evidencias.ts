/**
 * Evidência com fonte VERIFICÁVEL na triagem.
 *
 * A triagem pede evidências A/B/C e só aceita o que está no insumo — sem
 * isso, o slide sai com `[confirmar]` no lugar do número. Buscar na
 * internet fecha essa lacuna, e cria outra, pior: modelo que recebe
 * resultados de busca escreve URL plausível de cabeça, e uma fonte
 * inventada é mais perigosa que dado nenhum, porque parece conferida.
 *
 * Daí as três regras deste módulo, todas puras e testadas:
 *
 * 1. A consulta sai da PAUTA, não de invenção: frase encurtada, sem
 *    pontuação solta e sem palavra vazia.
 * 2. O bloco servido ao modelo NUMERA as fontes e diz, nas duas pontas,
 *    que fonte fora daquela lista não existe.
 * 3. Depois da resposta, `verificarFontes` confere cada `fonte` contra as
 *    URLs realmente servidas. O que não bate perde a fonte (o dado
 *    continua, marcado para confirmar) — nunca vira citação silenciosa.
 */

export interface FonteServida {
  titulo: string
  url: string
  trecho?: string
}

export interface EvidenciaBruta {
  rotulo: string
  texto: string
  fonte?: string
}

const VAZIAS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas","um","uma","uns","umas",
  "para","por","com","sem","que","se","ao","aos","à","às","the","of","and","to","is","are","como","mais",
])

/** Normaliza para comparação: minúsculas, sem acento. */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * A consulta da pauta: as palavras que carregam sentido, na ordem em que
 * aparecem, até 12. Pauta longa vira consulta longa e o buscador devolve
 * ruído; pauta vazia não vira consulta nenhuma (não se busca "").
 */
export function consultaDaPauta(insumo: string): string {
  const palavras = normalizar(insumo)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
  return palavras.slice(0, 12).join(" ")
}

/** O bloco que o modelo lê. Vazio quando não há o que servir. */
export function blocoDeFontes(fontes: FonteServida[]): string {
  const uteis = fontes.filter((f) => f.url.trim() && f.titulo.trim()).slice(0, 8)
  if (uteis.length === 0) return ""
  const linhas = uteis.map((f, i) => {
    const trecho = (f.trecho ?? "").trim().slice(0, 400)
    return `[${i + 1}] ${f.titulo.trim()}\nURL: ${f.url.trim()}${trecho ? `\n${trecho}` : ""}`
  })
  return `
RESULTADOS DE BUSCA NA INTERNET (fatos externos, use para dar lastro às evidências):
${linhas.join("\n\n")}

Regras destes resultados:
- Só cite como "fonte" uma das URLs acima, copiada INTEIRA e sem alterar nada.
- Não invente URL, veículo, autor nem data que não estejam aí em cima.
- Resultado que não sustenta o ângulo desta pauta: ignore, não force.
- Evidência sem fonte destas continua valendo — deixe o campo "fonte" fora e ela será marcada para confirmar.
`
}

/**
 * Confere as fontes citadas contra as que foram servidas. Devolve as
 * evidências saneadas e quais citações foram descartadas — a tela mostra
 * o número, porque descarte em silêncio é o mesmo que não ter verificado.
 */
export function verificarFontes(
  evidencias: EvidenciaBruta[],
  fontes: FonteServida[],
): { evidencias: EvidenciaBruta[]; descartadas: string[] } {
  const servidas = new Set(fontes.map((f) => chaveDeUrl(f.url)).filter(Boolean))
  const descartadas: string[] = []

  const saneadas = evidencias.map((ev) => {
    const fonte = (ev.fonte ?? "").trim()
    if (!fonte) return ev
    // Fonte que não é URL (o formato antigo: "Smile.io, 2024") continua
    // valendo: ela veio do insumo, não da busca, e o operador é quem
    // confere. Só URL é conferível aqui.
    if (!/^https?:\/\//i.test(fonte)) return ev
    if (servidas.has(chaveDeUrl(fonte))) return ev
    descartadas.push(fonte)
    const { fonte: _f, ...semFonte } = ev
    return semFonte
  })

  return { evidencias: saneadas, descartadas }
}

/** Comparação de URL tolerante ao que não muda o documento. */
function chaveDeUrl(bruta: string): string {
  try {
    const u = new URL(bruta.trim())
    const host = u.host.replace(/^www\./i, "").toLowerCase()
    const caminho = u.pathname.replace(/\/+$/, "").toLowerCase()
    return `${host}${caminho}`
  } catch {
    return ""
  }
}
