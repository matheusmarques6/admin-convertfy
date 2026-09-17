/**
 * Normalização para COMPARAR resposta de formulário com valor de regra.
 *
 * Mora aqui, e não no `conversion-dispatch.service`, porque dois lados
 * precisam dela e o serviço importa `createAdminClient` — arrastá-lo
 * para o browser quebraria o build. Os dois lados são:
 *
 * - o **executor** (servidor), que decide se o evento dispara;
 * - a **auditoria** (editor, no browser), que mostra ao operador quais
 *   respostas vão disparar antes de ele subir verba.
 *
 * Duplicar a função seria o defeito que a auditoria existe para pegar:
 * auditor que compara diferente do executor inventa erro onde não há e
 * cala onde há. Uma definição, dois consumidores.
 *
 * Histórico (ago/2026): `equals`/`in`/`contains` usavam `===` cru — a
 * regra `= "Sim"` não batia a resposta "sim", nem `"São Paulo"` batia
 * "Sao Paulo". Quem monta a regra digita à mão, quem responde escolhe no
 * formulário; exigir que as duas grafias coincidam byte a byte fazia o
 * evento nunca disparar, sem erro em lugar nenhum. Comparação numérica
 * (gt/gte/lt/lte) NÃO passa por aqui.
 */
export function normalizeForCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento separadas pelo NFD
}

/** Igualdade tolerante a caixa, acento e espaço nas pontas. */
export const mesmoValor = (a: string, b: string): boolean =>
  normalizeForCompare(a) === normalizeForCompare(b)
