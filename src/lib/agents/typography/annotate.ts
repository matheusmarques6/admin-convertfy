/**
 * Anota o documento para a SELEÇÃO de tipografia no preview.
 *
 * Injeta `data-cfy-font="{index}"` na tag que carrega cada declaração de
 * `font-family` do corpo, onde `index` é exatamente o `index` do inventário
 * (`extractTypographyInventory`) — é isso que faz o clique numa headline do
 * preview virar uma op endereçada ao item certo.
 *
 * Só na CÓPIA que vai para o iframe, como `annotateRegionsForEditing` faz com
 * as regiões de bloco: o documento salvo nunca carrega o atributo.
 *
 * Ocorrência que não está dentro de um `style="…"` de uma tag (um
 * `font-family` solto num `<style>` no corpo, por exemplo) NÃO recebe
 * atributo: ela continua no inventário e continua editável pela lista, mas
 * não é clicável. Anotar o `<style>` mais próximo seria apontar o nó errado —
 * a mesma regra do anotador de regiões, que recusa em vez de chutar.
 *
 * Puro (zero I/O) — testável.
 */

import { FONT_FAMILY_RE, splitAtBody } from "./inventory"

export const FONT_ATTR = "data-cfy-font"

interface Insercao {
  pos: number
  texto: string
}

/**
 * Início da tag de abertura que contém o offset, ou null quando o offset não
 * está dentro de uma tag (está no texto, ou num `<style>`).
 */
function inicioDaTagQueContem(body: string, offset: number): number | null {
  const lt = body.lastIndexOf("<", offset)
  if (lt === -1) return null
  const gt = body.indexOf(">", lt)
  // O offset tem de cair DENTRO da tag: `<div style="font-family:…">`.
  if (gt === -1 || gt < offset) return null
  // `<style>`, `<!--` e fechamento não são donos de nada.
  if (!/^<[a-zA-Z][a-zA-Z0-9]*/.test(body.slice(lt, lt + 12))) return null
  if (/^<style/i.test(body.slice(lt, lt + 6))) return null
  return lt
}

export function annotateFontDeclarations(html: string): string {
  const { head, body } = splitAtBody(html)
  const re = new RegExp(FONT_FAMILY_RE.source, FONT_FAMILY_RE.flags)
  const insercoes: Insercao[] = []
  const jaAnotadas = new Set<number>()
  let m: RegExpExecArray | null
  let index = -1

  while ((m = re.exec(body)) !== null) {
    index++
    const lt = inicioDaTagQueContem(body, m.index)
    if (lt === null) continue
    // Duas declarações na MESMA tag (style malformado): a primeira fica com
    // o atributo. Anotar duas vezes deixaria a tag com dois índices e o
    // clique devolveria o errado.
    if (jaAnotadas.has(lt)) continue
    jaAnotadas.add(lt)
    const nome = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(body.slice(lt, lt + 20))
    if (!nome) continue
    insercoes.push({
      pos: lt + 1 + nome[1].length,
      texto: ` ${FONT_ATTR}="${index}"`,
    })
  }

  let corpo = body
  for (const i of insercoes.sort((a, b) => b.pos - a.pos)) {
    corpo = corpo.slice(0, i.pos) + i.texto + corpo.slice(i.pos)
  }
  return head + corpo
}
