import { createHash } from "node:crypto"

import type { PromptSegment } from "./prompt-provenance"

export type DoctrineOwner = "hero" | "subject" | "copy" | "typography" | "color"

export interface DoctrinePacket {
  owner: DoctrineOwner
  version: string
  text: string
  sha8: string
}

const TEXT: Record<DoctrineOwner, string> = {
  hero: `<doutrina_hero version="1.0.0">
- A hero faz uma promessa principal, compreensível antes da dobra; título, apoio e CTA devem sustentar a mesma ideia.
- Preserve literalmente toda copy já aprovada. Não reescreva, resuma, traduza nem complete uma oferta.
- Imagem apoia a promessa e não substitui informação factual. Use somente URL e conteúdo recebidos.
- Uma hero não cria desconto, prazo, estoque, frete, cupom, produto, garantia ou urgência.
</doutrina_hero>`,
  subject: `<doutrina_assunto version="1.0.0">
- Subject line abre uma tensão ou benefício concreto; preview text completa a ideia sem repetir o subject.
- Subject e preview devem funcionar como um par, no tom e idioma da loja, sem emoji ou urgência artificiais.
- Nenhum dos dois pode inventar ou ampliar desconto, prazo, estoque, frete, cupom, produto, garantia ou resultado.
- Restrições factuais e dados da loja recebidos na entrada têm precedência absoluta sobre direção criativa e regras posteriores.
</doutrina_assunto>`,
  copy: `<doutrina_copy version="1.0.0">
- Subject line e preview text formam um par: o preview acrescenta contexto em vez de repetir o assunto.
- Escreva apenas alegações sustentadas pela entrada. Nunca invente ou amplie desconto, prazo, estoque, frete, cupom, produto, garantia ou resultado.
- Valores, códigos, nomes de produto, condições e restrições factuais da loja são imutáveis.
- Se qualquer regra criativa, estrutural ou de fase 2 divergir dessas restrições, ignore a regra conflitante e preserve os fatos da loja.
</doutrina_copy>`,
  typography: `<doutrina_tipografia version="1.0.0">
- Tipografia cria hierarquia; não cria nem altera texto, fatos, ordem, largura ou cor.
- Use no máximo duas famílias e três pesos. Reserve ruptura de família a poucos destaques acima de 20px; nunca a corpo, legal ou links.
- Tom e fonte principal decidem a segunda fonte; nicho e preço apenas eliminam extremos. Cor não decide tipografia.
- Em fundo escuro, proteja legibilidade; cupom permanece na fonte principal e não vira monoespaçada.
</doutrina_tipografia>`,
  color: `<doutrina_cores version="1.0.0">
- Cores conformam a peça à paleta aprovada sem alterar copy, fatos, tipografia, estrutura ou layout.
- Decida por papel e área visual, não por frequência bruta; preserve contraste e a separação entre painel e fundo.
- Botões equivalentes usam cores equivalentes. Cor externa à paleta só permanece quando é neutral funcional de contraste, borda, scrim ou sombra.
- Toda troca deve apontar para um papel aprovado da identidade; dúvida nunca autoriza inventar uma nova cor.
</doutrina_cores>`,
}

export function doctrinePacket(owner: DoctrineOwner): DoctrinePacket {
  const text = TEXT[owner]
  return {
    owner,
    version: "1.0.0",
    text,
    sha8: createHash("sha256").update(text).digest("hex").slice(0, 8),
  }
}

/** Anexa somente o pacote do responsável, sem substituir texto já aprovado/configurado. */
export function withDoctrine(systemPrompt: string, owner: DoctrineOwner): string {
  return `${systemPrompt.trimEnd()}\n\n${doctrinePacket(owner).text}`
}

/** Segmento explícito e versionado para reprodução/auditoria da chamada. */
export function doctrinePromptSegment(owner: DoctrineOwner): PromptSegment {
  const packet = doctrinePacket(owner)
  return {
    cls: "vault",
    rotulo: `Doutrina ${owner} v${packet.version}`,
    texto: `\n\n${packet.text}`,
    chars: packet.text.length + 2,
    parte: "system",
    sha8: packet.sha8,
  }
}
