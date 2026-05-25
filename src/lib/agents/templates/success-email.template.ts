export function renderSuccessEmailTemplate(params: {
  storeName: string
  flowName: string
  emailsGenerated: number
  emailsTotal: number
  totalDurationMs: number
  totalCostCents: number
  workspaceUrl: string
}): string {
  const durationSec = (params.totalDurationMs / 1000).toFixed(1)
  const costUsd = (params.totalCostCents / 100).toFixed(4)
  const allSuccess = params.emailsGenerated === params.emailsTotal

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Geracao Concluida</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${allSuccess ? "#16a34a" : "#ca8a04"};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${allSuccess ? "&#9989;" : "&#9888;&#65039;"} Geracao Concluida</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
                A geracao de emails para <strong>${escapeHtml(params.storeName)}</strong> foi concluida.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:10px 14px;background-color:#f9fafb;border:1px solid #e5e7eb;border-bottom:none;border-radius:6px 6px 0 0;">
                    <span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Flow</span>
                    <p style="margin:4px 0 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(params.flowName)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background-color:${allSuccess ? "#f0fdf4" : "#fefce8"};border:1px solid ${allSuccess ? "#bbf7d0" : "#fde68a"};border-bottom:none;">
                    <span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Emails gerados</span>
                    <p style="margin:4px 0 0;color:#111827;font-size:14px;font-weight:600;">${params.emailsGenerated} de ${params.emailsTotal}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 6px 6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Duracao total</span>
                          <p style="margin:4px 0 0;color:#111827;font-size:14px;font-family:monospace;">${durationSec}s</p>
                        </td>
                        <td width="50%">
                          <span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Custo total</span>
                          <p style="margin:4px 0 0;color:#111827;font-size:14px;font-family:monospace;">$${costUsd}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background-color:#1f1f1f;border-radius:6px;">
                    <a href="${escapeHtml(params.workspaceUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Ver no workspace</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Convertfy &mdash; Sistema automatizado
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
