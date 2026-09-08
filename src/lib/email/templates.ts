const BRAND_COLOR = "#6366f1"

function baseLayout(content: string, orgName = "Convertfy"): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${orgName}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                &copy; ${new Date().getFullYear()} ${orgName}. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Escapa texto que vai para dentro do HTML do email.
 *
 * Título e pauta são digitados por gente no admin e o email sai para a
 * caixa do cliente: sem escapar, um `<` na pauta quebra o layout e uma tag
 * colada vira markup de verdade num documento que a gente assina.
 */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * URL segura para um href de email.
 *
 * Só http/https. `javascript:` num link que a Convertfy manda é o pior
 * caso possível, e o campo meeting_url aceita o que digitarem.
 */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

function button(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:${BRAND_COLOR};border-radius:6px;">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${text}</a>
      </td>
    </tr>
  </table>`
}

function credentialBox(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td style="background-color:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:16px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${label}</p>
        <p style="margin:0;color:#111827;font-size:16px;font-weight:600;font-family:monospace;">${value}</p>
      </td>
    </tr>
  </table>`
}

export interface InviteTemplateParams {
  name: string
  orgName: string
  inviteUrl: string
}

export function inviteTemplate({ name, orgName, inviteUrl }: InviteTemplateParams): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Convite para ${orgName}</h2>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Ol&aacute; ${name},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Voc&ecirc; foi convidado(a) para acessar o portal da <strong>${orgName}</strong>.
      Clique no bot&atilde;o abaixo para aceitar o convite e configurar sua conta.
    </p>
    ${button("Aceitar Convite", inviteUrl)}
    <p style="margin:0;color:#9ca3af;font-size:12px;">Se voc&ecirc; n&atilde;o esperava este convite, ignore este email.</p>
  `
  return baseLayout(content, orgName)
}

export interface WelcomeWithPasswordParams {
  name: string
  email: string
  tempPassword: string
  loginUrl: string
  orgName?: string
}

export function welcomeWithPasswordTemplate({
  name,
  email,
  tempPassword,
  loginUrl,
  orgName = "Convertfy",
}: WelcomeWithPasswordParams): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Bem-vindo(a) ao ${orgName}!</h2>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Ol&aacute; ${name},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Sua conta foi criada com sucesso. Use as credenciais abaixo para acessar o sistema:
    </p>
    ${credentialBox("Email", email)}
    ${credentialBox("Senha Provis&oacute;ria", tempPassword)}
    <p style="margin:0 0 16px;color:#ef4444;font-size:13px;font-weight:500;">
      &#9888; Voc&ecirc; ser&aacute; solicitado(a) a alterar sua senha no primeiro acesso.
    </p>
    ${button("Acessar o Sistema", loginUrl)}
  `
  return baseLayout(content, orgName)
}

export interface PasswordResetParams {
  name: string
  tempPassword: string
  loginUrl: string
  orgName?: string
}

export function passwordResetTemplate({
  name,
  tempPassword,
  loginUrl,
  orgName = "Convertfy",
}: PasswordResetParams): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Senha Redefinida</h2>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Ol&aacute; ${name},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Sua senha foi redefinida por um administrador. Use a nova senha provis&oacute;ria abaixo para acessar o sistema:
    </p>
    ${credentialBox("Nova Senha Provis&oacute;ria", tempPassword)}
    <p style="margin:0 0 16px;color:#ef4444;font-size:13px;font-weight:500;">
      &#9888; Voc&ecirc; ser&aacute; solicitado(a) a alterar sua senha no pr&oacute;ximo acesso.
    </p>
    ${button("Acessar o Sistema", loginUrl)}
    <p style="margin:0;color:#9ca3af;font-size:12px;">Se voc&ecirc; n&atilde;o solicitou esta altera&ccedil;&atilde;o, entre em contato com o suporte.</p>
  `
  return baseLayout(content, orgName)
}

export function testEmailTemplate(recipientName = "Administrador"): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Email de Teste</h2>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Ol&aacute; ${recipientName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Este &eacute; um email de teste enviado pelo sistema Convertfy.
      Se voc&ecirc; est&aacute; recebendo esta mensagem, o servi&ccedil;o de email est&aacute; funcionando corretamente.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:16px;text-align:center;">
          <p style="margin:0;color:#065f46;font-size:14px;font-weight:600;">&#10003; Servi&ccedil;o de email operacional</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
  `
  return baseLayout(content)
}

// ---------------------------------------------------------------------------
// Reunião agendada
// ---------------------------------------------------------------------------

export interface MeetingInviteParams {
  /** Nome de quem recebe. Vazio vira uma saudação sem nome, nunca "Olá null". */
  recipientName?: string | null
  title: string
  /** "quinta-feira, 11 de setembro de 2026" */
  dateLabel: string
  /** "15:00 às 15:30 (GMT-3)" */
  timeLabel: string
  durationLabel: string
  organizerName?: string | null
  storeName?: string | null
  meetingUrl?: string | null
  notes?: string | null
  orgName?: string
}

function detailRow(label: string, value: string): string {
  return `<tr>
      <td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${value}</td>
    </tr>`
}

/**
 * Confirmação de reunião enviada pela Convertfy.
 *
 * Anda JUNTO com o convite nativo do Google, não no lugar dele: o convite
 * traz o botão de aceitar e o evento na agenda; este email traz a marca, o
 * contexto da loja e sobrevive quando o convite cai no spam. Um dos dois
 * chegar já resolve — foi a mesma razão de manter pixel e CAPI ligados nos
 * eventos de conversão.
 */
export function meetingInviteTemplate({
  recipientName,
  title,
  dateLabel,
  timeLabel,
  durationLabel,
  organizerName,
  storeName,
  meetingUrl,
  notes,
  orgName = "Convertfy",
}: MeetingInviteParams): string {
  const saudacao = recipientName?.trim()
    ? `Ol&aacute; ${escapeHtml(recipientName.trim())},`
    : "Ol&aacute;,"

  const linkDaReuniao = meetingUrl ? safeUrl(meetingUrl) : null

  const linhas = [
    detailRow("Data", escapeHtml(dateLabel)),
    detailRow("Hor&aacute;rio", escapeHtml(timeLabel)),
    detailRow("Dura&ccedil;&atilde;o", escapeHtml(durationLabel)),
    storeName ? detailRow("Loja", escapeHtml(storeName)) : "",
    organizerName ? detailRow("Organizador", escapeHtml(organizerName)) : "",
  ]
    .filter(Boolean)
    .join("")

  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      ${saudacao} sua reuni&atilde;o com a ${escapeHtml(orgName)} est&aacute; confirmada.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;">
      ${linhas}
    </table>
    ${linkDaReuniao ? button("Entrar na reuni&atilde;o", linkDaReuniao) : ""}
    ${
      notes
        ? `<p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.6;"><strong>Pauta:</strong><br>${escapeHtml(notes).replace(/\n/g, "<br>")}</p>`
        : ""
    }
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
      Voc&ecirc; tamb&eacute;m recebeu o convite na sua agenda. Para remarcar ou cancelar,
      responda este email.
    </p>
  `
  return baseLayout(content, orgName)
}
