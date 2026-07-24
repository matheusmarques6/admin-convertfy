/**
 * Esqueleto de referência DEFAULT do HTML Agent.
 *
 * Problema que resolve: quando não existe reference por loja
 * (`store_email_references`, Montador) NEM template global ativo com html
 * (`email_reference_templates` — a maioria das linhas tem html NULL),
 * `buildHtmlPromptVars` emitia `reference_html: ""`. O system prompt do
 * agente é um "Repainter" (substitui placeholders numa estrutura imutável);
 * sem estrutura, o modelo improvisa o layout inteiro do zero a cada email —
 * origem dos emails inconsistentes/mal formatados em produção.
 *
 * Este esqueleto é o piso de qualidade: table-based 600px, mobile-safe,
 * com os mesmos contratos que o Montador emite (data-block, :root com as
 * 6 CSS vars, placeholders {{TOKEN}} em CAPS, logo como texto estilizado,
 * footer com [unsubscribe_link] literal). O agente só repinta cores/fontes/copy.
 *
 * O HERO (hero v5, jul/2026) é uma imagem <img> full-width de ALTURA NATURAL
 * (nunca cortada, sem background-image/overlay/cover) numa linha própria, e o
 * kicker/headline/subcopy como TEXTO HTML de verdade em linhas separadas.
 * Espelha a hero_overlay_hard_rule do agente de HTML — imagem e texto empilham
 * limpo, o texto nunca fica sobreposto na imagem.
 *
 * Mantido deliberadamente enxuto (header, hero image, hero text, body, CTA,
 * body secundário, footer): seções genéricas que qualquer flow preenche.
 * Tokens não casados são removidos por stripUnresolvedPlaceholders sem
 * deixar artefato visível.
 */

export const DEFAULT_REFERENCE_SKELETON = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>{{HEADLINE}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :root {
      --bg: #F4F4F4;
      --text: #333333;
      --heading: #111111;
      --button-bg: #111111;
      --button-text: #FFFFFF;
      --accent: #DDDDDD;
    }

    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      border-collapse: collapse;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
      display: block;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: var(--bg);
      font-family: 'Inter', Arial, sans-serif;
    }

    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .stack-pad {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .fluid {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:var(--bg);">

  <!-- Preheader (uma linha, oculto) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;mso-hide:all;">{{PREHEADER}}</div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:var(--bg);">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;">

          <!-- Header: logo -->
          <tr>
            <td data-block="header" align="center" class="stack-pad" style="padding:32px 40px 24px 40px;border-bottom:1px solid var(--accent);">
              <span style="font-family:'Inter',Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;color:var(--heading);text-transform:uppercase;">{{BRAND_NAME}}</span>
            </td>
          </tr>

          <!-- Hero image: imagem full-width, altura natural (nunca cortada) -->
          <tr>
            <td data-block="hero-image" style="padding:0;font-size:0;line-height:0;">
              <img src="{{HERO_IMAGE}}" alt="{{BRAND_NAME}}" width="600" class="fluid" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Hero text: kicker + headline + subheadline (HTML real, linha própria) -->
          <tr>
            <td data-block="hero-text" align="center" class="stack-pad" style="padding:36px 48px 8px 48px;">
              <p style="margin:0 0 10px 0;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:16px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--text);">{{HERO_KICKER}}</p>
              <h1 style="margin:0 0 12px 0;font-family:'Inter',Arial,sans-serif;font-size:30px;line-height:38px;font-weight:700;color:var(--heading);">{{HEADLINE}}</h1>
              <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:24px;color:var(--text);">{{SUBHEADLINE}}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td data-block="body" class="stack-pad" style="padding:24px 48px 8px 48px;">
              <p style="margin:0 0 16px 0;font-family:'Inter',Arial,sans-serif;font-size:15px;line-height:24px;color:var(--text);">{{BODY_1}}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td data-block="cta" align="center" class="stack-pad" style="padding:24px 48px 32px 48px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="background-color:var(--button-bg);border-radius:4px;">
                    <a href="{{CTA_URL}}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:'Inter',Arial,sans-serif;font-size:15px;line-height:20px;font-weight:600;color:var(--button-text);text-decoration:none;">{{CTA_TEXT}}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body secundário -->
          <tr>
            <td data-block="body-secondary" class="stack-pad" style="padding:0 48px 40px 48px;border-bottom:1px solid var(--accent);">
              <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:22px;color:var(--text);">{{BODY_2}}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td data-block="footer" align="center" class="stack-pad" style="padding:28px 48px 36px 48px;">
              <p style="margin:0 0 8px 0;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:18px;color:var(--text);">{{BRAND_NAME}}</p>
              <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:18px;color:var(--text);">
                <a href="[unsubscribe_link]" style="color:var(--text);text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
