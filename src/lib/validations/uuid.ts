import { z } from "zod"

/**
 * Validacao de UUID permissiva — aceita qualquer formato 8-4-4-4-12
 * de hex, NAO so v1-v8 como o `.uuid()` do Zod 4.x.
 *
 * Por que precisamos: Zod 4.x apertou `.uuid()` pra exigir que o
 * terceiro grupo comece com [1-8] (versao oficial) OU que seja o nil
 * UUID exato. Isso quebra IDs de seed/teste como
 * `00000000-0000-0000-0000-000000000001` que sao validos como UUID
 * de banco mas nao seguem versao oficial.
 *
 * Postgres aceita qualquer 32 hex chars no formato canonico, entao
 * nossa validacao tambem deve.
 *
 * Use em todas as APIs do CRM em vez de `z.string().uuid()`.
 */
export const uuid = (msg = "Invalid UUID") =>
  z.string().regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    msg,
  )

/** Idem mas optional — atalho pra `uuid().optional()`. */
export const uuidOptional = (msg = "Invalid UUID") => uuid(msg).optional()

/** Idem mas nullable + optional. */
export const uuidNullable = (msg = "Invalid UUID") =>
  uuid(msg).nullable().optional()
