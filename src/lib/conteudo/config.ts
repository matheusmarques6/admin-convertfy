/**
 * Configuração da metodologia (não é dado): alvo de mix por pilar, meta
 * padrão de cadência e prompts prontos do fluxo "100% com IA". Tudo que
 * é MEDIDO vem das rotas `/api/conteudo/*`; aqui só ficam as réguas.
 */

import type { Pilar } from "./types"

/** Alvo de distribuição do mês por pilar (soma 100). */
export const MIX_ALVO: Partial<Record<Pilar, number>> = { Case: 50, Educacional: 30, Bastidor: 20 }

/** Meta padrão de publicações por semana quando o canal não configurou a sua. */
export const META_SEMANAL_PADRAO = 3

export const PILARES: Pilar[] = ["Case", "Educacional", "Bastidor", "Benchmark"]

export interface PromptPronto {
  n: string
  d: string
  tpl: string
  pilar: Pilar
  /** Pauta completa que o prompt envia para a IA. */
  pauta: string
}

export const PROMPTS_PRONTOS: PromptPronto[] = [
  {
    n: "Foto de produto editorial",
    d: "Produto em cena premium, luz natural, 6 slides com benefício por slide",
    tpl: "molde-lista",
    pilar: "Educacional",
    pauta:
      "Carrossel com um benefício por slide sobre como apresentar produto em cena premium no e-mail e no Instagram: luz natural, fundo limpo, ângulo consistente, texto curto. Público: donos de e-commerce de moda e beleza. Tom direto e prático.",
  },
  {
    n: "Case de cliente com número",
    d: "Resultado forte na capa, mecanismo em 3 slides, prova e CTA",
    tpl: "molde-benchmark",
    pilar: "Case",
    pauta:
      "Case de cliente com número forte na capa, três slides explicando o mecanismo que gerou o resultado, um slide de prova com o dado e CTA com comment gate. Use SOMENTE os números e nomes informados na pauta; o que não estiver na pauta fica marcado como [confirmar]. Público: donos de e-commerce que faturam acima de R$ 100 mil por mês.",
  },
  {
    n: "Mito vs. verdade",
    d: "Afirmação comum, dado que derruba, o que fazer no lugar",
    tpl: "molde-turbo",
    pilar: "Educacional",
    pauta:
      "Derrubar um mito comum do e-mail marketing para e-commerce: começar pela afirmação que todo mundo repete, mostrar o dado que derruba (com fonte informada na pauta ou marcado como [confirmar]), explicar o que fazer no lugar e fechar com convite. Tom direto, sem jargão.",
  },
  {
    n: "Bastidor da operação",
    d: "O que fizemos por dentro, em primeira pessoa, com convite no fim",
    tpl: "molde-bastidor",
    pilar: "Bastidor",
    pauta:
      "Bastidor em primeira pessoa: o que fizemos por dentro numa loja cliente para melhorar a receita de um canal, decisões, erros e o que funcionou. Fechar com convite para conversa no direct.",
  },
]
