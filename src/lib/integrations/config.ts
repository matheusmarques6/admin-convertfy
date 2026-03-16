import { IntegrationConfig } from "./types"

export const INTEGRATION_CONFIGS: Record<string, IntegrationConfig> = {
  asaas: {
    type: "asaas",
    name: "Asaas",
    description: "Plataforma de pagamentos para assinaturas, boletos, Pix e cartão de crédito",
    icon: "DollarSign",
    color: "#00C853",
    requiredCredentials: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        placeholder: "$aact_...",
        helpText: "Encontre sua API Key em Configurações > Integrações no painel Asaas",
      },
    ],
    optionalCredentials: [
      {
        key: "environment",
        label: "Ambiente",
        type: "select",
        options: [
          { value: "sandbox", label: "Sandbox (Testes)" },
          { value: "production", label: "Produção" },
        ],
      },
      {
        key: "webhook_secret",
        label: "Webhook Secret",
        type: "password",
        helpText: "Token para validação dos webhooks",
      },
    ],
    features: [
      "Criar e gerenciar assinaturas",
      "Gerar boletos, Pix e links de pagamento",
      "Receber notificações de pagamento",
      "Sincronizar status de faturas",
    ],
    docsUrl: "https://docs.asaas.com/",
  },

  meta_ads: {
    type: "meta_ads",
    name: "Meta Ads",
    description: "Gerencie campanhas do Facebook e Instagram Ads",
    icon: "Facebook",
    color: "#1877F2",
    requiredCredentials: [
      {
        key: "access_token",
        label: "Access Token",
        type: "password",
        helpText: "Token de acesso longa duração do Marketing API",
      },
      {
        key: "ad_account_id",
        label: "Ad Account ID",
        type: "text",
        placeholder: "act_123456789",
        helpText: "ID da conta de anúncios (com prefixo act_)",
      },
    ],
    optionalCredentials: [
      {
        key: "business_id",
        label: "Business ID",
        type: "text",
        helpText: "ID do Business Manager (opcional)",
      },
    ],
    features: [
      "Visualizar métricas de campanhas",
      "Acompanhar gastos e ROAS",
      "Relatórios de performance",
      "Sincronizar dados de conversão",
    ],
    docsUrl: "https://developers.facebook.com/docs/marketing-apis/",
    oauthUrl: "/api/integrations/meta/authorize",
  },

  google_ads: {
    type: "google_ads",
    name: "Google Ads",
    description: "Gerencie campanhas do Google Ads",
    icon: "Search",
    color: "#4285F4",
    requiredCredentials: [
      {
        key: "customer_id",
        label: "Customer ID",
        type: "text",
        placeholder: "123-456-7890",
        helpText: "ID da conta do Google Ads (formato: XXX-XXX-XXXX)",
      },
    ],
    optionalCredentials: [
      {
        key: "manager_id",
        label: "Manager Account ID",
        type: "text",
        helpText: "ID da conta gerenciadora (MCC), se aplicável",
      },
    ],
    features: [
      "Visualizar métricas de campanhas",
      "Acompanhar gastos e conversões",
      "Relatórios de performance",
      "Integração com Google Analytics",
    ],
    docsUrl: "https://developers.google.com/google-ads/api/docs/start",
    oauthUrl: "/api/integrations/google/authorize",
  },

  klaviyo: {
    type: "klaviyo",
    name: "Klaviyo",
    description: "Plataforma de email marketing e automação",
    icon: "Mail",
    color: "#000000",
    requiredCredentials: [
      {
        key: "api_key",
        label: "Private API Key",
        type: "password",
        placeholder: "pk_...",
        helpText: "Encontre em Account > Settings > API Keys",
      },
    ],
    optionalCredentials: [
      {
        key: "public_key",
        label: "Public API Key",
        type: "text",
        helpText: "Usado para tracking no frontend",
      },
    ],
    features: [
      "Sincronizar contatos e listas",
      "Acompanhar métricas de email",
      "Visualizar fluxos e automações",
      "Relatórios de receita atribuída",
    ],
    docsUrl: "https://developers.klaviyo.com/",
  },

  shopify: {
    type: "shopify",
    name: "Shopify",
    description: "Integração com lojas Shopify para dados de vendas e clientes",
    icon: "ShoppingBag",
    color: "#96BF48",
    requiredCredentials: [
      {
        key: "store_url",
        label: "URL da Loja",
        type: "url",
        placeholder: "sua-loja.myshopify.com",
        helpText: "URL do Shopify da loja (sem https://)",
      },
      {
        key: "access_token",
        label: "Access Token",
        type: "password",
        helpText: "Token de acesso da API Admin",
      },
    ],
    optionalCredentials: [
      {
        key: "api_version",
        label: "Versão da API",
        type: "select",
        options: [
          { value: "2025-01", label: "2025-01 (Recomendado)" },
          { value: "2024-10", label: "2024-10" },
          { value: "2024-07", label: "2024-07" },
        ],
      },
    ],
    features: [
      "Sincronizar pedidos e clientes",
      "Visualizar produtos e estoque",
      "Relatórios de vendas",
      "Webhooks de eventos",
    ],
    docsUrl: "https://shopify.dev/docs/api/admin-rest",
    oauthUrl: "/api/integrations/shopify/authorize",
  },

  whatsapp: {
    type: "whatsapp",
    name: "WhatsApp Business",
    description: "Envie mensagens via WhatsApp Business API",
    icon: "MessageCircle",
    color: "#25D366",
    requiredCredentials: [
      {
        key: "phone_number_id",
        label: "Phone Number ID",
        type: "text",
        helpText: "ID do número de telefone no WhatsApp Business",
      },
      {
        key: "access_token",
        label: "Access Token",
        type: "password",
        helpText: "Token de acesso permanente do WhatsApp Business API",
      },
    ],
    optionalCredentials: [
      {
        key: "webhook_verify_token",
        label: "Webhook Verify Token",
        type: "password",
        helpText: "Token para verificação do webhook",
      },
      {
        key: "business_account_id",
        label: "Business Account ID",
        type: "text",
        helpText: "ID da conta business do WhatsApp",
      },
    ],
    features: [
      "Enviar mensagens de texto",
      "Usar templates aprovados",
      "Receber mensagens via webhook",
      "Notificações de status de entrega",
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/",
  },

  google_calendar: {
    type: "google_calendar",
    name: "Google Calendar",
    description: "Sincronize reuniões com o Google Calendar",
    icon: "Calendar",
    color: "#4285F4",
    requiredCredentials: [],
    optionalCredentials: [
      {
        key: "calendar_id",
        label: "Calendar ID",
        type: "text",
        placeholder: "primary",
        helpText: "ID do calendário (deixe vazio para usar o principal)",
      },
    ],
    features: [
      "Criar eventos automaticamente",
      "Gerar links do Google Meet",
      "Sincronizar reuniões agendadas",
      "Notificações de lembrete",
    ],
    docsUrl: "https://developers.google.com/calendar/api",
    oauthUrl: "/api/integrations/google/authorize?scope=calendar",
  },

  instagram: {
    type: "instagram",
    name: "Instagram",
    description: "Conecte sua conta business do Instagram",
    icon: "Instagram",
    color: "#E4405F",
    requiredCredentials: [
      {
        key: "access_token",
        label: "Access Token",
        type: "password",
        helpText: "Token de acesso da Instagram Graph API",
      },
      {
        key: "instagram_account_id",
        label: "Instagram Account ID",
        type: "text",
        helpText: "ID da conta business do Instagram",
      },
    ],
    features: [
      "Visualizar métricas de perfil",
      "Acompanhar engajamento",
      "Dados de audiência",
      "Performance de posts",
    ],
    docsUrl: "https://developers.facebook.com/docs/instagram-api/",
    oauthUrl: "/api/integrations/meta/authorize?scope=instagram",
  },

  wise: {
    type: "wise",
    name: "Wise",
    description: "Receba pagamentos internacionais e visualize extratos",
    icon: "Wallet",
    color: "#9FE870",
    requiredCredentials: [
      {
        key: "api_token",
        label: "API Token",
        type: "password",
        placeholder: "Seu token pessoal da API",
        helpText: "Gere em Settings > API tokens no painel Wise",
      },
      {
        key: "profile_id",
        label: "Profile ID",
        type: "text",
        placeholder: "123456789",
        helpText: "ID do seu perfil (pessoal ou business)",
      },
    ],
    optionalCredentials: [
      {
        key: "environment",
        label: "Ambiente",
        type: "select",
        options: [
          { value: "sandbox", label: "Sandbox (Testes)" },
          { value: "production", label: "Produção" },
        ],
      },
    ],
    features: [
      "Visualizar saldos multi-moeda",
      "Extrato de transações",
      "Conciliação de pagamentos",
      "Atribuição a clientes",
    ],
    docsUrl: "https://docs.wise.com/",
  },
}

export function getIntegrationConfig(type: string): IntegrationConfig | undefined {
  return INTEGRATION_CONFIGS[type]
}

export function getAllIntegrations(): IntegrationConfig[] {
  return Object.values(INTEGRATION_CONFIGS)
}
