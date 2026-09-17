/**
 * Link do WhatsApp com o texto já escrito.
 *
 * Mora aqui, e não no módulo que o usou primeiro (a cadência da
 * prospecção), porque o formulário público também precisa dele e
 * importar `crm/cadencia` puxaria o vocabulário de segmentos para o
 * bundle de quem só quer abrir uma conversa. Duas cópias divergiriam na
 * primeira correção — e o sintoma seria um link morto num dos dois
 * lados, sem erro em lugar nenhum.
 */

import { normalizePhone } from "./phone"

/**
 * `wa.me` exige só dígitos e o texto em `encodeURIComponent` — um `&` ou
 * `#` cru cortaria a mensagem no meio sem erro nenhum.
 *
 * O DDI é obrigatório: `wa.me/11999998888` NÃO resolve, e o erro é
 * mudo — abre a tela do WhatsApp dizendo "número inválido" depois de a
 * pessoa já ter clicado. `normalizePhone` é a régua da casa (`+` = DDI
 * explícito; 10-11 dígitos sem `+` = BR e ganha o 55), a MESMA que
 * roteia thread no inbox.
 */
export function linkDoWhatsApp(telefone: string, texto: string): string | null {
  const numero = normalizePhone(telefone)
  if (!numero) return null
  const base = `https://wa.me/${numero}`
  const t = texto.trim()
  return t ? `${base}?text=${encodeURIComponent(t)}` : base
}
