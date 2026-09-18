/**
 * Quando a pessoa já é um lead, mesmo sem terminar.
 *
 * Num funil de 21 telas, boa parte de quem começa não chega ao fim — e
 * quem deixou nome, WhatsApp e e-mail já é lead: o CRM trata assim desde
 * o cron de abandono. Sem marcar esse instante, a Meta só vê a conversão
 * de quem termina, e a campanha passa a otimizar para o comportamento
 * errado (quem tem paciência para 21 telas, não quem tem loja).
 *
 * A régua é a do MAPEAMENTO, não a do rótulo: o que define contato é o
 * campo que vira `email`/`phone` no lead. Procurar por "e-mail" no texto
 * da pergunta quebraria no primeiro formulário em inglês, e em silêncio.
 */

import type { FormAnswers, FormSchema } from "@/types/forms-conversational"

const CAMPOS_DE_CONTATO = new Set(["email", "phone"])

/**
 * `true` quando alguma resposta já preencheu e-mail ou telefone.
 *
 * UM basta: o lead com só o WhatsApp é abordável, e exigir os dois
 * deixaria de fora justamente quem respondeu o que a gente pede antes.
 */
export function contatoCapturado(schema: FormSchema | null, answers: FormAnswers): boolean {
  for (const b of schema?.blocks ?? []) {
    const campo = (b.map_to_lead_field ?? "").trim()
    if (!CAMPOS_DE_CONTATO.has(campo)) continue
    const v = answers[b.ref]
    if (typeof v === "string" && v.trim() !== "") return true
  }
  return false
}
