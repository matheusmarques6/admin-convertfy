import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

/**
 * /admin/dashboard agora redireciona pra dashboard do workspace
 * OPERACIONAL — onde estao centralizadas todas as metricas (revenue,
 * campanhas, automacoes, carteira, NPS, lojas em risco, etc).
 *
 * O workspace "Geral" nao tem mais dashboard — leva direto pro Inicio
 * (productivity), que e onde o usuario faz suas tarefas pessoais.
 */
export default function DashboardRedirect() {
  redirect(ROUTES.ADMIN.OPERACIONAL.DASHBOARD)
}
