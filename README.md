# Convertfy Admin

Sistema administrativo SaaS completo para a agência Convertfy. Plataforma de gestão de clientes, automações e métricas de marketing.

## Stack Tecnológica

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Database, Edge Functions, Realtime)
- **Hospedagem**: Vercel
- **Banco de Dados**: PostgreSQL (Supabase)

## Funcionalidades

### Dashboard
- Métricas financeiras: faturamento, MRR, a receber, inadimplência
- Alertas: reuniões atrasadas, cobranças pendentes, contratos vencendo
- Gráficos de desempenho
- Atividade recente

### Gestão de Clientes
- Listagem com filtros, busca e ordenação
- Ficha do cliente com abas: Dados, Financeiro, Contratos, Reuniões, Relatórios, Timeline
- Score de saúde automático
- Sistema de tags
- Campos customizados

### Pipeline de Vendas
- Kanban com drag-and-drop
- Múltiplos pipelines
- Cards de deals personalizáveis
- Valor total por etapa

### Automações
- Construtor visual de workflows
- Gatilhos: novo cliente, pagamento, reunião, contrato, deals
- Ações: email, WhatsApp, SMS, notificações, webhooks
- Delays configuráveis

### Hub de Ferramentas
- Gerador de assunto de email (IA)
- Gerador de copy para ads (IA)
- Calculadora de ROAS
- Gerador de relatórios automáticos

## Configuração do Projeto

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/admin-convertfy.git
cd admin-convertfy
npm install
```

### 2. Configure o Supabase

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase/migrations/00001_initial_schema.sql`
4. Copie as credenciais do projeto (Project URL, Anon key, Service role key)

### 3. Configure as variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha as variáveis:

```env
NEXT_PUBLIC_SUPABASE_URL=sua-url-do-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Execute o projeto

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Deploy na Vercel

1. Conecte seu repositório GitHub na [Vercel](https://vercel.com)
2. Configure as variáveis de ambiente no dashboard da Vercel
3. Deploy automático será feito a cada push

## Estrutura do Projeto

```
src/
├── app/                    # App Router (páginas)
├── components/            # Componentes React
├── lib/                   # Utilitários
├── types/                 # TypeScript types
└── middleware.ts          # Auth middleware
```

## Licença

Projeto privado da Convertfy.
