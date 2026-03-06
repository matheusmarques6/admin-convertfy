/**
 * English → Portuguese (pt-BR) translations for tracking events.
 * Keys are lowercase English canonical phrases.
 */

export const exactMatches: Record<string, string> = {
  // ─── PostNL Specific ─────────────────────────────────────────────────────
  "parcel data received": "Dados da encomenda recebidos",
  "we're expecting your parcel from your sender. we will provide updates here once we receive it":
    "Estamos aguardando sua encomenda do remetente. Atualizaremos assim que a recebermos.",
  "we have your parcel. please check back for updates":
    "Recebemos sua encomenda. Verifique aqui para atualizações.",
  "your parcel has been processed and is now ready for delivery":
    "Sua encomenda foi processada e está pronta para entrega.",
  "your parcel is on its way to the sorting center":
    "Sua encomenda está a caminho do centro de triagem.",
  "your parcel has arrived at the sorting center":
    "Sua encomenda chegou ao centro de triagem.",
  "your parcel is being sorted": "Sua encomenda está sendo triada.",
  "your parcel has been sorted": "Sua encomenda foi triada.",
  "your parcel has left the sorting center":
    "Sua encomenda saiu do centro de triagem.",
  "your parcel is at the local depot": "Sua encomenda está no depósito local.",
  "your parcel is on its way": "Sua encomenda está a caminho.",
  "your parcel has been delivered": "Sua encomenda foi entregue.",
  "your parcel has been delivered to the recipient":
    "Sua encomenda foi entregue ao destinatário.",
  "your parcel has been delivered to the neighbour":
    "Sua encomenda foi entregue ao vizinho.",
  "your parcel could not be delivered": "Não foi possível entregar sua encomenda.",
  "your parcel will be delivered tomorrow":
    "Sua encomenda será entregue amanhã.",
  "your parcel is ready for pick up":
    "Sua encomenda está pronta para retirada.",
  "your parcel is available for pick up":
    "Sua encomenda está disponível para retirada.",
  "your parcel has been picked up": "Sua encomenda foi retirada.",
  "your parcel is being returned to the sender":
    "Sua encomenda está sendo devolvida ao remetente.",
  "parcel is leaving airport": "A encomenda está saindo do aeroporto.",
  "parcel leaving port": "A encomenda está saindo do porto.",
  "parcel is in transit": "Encomenda em trânsito.",
  "parcel received": "Encomenda recebida.",
  "parcel delivered": "Encomenda entregue.",
  "customs declaration completed": "Declaração alfandegária concluída.",
  "customs declaration received": "Declaração alfandegária recebida.",
  "item presented to customs": "Item apresentado à alfândega.",
  "item released by customs": "Item liberado pela alfândega.",
  "item cleared by customs": "Item liberado pela alfândega.",
  "item held at customs": "Item retido na alfândega.",
  "customs inspection": "Inspeção aduaneira.",
  "the item is at the customs": "O item está na alfândega.",
  "the item is pre-advised": "O item está pré-avisado.",
  "the item is processed at the facility":
    "O item está sendo processado na unidade.",
  "the item has been processed in the country of destination":
    "O item foi processado no país de destino.",
  "the item has left the country of origin":
    "O item saiu do país de origem.",
  "the item has arrived in the country of destination":
    "O item chegou ao país de destino.",
  "the item is on transport to the country of destination":
    "O item está sendo transportado para o país de destino.",
  "the item is ready for shipment": "O item está pronto para envio.",

  // ─── Departure / Export ──────────────────────────────────────────────────
  "departed from export warehouse": "Saiu do armazém de exportação",
  "departed from facility": "Saiu da unidade de distribuição",
  "departed from origin": "Saiu do país de origem",
  "departed country of origin": "Saiu do país de origem",
  "left origin country": "Saiu do país de origem",
  "leaving the operating center": "Saindo do centro de operações",
  "export customs cleared": "Liberado pela alfândega de exportação",
  "customs clearance completed": "Desembaraço aduaneiro concluído",
  "export clearance success": "Liberação de exportação concluída",
  "export clearance completed": "Liberação de exportação concluída",
  "handed over to carrier": "Entregue à transportadora",
  "handed over to airline": "Entregue à companhia aérea",
  "hand over to airline": "Entregue à companhia aérea",
  "dispatched to overseas": "Despachado para o exterior",
  "shipment dispatched": "Encomenda despachada",
  "shipment departed": "Encomenda partiu",
  "departed": "Partiu",

  // ─── Arrival / Import ────────────────────────────────────────────────────
  "arrived at destination country": "Chegou ao país de destino",
  "arrived at destination": "Chegou ao destino",
  "arrived in destination country": "Chegou ao país de destino",
  "arrived at local facility": "Chegou à unidade local",
  "arrived at sorting center": "Chegou ao centro de triagem",
  "arrived at hub": "Chegou ao centro de distribuição",
  "arrived at customs": "Chegou à alfândega",
  "arrived at the destination country": "Chegou ao país de destino",
  "import customs clearance completed": "Desembaraço de importação concluído",
  "import customs cleared": "Liberado pela alfândega de importação",
  "customs clearance": "Desembaraço aduaneiro",
  "cleared customs": "Liberado pela alfândega",
  "import clearance success": "Liberação de importação concluída",
  "customs released": "Liberado pela alfândega",
  "inbound to customs": "Encaminhado para alfândega",
  "held at customs": "Retido na alfândega",
  "received by customs": "Recebido pela alfândega",

  // ─── Transit ─────────────────────────────────────────────────────────────
  "in transit": "Em trânsito",
  "in transit to destination": "Em trânsito para o destino",
  "in transit to next facility": "Em trânsito para a próxima unidade",
  "package in transit": "Pacote em trânsito",
  "shipment in transit": "Encomenda em trânsito",
  "en route to destination": "A caminho do destino",
  "forwarded": "Encaminhado",
  "forwarded to destination": "Encaminhado ao destino",
  "onforwarded": "Encaminhado",
  "transferred to carrier": "Transferido para transportadora",
  "on its way": "A caminho",
  "left the sorting center": "Saiu do centro de triagem",
  "arrived at transit point": "Chegou ao ponto de trânsito",
  "departed transit point": "Saiu do ponto de trânsito",
  "in transit between facilities": "Em trânsito entre unidades",
  "shipment on the way": "Encomenda a caminho",

  // ─── Delivery ────────────────────────────────────────────────────────────
  "delivered": "Entregue",
  "delivered to recipient": "Entregue ao destinatário",
  "delivered successfully": "Entregue com sucesso",
  "signed for": "Assinado por",
  "signed by": "Assinado por",
  "package delivered": "Pacote entregue",
  "shipment delivered": "Encomenda entregue",
  "out for delivery": "Saiu para entrega",
  "with delivery courier": "Com o entregador",
  "delivery attempted": "Tentativa de entrega",
  "delivery attempt failed": "Tentativa de entrega falhou",
  "ready for pickup": "Pronto para retirada",
  "available for pickup": "Disponível para retirada",
  "waiting for pickup": "Aguardando retirada",
  "delivery complete": "Entrega concluída",
  "left with neighbour": "Deixado com vizinho",
  "left at front door": "Deixado na porta",
  "left in mailbox": "Deixado na caixa de correio",
  "left in safe place": "Deixado em local seguro",
  "delivery notice left": "Aviso de entrega deixado",
  "pickup reminder sent": "Lembrete de retirada enviado",

  // ─── Origin / Posting ────────────────────────────────────────────────────
  "shipment information received": "Informações do envio recebidas",
  "information received": "Informações recebidas",
  "order information received": "Informações do pedido recebidas",
  "posting/collection": "Postagem/Coleta",
  "accepted by carrier": "Aceito pela transportadora",
  "picked up": "Coletado",
  "package received": "Pacote recebido",
  "shipment picked up": "Encomenda coletada",
  "collected": "Coletado",
  "received at origin": "Recebido na origem",
  "received at warehouse": "Recebido no armazém",
  "received package": "Pacote recebido",
  "shipment created": "Encomenda criada",
  "label created": "Etiqueta criada",
  "electronic notification received": "Notificação eletrônica recebida",
  "pre-shipment info sent to carrier": "Informação de pré-envio enviada à transportadora",
  "object posted": "Objeto postado",
  "posted": "Postado",
  "received by carrier": "Recebido pela transportadora",
  "received at export unit": "Recebido na unidade de exportação",

  // ─── Flight ──────────────────────────────────────────────────────────────
  "flight departure": "Partida do voo",
  "flight arrived": "Voo chegou",
  "in flight": "Em voo",
  "airline departure": "Partida aérea",
  "arrived at airport": "Chegou ao aeroporto",
  "departed from airport": "Partiu do aeroporto",
  "at airport of departure": "No aeroporto de partida",
  "at airport of arrival": "No aeroporto de chegada",

  // ─── Exceptions ──────────────────────────────────────────────────────────
  "exception": "Exceção",
  "returned to sender": "Devolvido ao remetente",
  "undeliverable": "Não entregável",
  "address issue": "Problema com endereço",
  "held for payment": "Retido para pagamento",
  "awaiting payment": "Aguardando pagamento",
  "pending customs clearance": "Aguardando desembaraço aduaneiro",
  "tax to be paid": "Imposto a pagar",
  "incorrect address": "Endereço incorreto",
  "recipient not at home": "Destinatário ausente",
  "refused by recipient": "Recusado pelo destinatário",
  "damaged in transit": "Danificado em trânsito",
  "lost in transit": "Perdido em trânsito",
  "shipment on hold": "Encomenda em espera",
  "delivery rescheduled": "Entrega reagendada",
  "no such number": "Número não encontrado",
  "could not deliver the object": "Não foi possível entregar o objeto",
  "could not deliver": "Não foi possível entregar",
  "object taxed": "Objeto tributado",
  "object seized": "Objeto apreendido",
  "object seized by inspection authority": "Objeto apreendido por órgão de fiscalização",
  "object stolen": "Objeto roubado",
  "object lost": "Objeto extraviado",
  "object not found": "Objeto não localizado",
  "object not found in postal flow": "Objeto não localizado no fluxo postal",
  "waiting for pickup at indicated address": "Aguardando retirada no endereço indicado",
  "object posted after unit deadline": "Objeto postado após o horário limite",
  "forwarded to customs inspection": "Encaminhado para fiscalização aduaneira",
  "awaiting postal dispatch payment": "Aguardando pagamento do despacho postal",
  "received at distribution unit": "Recebido na unidade de distribuição",
  "in transfer - lost & found": "Em transferência - Loss & Found",

  // ─── Processing ──────────────────────────────────────────────────────────
  "processing": "Processando",
  "processed through facility": "Processado na unidade",
  "processed": "Processado",
  "sorting": "Em triagem",
  "sorting complete": "Triagem concluída",
  "item processed": "Item processado",
  "being processed": "Sendo processado",
  "at sorting facility": "Na unidade de triagem",
  "at processing center": "No centro de processamento",
}

