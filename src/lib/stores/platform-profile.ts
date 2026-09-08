/**
 * Moeda e fuso da loja vindos da PLATAFORMA de e-mail — a decisão, pura.
 *
 * O que este módulo resolve (incidente 08/09/2026): 63 lojas cadastradas,
 * `currency` no default 'BRL' ou chutado à mão, e a tela de Setup sem
 * como consertar (PLN e DKK nem existiam na lista). Lena Warszawa
 * (lenawarszawa.pl) estava em EUR, Treuquell (.de) em BRL, Van Aldijk
 * (.nl) em BRL. Todo número em moeda estrangeira passava pelo câmbio com
 * a moeda errada e saía do dashboard como se estivesse certo.
 *
 * A fonte da verdade passa a ser `/v5/brands/current` do Omnisend, que
 * devolve `currency` e `timezone` — o comentário do sync que dizia o
 * contrário era falso.
 *
 * As três regras que este arquivo existe para garantir:
 *
 * 1. **Código fora da lista fechada NÃO é gravado.** O câmbio precisa de
 *    ISO 4217 conhecido; gravar um código que ele não converte trocaria
 *    um erro visível (moeda errada) por um invisível (valor não
 *    convertido apresentado como BRL). Falta uma linha em
 *    `STORE_CURRENCIES`, não um dado no banco — por isso vira aviso.
 * 2. **Fuso inválido NÃO é gravado**, mesma razão: cai no assumido e o
 *    relatório passa a mentir em silêncio.
 * 3. **O que um humano corrigiu à mão vence a plataforma.** Quando
 *    `*_source = 'manual'` e a plataforma discorda, a divergência é
 *    REPORTADA em vez de sobrescrita — quem corrigiu tinha um motivo, e
 *    a tela oferece "usar o da plataforma". `forcar: true` (backfill
 *    explícito) passa por cima.
 */

import { isStoreCurrency } from "@/lib/constants/currencies"
import { ehFusoValido } from "@/lib/integrations/omnisend/timezone"

export type FontePerfil = "omnisend" | "shopify" | "klaviyo" | "manual"

export interface PerfilAtualDaLoja {
  currency: string | null
  currency_source: FontePerfil | null
  timezone: string | null
  timezone_source: FontePerfil | null
}

export interface PerfilDaPlataforma {
  currency: string | null
  timezone: string | null
  fonte: Exclude<FontePerfil, "manual">
}

/**
 * `grava` — vai para o banco (mudou ou está confirmando a procedência).
 * `igual` — plataforma concorda com o cadastro; só o carimbo é atualizado.
 * `ausente` — a plataforma não informou.
 * `desconhecida` / `invalido` — informou algo que não podemos aceitar.
 * `manual` — humano decidiu diferente e não pedimos para forçar.
 */
export type AcaoDeCampo = "grava" | "igual" | "ausente" | "desconhecida" | "invalido" | "manual"

export interface ResultadoDeCampo {
  acao: AcaoDeCampo
  de: string | null
  para: string | null
  /** Frase pronta para log e para a tela quando a ação não foi gravar. */
  aviso?: string
}

export interface DecisaoDePerfil {
  /** Campos a gravar em `client_stores`. Vazio = nada a fazer. */
  patch: Record<string, string>
  moeda: ResultadoDeCampo
  fuso: ResultadoDeCampo
  /** Algum valor de verdade MUDOU (não conta atualização de carimbo). */
  mudou: boolean
}

export function decidirPerfilDaLoja(
  atual: PerfilAtualDaLoja,
  plataforma: PerfilDaPlataforma,
  options?: { forcar?: boolean; agora?: Date },
): DecisaoDePerfil {
  const forcar = options?.forcar ?? false
  const carimbo = (options?.agora ?? new Date()).toISOString()
  const patch: Record<string, string> = {}

  const moedaAtual = (atual.currency ?? "").toUpperCase() || null
  const moedaNova = (plataforma.currency ?? "").toUpperCase() || null
  const moeda = decidirMoeda(moedaAtual, moedaNova, atual.currency_source, forcar)
  if (moeda.acao === "grava" || moeda.acao === "igual") {
    if (moeda.acao === "grava" && moeda.para) patch.currency = moeda.para
    patch.currency_source = plataforma.fonte
    patch.currency_synced_at = carimbo
  }

  const fusoAtual = (atual.timezone ?? "").trim() || null
  const fusoNovo = (plataforma.timezone ?? "").trim() || null
  const fuso = decidirFuso(fusoAtual, fusoNovo, atual.timezone_source, forcar)
  if (fuso.acao === "grava" || fuso.acao === "igual") {
    if (fuso.acao === "grava" && fuso.para) patch.timezone = fuso.para
    patch.timezone_source = plataforma.fonte
  }

  return { patch, moeda, fuso, mudou: moeda.acao === "grava" || fuso.acao === "grava" }
}

function decidirMoeda(
  de: string | null,
  para: string | null,
  fonteAtual: FontePerfil | null,
  forcar: boolean,
): ResultadoDeCampo {
  if (!para) {
    return { acao: "ausente", de, para: null, aviso: "A plataforma não informou a moeda da marca." }
  }
  if (!isStoreCurrency(para)) {
    return {
      acao: "desconhecida",
      de,
      para,
      aviso:
        `A plataforma informou a moeda ${para}, que não está na lista aceita — ` +
        `não gravei. Adicione ${para} em src/lib/constants/currencies.ts (o câmbio ` +
        `precisa saber converter) e rode de novo.`,
    }
  }
  if (de === para) return { acao: "igual", de, para }
  if (fonteAtual === "manual" && !forcar) {
    return {
      acao: "manual",
      de,
      para,
      aviso: `Cadastro manual diz ${de ?? "—"} e a plataforma diz ${para}. Mantive o manual.`,
    }
  }
  return { acao: "grava", de, para }
}

function decidirFuso(
  de: string | null,
  para: string | null,
  fonteAtual: FontePerfil | null,
  forcar: boolean,
): ResultadoDeCampo {
  if (!para) {
    return { acao: "ausente", de, para: null, aviso: "A plataforma não informou o fuso da marca." }
  }
  if (!ehFusoValido(para)) {
    return {
      acao: "invalido",
      de,
      para,
      aviso: `A plataforma informou o fuso "${para}", que este runtime não reconhece — não gravei.`,
    }
  }
  if (de === para) return { acao: "igual", de, para }
  if (fonteAtual === "manual" && !forcar) {
    return {
      acao: "manual",
      de,
      para,
      aviso: `Fuso manual é ${de ?? "—"} e a plataforma diz ${para}. Mantive o manual.`,
    }
  }
  return { acao: "grava", de, para }
}

/** Uma linha por loja para o log e para o resumo do backfill. */
export function resumoDaDecisao(nomeDaLoja: string, d: DecisaoDePerfil): string {
  const pedaco = (rotulo: string, r: ResultadoDeCampo) => {
    if (r.acao === "grava") return `${rotulo}: ${r.de ?? "—"} → ${r.para}`
    if (r.acao === "igual") return `${rotulo}: ${r.para} (confere)`
    return `${rotulo}: ${r.aviso ?? r.acao}`
  }
  return `${nomeDaLoja} · ${pedaco("moeda", d.moeda)} · ${pedaco("fuso", d.fuso)}`
}
