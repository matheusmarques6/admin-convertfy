/**
 * /admin/inbox/[id] — redireciona para o inbox com a conversa aberta.
 *
 * `ROUTES.ADMIN.INBOX_THREAD` sempre gerou esta URL e ela era usada em
 * produção (painel do Instagram, lista de tarefas do CRM), mas a página
 * nunca existiu: todo clique caía num 404. O inbox é uma tela só, com a
 * conversa selecionada por `?thread=`, então aqui basta traduzir uma
 * forma na outra — os links antigos voltam a funcionar sem duplicar a
 * interface.
 */

import { redirect } from "next/navigation"
import { ROUTES } from "@/lib/routes"

export default async function InboxThreadRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`${ROUTES.ADMIN.INBOX}?thread=${encodeURIComponent(id)}`)
}
