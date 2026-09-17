/**
 * O `reason` de `sendColumnWhatsApp` em portugues.
 *
 * Ele existe desde sempre e NUNCA foi lido: o envio era fire-and-forget e o
 * retorno se perdia. Agora ele vai para `events` e chega a uma tela — e codigo
 * cru ali ("vars_faltando:figma_link") seria o mesmo silencio de antes com
 * outra cara.
 */

import { labelDaVar } from "./preview-do-avanco"

/** Todos os desfechos que `sendColumnWhatsApp` sabe devolver hoje. */
const MOTIVOS: Record<string, string> = {
  no_template: "esta etapa não tem mensagem cadastrada",
  no_onboarding: "o onboarding não foi encontrado",
  no_phone: "o cliente não tem telefone válido no cadastro",
  no_channel: "a organização não tem canal de WhatsApp ativo",
  channel_missing_creds:
    "o canal de WhatsApp está sem as credenciais configuradas",
  send_failed: "o provedor recusou o envio",
  exception: "houve um erro inesperado no envio",
}

/**
 * `vars_faltando:a,b` é o único `reason` com CARGA — as outras chaves são
 * constantes. Traduzir a lista pelo mesmo `labelDaVar` do diálogo mantém o
 * vocabulário igual dos dois lados: quem leu "falta o link do Figma do
 * preview" antes de avançar lê a mesma frase depois, no registro.
 */
export function motivoDoEnvio(reason: string | null | undefined): string {
  if (!reason) return "motivo não informado"

  if (reason.startsWith("vars_faltando:")) {
    const vars = reason
      .slice("vars_faltando:".length)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
    if (vars.length === 0) return "faltava preencher uma variável da mensagem"
    const lista = vars.map(labelDaVar)
    const texto =
      lista.length === 1
        ? lista[0]
        : `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`
    return `faltava ${texto}`
  }

  // Motivo novo no servico NAO vira frase inventada: o codigo aparece cru,
  // e isso e um pedido de entrada nesta tabela — melhor feio e rastreavel
  // que uma explicacao que nao corresponde ao que aconteceu.
  return MOTIVOS[reason] ?? `motivo não reconhecido (${reason})`
}
