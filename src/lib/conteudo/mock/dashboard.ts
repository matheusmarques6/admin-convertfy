/**
 * Dados MOCK do Dashboard Social. Arquivo isolado: quando a Graph API do
 * Instagram e o YouTube Analytics entrarem, só `data.ts` muda.
 */

import type {
  Cadencia,
  EstruturaSlide,
  FunilEtapa,
  Kpi,
  LeadDoPost,
  MoldeResumo,
  PilarMix,
  Post,
  Prova,
  SlotAgenda,
} from "../types"

export const CT_KPIS: { ig: Kpi[]; yt: Kpi[] } = {
  ig: [
    { label: "Seguidores", valor: "14.382", delta: "+6,2%", serie: [9, 9.4, 9.9, 10.6, 11.2, 11.5, 12.4, 12.9, 13.6, 14.4] },
    { label: "Alcance", valor: "487.900", delta: "+23,4%", serie: [22, 26, 24, 31, 29, 38, 35, 42, 46, 49] },
    { label: "Interações", valor: "21.640", delta: "+11,8%", serie: [11, 12, 12.5, 13, 14, 15, 16, 17, 19, 21] },
    { label: "Salvamentos", valor: "4.912", delta: "+31,0%", serie: [1.8, 2.1, 2.4, 2.5, 2.9, 3.2, 3.8, 4.1, 4.6, 4.9] },
    { label: "Leads do conteúdo", valor: "63", delta: "+18,9%", serie: [3, 4, 4, 6, 5, 7, 8, 8, 9, 9], money: true },
    { label: "Receita atribuída", valor: "R$ 41.700", delta: "+9,3%", serie: [26, 27, 29, 30, 32, 34, 35, 38, 40, 41.7], money: true },
  ],
  yt: [
    { label: "Inscritos", valor: "3.104", delta: "+4,1%", serie: [2.4, 2.5, 2.55, 2.6, 2.7, 2.75, 2.85, 2.9, 3.0, 3.1] },
    { label: "Visualizações", valor: "58.200", delta: "+14,6%", serie: [3.2, 3.8, 4.1, 4.9, 5.2, 5.8, 6.1, 6.9, 7.4, 8.1] },
    { label: "Horas assistidas", valor: "2.840", delta: "+17,2%", serie: [160, 180, 190, 220, 240, 260, 290, 310, 340, 370] },
    { label: "Retenção média", valor: "42,8%", delta: "+2,1 pp", serie: [38, 39, 39.5, 40, 40.8, 41, 41.5, 42, 42.4, 42.8] },
    { label: "Leads gerados", valor: "9", delta: "+12,5%", serie: [0, 1, 1, 1, 2, 1, 2, 2, 3, 3], money: true },
    { label: "Receita atribuída", valor: "R$ 6.950", delta: "+0,0%", serie: [0, 0, 0, 6.95, 6.95, 6.95, 6.95, 6.95, 6.95, 6.95], money: true },
  ],
}

/** Série diária de seguidores (30 dias). Saltos nos dias de post. */
export const CT_SEG_SERIE: number[] = (() => {
  const inc = [5, 12, 8, 6, 410, 22, 15, 9, 7, 388, 30, 18, 12, 8, 146, 20, 14, 9, 233, 25, 17, 11, 8, 6, 96, 14, 9, 7, 12, 15]
  const a: number[] = []
  let v = 13540
  for (let i = 0; i < 30; i++) {
    v += inc[i] ?? 10
    a.push(v)
  }
  return a
})()