export const patterns: Array<{ pattern: RegExp; replacement: string }> = [
  // PostNL dynamic phrases
  {
    pattern: /^your parcel is with one of our drivers for delivery \(due between ([\d:]+) - ([\d:]+)\)$/i,
    replacement: "Sua encomenda está com nosso motorista para entrega (previsão entre $1 - $2)",
  },
  {
    pattern: /^your parcel is expected to be delivered (today|tomorrow|on .+)$/i,
    replacement: "Sua encomenda deve ser entregue $1",
  },
  {
    pattern: /^your parcel has been delivered at (.+)$/i,
    replacement: "Sua encomenda foi entregue em $1",
  },
  {
    pattern: /^your parcel has been delivered to (.+)$/i,
    replacement: "Sua encomenda foi entregue para $1",
  },
  {
    pattern: /^delivered to (.+)$/i,
    replacement: "Entregue para $1",
  },
  {
    pattern: /^signed for by (.+)$/i,
    replacement: "Assinado por $1",
  },
  {
    pattern: /^signed by (.+)$/i,
    replacement: "Assinado por $1",
  },
  // General dynamic patterns
  {
    pattern: /^arrived at (.+?) facility$/i,
    replacement: "Chegou à unidade de $1",
  },
  {
    pattern: /^departed from (.+?) facility$/i,
    replacement: "Saiu da unidade de $1",
  },
  {
    pattern: /^in transit to (.+)$/i,
    replacement: "Em trânsito para $1",
  },
  {
    pattern: /^shipment arrived at (.+)$/i,
    replacement: "Encomenda chegou em $1",
  },
  {
    pattern: /^shipment departed from (.+)$/i,
    replacement: "Encomenda saiu de $1",
  },
  {
    pattern: /^left (.+?) sorting center$/i,
    replacement: "Saiu do centro de triagem de $1",
  },
  {
    pattern: /^arrived at (.+?) sorting center$/i,
    replacement: "Chegou ao centro de triagem de $1",
  },
  {
    pattern: /^processed at (.+)$/i,
    replacement: "Processado em $1",
  },
  {
    pattern: /^transferred to (.+)$/i,
    replacement: "Transferido para $1",
  },
  {
    pattern: /^handed over to (.+)$/i,
    replacement: "Entregue para $1",
  },
  {
    pattern: /^held at (.+)$/i,
    replacement: "Retido em $1",
  },
  {
    pattern: /^released from (.+)$/i,
    replacement: "Liberado de $1",
  },
  // Replace English time words in translated results
  { pattern: /\btoday\b/gi, replacement: "hoje" },
  { pattern: /\btomorrow\b/gi, replacement: "amanhã" },
]
