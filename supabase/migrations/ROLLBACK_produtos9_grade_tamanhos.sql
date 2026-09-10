-- ROLLBACK da transformacao da grade de tamanhos em `produtos 9 - 4 produtos`.
-- Nao e migration: rodar a mao no SQL Editor do Supabase se for preciso desfazer.
-- Devolve o HTML e o output_schema exatamente como estavam antes de 10/09/2026.
--
-- O que a mudanca fez: as 4 grades de 10 caixinhas fixas (T1-01..T4-10) viraram
-- uma linha de texto por produto (campo product_N_sizes), e o botao final ganhou
-- campo (final_cta_label). Motivo: o dado de tamanho nao existe no sistema e o
-- pipeline nao sabe encolher grade horizontal -- so remove <tr> inteira.
--
-- sha256 do html ANTIGO (o que este arquivo restaura): 670eb960c91c8a25bcc04767946b51a53c31f2ec344310099c30ed2827b47e2d
-- sha256 do html NOVO   (o que esta no banco agora):   ab14fe0c6a5cda02abf49f8e4ca8c8dfc9fd3b3985f56b2c4531d09bcdd5ab54

UPDATE email_component_variants
SET html = $html$<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Seção — Limited Stock</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0; padding:0; width:100%; background:#FFFFFF; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; display:block; }
  a { text-decoration:none; }
  :root { color-scheme: light only; supported-color-schemes: light only; }
  u + .body .txt-blk { color:#000000 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#FFFFFF;">

<!-- PREHEADER -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  TEXTO_DE_PREHEADER_AQUI
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
<tr>
<td align="center" style="padding:0;">

  <!-- CONTAINER 600px -->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background:#BEBEBE;">

    <!-- TÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:20px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:35px;line-height:35px;font-weight:700;color:#000000;text-shadow:0 0 3.5px #FFFFFF;">
        Section Title
      </td>
    </tr>

    <!-- SUBTÍTULO -->
    <tr>
      <td align="center" class="txt-blk" style="padding:17px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:25px;font-weight:400;color:#000000;">
        Section Copy
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 1 — foto à esquerda                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:57px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_1" width="221" height="348" alt="ALT_PRODUTO_1"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-right:2px solid #222222;border-bottom:2px solid #222222;border-radius:0 16px 16px 0;">
                <tr>
                  <td style="padding:30px 0 0 23px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 1
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 1:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T1-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_1" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 1</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 2 — foto à direita                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:49px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-left:2px solid #222222;border-bottom:2px solid #222222;border-radius:16px 0 0 16px;">
                <tr>
                  <td style="padding:30px 0 0 25px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 2
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 2:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T2-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_2" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 2</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_2" width="221" height="348" alt="ALT_PRODUTO_2"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 3 — foto à esquerda                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:52px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_3" width="221" height="348" alt="ALT_PRODUTO_3"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-right:2px solid #222222;border-bottom:2px solid #222222;border-radius:0 16px 16px 0;">
                <tr>
                  <td style="padding:30px 0 0 23px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 3
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 3:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T3-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_3" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 3</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ================================================================ -->
    <!-- BLOCO 4 — foto à direita                                        -->
    <!-- ================================================================ -->
    <tr>
      <td style="padding:77px 38px 0 38px;">
        <table role="presentation" width="522" cellpadding="0" cellspacing="0" border="0" style="width:522px;">
          <tr>
            <td width="297" valign="top" style="width:297px;padding:25px 0;">
              <table role="presentation" width="297" cellpadding="0" cellspacing="0" border="0"
                     style="width:297px;background:#FFFFFF;border-top:2px solid #222222;border-left:2px solid #222222;border-bottom:2px solid #222222;border-radius:16px 0 0 16px;">
                <tr>
                  <td style="padding:30px 0 0 25px;">

                    <!-- nome do produto -->
                    <div class="txt-blk" style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:26px;font-weight:700;color:#000000;">
                      Product<br>Name 4
                    </div>

                    <!-- rótulo -->
                    <div class="txt-blk" style="padding-top:11px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;font-weight:400;color:#000000;">
                      Sizes 4:
                    </div>

                    <!-- grade de tamanhos -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;width:250px;">
                      <tr>
                        <td width="46" align="center" height="31" style="width:46px;height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-01</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-02</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-03</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-04</td>
                        <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                        <td width="46" align="center" style="width:46px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-05</td>
                      </tr>
                      <tr><td colspan="9" height="8" style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      <tr>
                        <td align="center" height="31" style="height:31px;background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-06</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-07</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-08</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-09</td>
                        <td style="font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" style="background:#FFFFFF;border:1px solid #E2E2E2;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:17px;color:#000000;">T4-10</td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px;width:252px;">
                      <tr>
                        <td align="center" height="55" style="width:252px;height:55px;background:#000000;">
                          <a href="URL_CTA_4" style="display:block;width:252px;height:55px;line-height:55px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-decoration:none;text-align:center;">CTA 4</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
                <tr><td height="31" style="height:31px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
            <td width="225" valign="top" style="width:225px;font-size:0;line-height:0;">
              <img src="URL_FOTO_4" width="221" height="348" alt="ALT_PRODUTO_4"
                   style="display:block;width:221px;height:348px;border:2px solid #000000;border-radius:16px;background:#F5F5F5;">
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- CTA FINAL -->
    <tr>
      <td align="center" style="padding:74px 0 62px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:350px;">
          <tr>
            <td align="center" height="55" style="width:350px;height:55px;background:#FFFFFF;border:2px solid #000000;">
              <a href="URL_DO_CTA_FINAL"
                 style="display:block;width:346px;height:51px;line-height:51px;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700;letter-spacing:-0.01em;text-transform:uppercase;color:#000000;text-decoration:none;text-align:center;">
                CTA FINAL
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>$html$,
    output_schema = $schema$[{"key":"section_title","type":"text_short","label":"","nature":"copy","example":"Section Title","max_len":26,"guidance":"Caixa alta, bold, a condição de escassez","required":false},{"key":"section_subtitle","type":"text_short","label":"","nature":"copy","example":"Section Copy","max_len":44,"guidance":"Uma linha, voz da marca","required":false},{"key":"product_1_name","type":"text_short","label":"","nature":"copy","example":"Product Name 1","max_len":38,"guidance":"38 (2 linhas)\nNome comercial completo","required":false},{"key":"product_2_name","type":"text_short","label":" 2","nature":"copy","example":"Product Name 2","max_len":38,"guidance":"38 (2 linhas)\nNome comercial completo","required":false},{"key":"product_3_name","type":"text_short","label":" 3","nature":"copy","example":"Product Name 3","max_len":38,"guidance":"38 (2 linhas)\nNome comercial completo","required":false},{"key":"product_4_name","type":"text_short","label":" 4","nature":"copy","example":"Product Name 4","max_len":38,"guidance":"38 (2 linhas)\nNome comercial completo","required":false},{"key":"product_cta_label_1","type":"text_short","label":"","nature":"copy","example":"cta 1","max_len":18,"guidance":"Caixa alta, igual nos quatro","required":false},{"key":"product_cta_label_2","type":"text_short","label":" 2","nature":"copy","example":"cta 2","max_len":18,"guidance":"Caixa alta, igual nos quatro","required":false},{"key":"product_cta_label_3","type":"text_short","label":" 3","nature":"copy","example":"cta 3","max_len":18,"guidance":"Caixa alta, igual nos quatro","required":false},{"key":"product_cta_label_4","type":"text_short","label":" 4","nature":"copy","example":"cta 4","max_len":18,"guidance":"Caixa alta, igual nos quatro","required":false},{"key":"product_1_photo","type":"image","label":"","nature":"imagem_gerada","example":"","max_len":0,"guidance":"Onde fica: coluna esquerda do bloco 1, ultrapassando o card em 25px acima e abaixo.","required":false,"image_spec":"Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.\nIdeia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.","image_width":221,"image_aspect":"2:3","image_height":348},{"key":"product_2_photo","type":"image","label":" 2","nature":"imagem_gerada","example":"","max_len":0,"guidance":"Onde fica: coluna esquerda do bloco 2, ultrapassando o card em 25px acima e abaixo.","required":false,"image_spec":"Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.\nIdeia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.","image_width":221,"image_aspect":"2:3","image_height":348},{"key":"product_3_photo","type":"image","label":" 3","nature":"imagem_gerada","example":"","max_len":0,"guidance":"Onde fica: coluna esquerda do bloco 3, ultrapassando o card em 25px acima e abaixo.","required":false,"image_spec":"Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.\nIdeia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.","image_width":221,"image_aspect":"2:3","image_height":348},{"key":"product_4_photo","type":"image","label":" 4","nature":"imagem_gerada","example":"","max_len":0,"guidance":"Onde fica: coluna esquerda do bloco 4, ultrapassando o card em 25px acima e abaixo.","required":false,"image_spec":"Proporção: 2:3. Slot de 221 × 348px. Ativo final 442 × 696px (2x), PNG, < 150 KB. Borda de 2px e raio de 16px no arquivo.\nIdeia: modelo em meio corpo vestindo a peça superior, do quadril ao topo da cabeça, peça no eixo central. Fundo de estúdio claro e liso.","image_width":221,"image_aspect":"2:3","image_height":348}]$schema$::jsonb
WHERE id = '2f115df3-1ddd-4ca4-bb45-e3337cef5546';