export const CT_POSTS: Post[] = [
  { id: "p1", dia: 4, data: "08/08", perfil: "convertfy", head: "8% dos clientes fazem 41% do faturamento", fmt: "Carrossel", pilar: "Case", molde: "Turbo", alc: 84200, sav: 1940, sh: 720, seg: 412, com: 96, leads: 14, kw: "8%", slides: 10, cor: "#2137B6", thumbSeed: "cfcapa8" },
  { id: "p2", dia: 9, data: "13/08", perfil: "bruno", head: "Como eu montei o time de criativos do meu e-commerce com o Claude", fmt: "Carrossel", pilar: "Educacional", molde: "MEC", alc: 61800, sav: 2310, sh: 890, seg: 388, com: 74, leads: 11, kw: "CRIATIVOS", slides: 12, cor: "#7C3AED", thumbSeed: "cfcriativos" },
  { id: "p3", dia: 14, data: "18/08", perfil: "convertfy", head: "5 automações que todo e-commerce deveria ter", fmt: "Carrossel", pilar: "Educacional", molde: "Lista", alc: 39400, sav: 1120, sh: 340, seg: 146, com: 41, leads: 6, kw: "AUTOMAÇÃO", slides: 8, cor: "#B45309", thumbSeed: "cfauto5" },
  { id: "p4", dia: 18, data: "22/08", perfil: "convertfy", head: "A Sephora cresceu 75% em fidelidade sem desconto", fmt: "Carrossel", pilar: "Case", molde: "Benchmark", alc: 52100, sav: 1480, sh: 610, seg: 233, com: 58, leads: 9, kw: "SEPHORA", slides: 9, cor: "#0E7490", thumbSeed: "cfseph" },
  { id: "p5", dia: 24, data: "28/08", perfil: "bruno", head: "O que eu fiz para tirar uma loja de R$ 40K para R$ 110K em e-mail", fmt: "Reels", pilar: "Bastidor", molde: "Bastidor", alc: 71300, sav: 820, sh: 1140, seg: 96, com: 33, leads: 5, kw: "CONTATO", slides: 1, cor: "#374151", thumbSeed: "cf40k" },
  { id: "p6", dia: 10, data: "14/08", perfil: "youtube", head: "Auditoria completa de e-mail marketing em 40 minutos", fmt: "Vídeo YT", pilar: "Educacional", molde: "MEC", alc: 18400, sav: 0, sh: 210, seg: 64, com: 19, leads: 4, kw: "AUDITORIA", slides: 1, ctr: 6.8, ret: 44.2, cor: "#DC2626", thumbSeed: "cfaudit" },
  { id: "p7", dia: 20, data: "24/08", perfil: "convertfy", head: "Who Gives A Crap testou 375 conceitos criativos. Você testou quantos?", fmt: "Carrossel", pilar: "Case", molde: "Benchmark", alc: 28900, sav: 760, sh: 290, seg: 88, com: 22, leads: 3, kw: "375", slides: 9, cor: "#0E7490", thumbSeed: "cf375" },
  { id: "p8", dia: 27, data: "31/08", perfil: "bruno", head: "3 relatórios que eu olho toda segunda antes das 9h", fmt: "Carrossel", pilar: "Educacional", molde: "Lista", alc: 24600, sav: 980, sh: 260, seg: 71, com: 17, leads: 2, kw: "SEGUNDA", slides: 7, cor: "#B45309", thumbSeed: "cfsegunda" },
]

export const CT_LEADS_DO_POST: LeadDoPost[] = [
  { nome: "Renata Alves", handle: "@bellamodas", data: "09/08", estagio: "Reunião agendada" },
  { nome: "Caio Mendes", handle: "@petlovers.br", data: "09/08", estagio: "Conversa no direct" },
  { nome: "Juliana Prado", handle: "@casabela.decor", data: "10/08", estagio: "Cliente fechado" },
  { nome: "Marcos Vieira", handle: "@vinhosecia", data: "11/08", estagio: "Proposta enviada" },
  { nome: "Larissa Nunes", handle: "@naturebr", data: "12/08", estagio: "Conversa no direct" },
]

export const CT_FUNIL: FunilEtapa[] = [
  { label: "Alcance", valor: 487900 },
  { label: "Visitas ao perfil", valor: 12430 },
  { label: "Comentários com palavra-chave", valor: 341 },
  { label: "Conversas no direct", valor: 198 },
  { label: "Reuniões agendadas", valor: 27 },
  { label: "Clientes fechados", valor: 6 },
]

export const CT_PILAR_MIX: PilarMix = {
  alvo: { Case: 50, Educacional: 30, Bastidor: 20 },
  real: { Case: 38, Educacional: 47, Bastidor: 15 },
}

export const CT_CADENCIA: Cadencia[] = [
  { perfil: "bruno", feitos: 2, meta: 3 },
  { perfil: "convertfy", feitos: 1, meta: 3 },
  { perfil: "youtube", feitos: 0, meta: 1 },
]

export const CT_SLOTS: SlotAgenda[] = [
  { quando: "qui 05/09", perfil: "convertfy", formato: "Carrossel" },
  { quando: "sex 06/09", perfil: "bruno", formato: "Carrossel" },
  { quando: "seg 09/09", perfil: "youtube", formato: "Vídeo" },
  { quando: "ter 10/09", perfil: "convertfy", formato: "Carrossel" },
]

