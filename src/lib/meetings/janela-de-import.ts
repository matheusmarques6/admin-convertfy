/**
 * O horizonte que a importação do Google respeita.
 *
 * O full sync pede a janela ao Google (`timeMin`/`timeMax`). O INCREMENTAL
 * não pode: a API recusa `syncToken` combinado com as duas, então o delta
 * chega SEM janela nenhuma. Medido em 18/09, na primeira rodada real do
 * cron: um evento semanal alterado depois do último sync voltou com todas
 * as instâncias e criou 722 reuniões de 2027 a 2040 — 52 por ano, 14 anos.
 *
 * Quem recorta, portanto, somos nós, e só na CRIAÇÃO de reunião nova:
 * atualização e cancelamento do que já está no banco seguem valendo fora do
 * horizonte, senão uma reunião antiga deixaria de receber o cancelamento.
 */

/** Dias para trás e para frente que o hub de Reuniões considera. */
export const IMPORT_JANELA_DIAS = { atras: 7, frente: 90 } as const

export interface JanelaDeImport {
  min: number
  max: number
}

export function janelaDeImport(agora: number = Date.now()): JanelaDeImport {
  return {
    min: agora - IMPORT_JANELA_DIAS.atras * 86_400_000,
    max: agora + IMPORT_JANELA_DIAS.frente * 86_400_000,
  }
}

/**
 * O evento cai no horizonte? Evento de dia inteiro não tem `dateTime` e
 * fica de fora — é o que a importação já fazia antes desta régua.
 */
export function dentroDaJanela(
  inicioISO: string | undefined | null,
  janela: JanelaDeImport
): boolean {
  if (!inicioISO) return false
  const t = new Date(inicioISO).getTime()
  if (!Number.isFinite(t)) return false
  return t >= janela.min && t <= janela.max
}