export const CT_MOLDES: MoldeResumo[] = [
  { k: "Turbo", nome: "Turbo", descricao: "Afirmação universal + multiplicador grande", slides: "8 a 10", leads: 11.5, posts: 2 },
  { k: "MEC", nome: "MEC papel-por-papel", descricao: "Série numerada com barra de progresso", slides: "10 a 14", leads: 7.5, posts: 2 },
  { k: "Benchmark", nome: "Benchmark de marca", descricao: "Case de marca conhecida com número", slides: "8 a 10", leads: 6.0, posts: 2 },
  { k: "Lista", nome: "Lista prática", descricao: "N itens acionáveis, um por slide", slides: "6 a 9", leads: 4.0, posts: 2 },
  { k: "Bastidor", nome: "Bastidor", descricao: "O que eu fiz para X, em primeira pessoa", slides: "6 a 8", leads: 5.0, posts: 1 },
]

export const CT_PROVAS: Prova[] = [
  { t: "Smile.io: 8% dos clientes geram 41% da receita", fonte: "Smile.io Loyalty Report", data: "mar/2026" },
  { t: "Who Gives A Crap: 375 conceitos criativos testados", fonte: "Entrevista Marketing Brew", data: "jan/2026" },
  { t: "Sephora: +75% em fidelidade sem desconto", fonte: "Beauty Insider case study", data: "nov/2025" },
  { t: "Convertfy: 250 lojas, R$ 101 mi em e-mail e SMS", fonte: "Dado interno", data: "ago/2026" },
]

export const CT_ESTRUTURA_TURBO: EstruturaSlide[] = [
  { tipo: "Capa", t: "8% dos clientes fazem 41% do faturamento", b: "e a maioria das lojas trata todo mundo igual" },
  { tipo: "Pergunta", t: "Você sabe quem são os seus 8%?", b: "Se a resposta é não, sua estratégia de e-mail está no escuro." },
  { tipo: "Dado", t: "41%", b: "da receita vem de menos de 1 em cada 10 clientes. Fonte: Smile.io, 2026." },
  { tipo: "Raciocínio", t: "Isso muda a conta inteira", b: "Reter um cliente desses vale mais que adquirir cinco novos." },
  { tipo: "Mecanismo", t: "Segmentação por valor", b: "Separe a base em faixas de LTV e trate cada faixa com uma cadência própria." },
  { tipo: "Mecanismo", t: "Cadência VIP", b: "Acesso antecipado, sem cupom. O privilégio é o produto." },
  { tipo: "Prova", t: "Boutique Solar: +R$ 31K/mês", b: "Em 60 dias, só reorganizando quem recebe o quê." },
  { tipo: "Escolha", t: "Dois caminhos", b: "Continuar disparando para todos ou começar pelos 8%." },
  { tipo: "Raciocínio", t: "O custo de não fazer", b: "Cada mês sem segmentar é receita recorrente que não volta." },
  { tipo: "CTA", t: "Comente 8%", b: "e eu te mando o modelo de segmentação que usamos nas 250 lojas." },
]

export const CT_LEGENDA = `A maioria das lojas trata todos os clientes do mesmo jeito. Mesmo e-mail, mesma oferta, mesma frequência.

Só que os dados dizem outra coisa: 8% dos clientes geram 41% da receita (Smile.io, 2026). Menos de 1 em cada 10 pessoas sustenta quase metade do faturamento.

Quando a gente entende isso, a estratégia inteira muda. Não faz sentido gastar o mesmo esforço com quem compra uma vez e com quem compra todo mês.

O caminho que usamos nas lojas da Convertfy é simples de explicar e difícil de executar: separar a base por valor, criar uma cadência própria para os clientes de maior LTV e tirar o cupom do centro da relação. Acesso antecipado, conteúdo exclusivo, atendimento diferente.

Na Boutique Solar isso virou R$ 31 mil a mais por mês em 60 dias, sem aumentar o investimento em mídia.

Se você quer o modelo de segmentação que aplicamos nas 250 lojas, comente 8% aqui embaixo que eu te mando no direct.`

export const CT_SINCRONIZADO_EM = "hoje às 06:12"
