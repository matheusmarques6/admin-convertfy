# Domínio próprio dos formulários (`forms.convertfy.me`)

Os formulários públicos passam a viver num host separado do admin. O
motivo é isolamento: o endereço do anúncio deixa de entregar que existe um
`/admin` ao lado, o cookie de sessão do time não viaja para a página
pública, e nesse host **nada além do formulário existe** — login, painel,
portal e API interna respondem 404 antes de qualquer rota rodar.

## O que muda quando `NEXT_PUBLIC_FORMS_ORIGIN` está configurado

| Onde | Antes | Depois |
|---|---|---|
| Link público, QR, embed, "Abrir no ar" | `app.convertfy.me/forms/<slug>` | `forms.convertfy.me/forms/<slug>` |
| `event_source_url` enviado à Meta (CAPI) | host do admin | host dos formulários |
| `app.convertfy.me/forms/<slug>` | servia a página | **308** para o host dos formulários (query preservada) |
| `forms.convertfy.me/admin`, `/login`, `/api/crm/…` | — | **404** (`X-Robots-Tag: noindex`) |
| `forms.convertfy.me/api/public/forms/…` | — | serve (é o que a página consome) |
| `forms.convertfy.me/api/script/form-embed.js` | — | serve (o embed é carregado de sites de terceiros) |

A régua do que é servido é `PREFIXOS_SERVIDOS` em `src/lib/forms/dominio.ts`
(módulo puro, com teste). Quem executa é `src/middleware.ts`.

**Os embeds antigos continuam funcionando**: o iframe em site de cliente
aponta para o host do admin, recebe o 308 e segue para o domínio próprio,
que permite ser embutido (`frame-ancestors *`). A API pública continua
respondendo no host antigo de propósito — redirecionar API quebraria o
formulário no meio da transição.

## Passo a passo (uma vez)

1. **DNS**: criar `forms.convertfy.me` como `CNAME` → `cname.vercel-dns.com`.
   (Se o apex `convertfy.me` já estiver na Vercel, o subdomínio pode ser
   adicionado direto no projeto e a Vercel diz o registro exato.)
2. **Vercel → projeto do admin → Settings → Domains → Add**:
   `forms.convertfy.me`. Sem redirect para o domínio principal — ele tem
   de servir o MESMO deploy.
3. **Vercel → Settings → Environment Variables** (Production **e** Preview,
   se os previews forem usados para testar formulário):
   `NEXT_PUBLIC_FORMS_ORIGIN=https://forms.convertfy.me`.
   É `NEXT_PUBLIC_`, então exige **novo deploy** para entrar no bundle do
   browser — variável trocada sem redeploy só vale no servidor.
4. **Conferir depois do deploy**:
   - `https://forms.convertfy.me/forms/diagnostico` abre o formulário;
   - `https://forms.convertfy.me/admin` e `/login` → 404;
   - `https://app.convertfy.me/forms/diagnostico` → 308 para o host novo;
   - no editor, aba Compartilhar: o link, o QR e os snippets mostram
     `forms.convertfy.me`.
5. **Meta**: nada a mudar no pixel. Se o Gerenciador de Eventos tiver o
   domínio verificado por site, verificar também `forms.convertfy.me`
   (Configurações do negócio → Segurança da marca → Domínios) para o
   `event_source_url` novo contar como domínio próprio.
6. **Anúncios**: trocar a URL de destino das campanhas para o host novo
   evita o salto do 308 (um hop a menos antes do `PageView`). Os que não
   forem trocados seguem funcionando pelo redirect.

## Segurança que isto compra, e a que não compra

- **Compra**: superfície fechada por host (não dá para chegar ao admin
  pelo domínio público mesmo com cookie), cookie de sessão do admin fora
  da página pública (é `app.convertfy.me`, não `.convertfy.me`), e um
  domínio que pode receber CSP/cabeçalhos próprios sem afetar o painel.
- **Não compra**: a API pública (`/api/public/forms/*`) continua pública
  nos dois hosts — ela é o que o formulário consome, e o que a protege é o
  rate limit e o token HMAC da sessão, não o host.

## Sem a variável

Tudo segue como antes: formulários no host do app, nenhum redirect, nenhum
404 novo. O middleware só decide sobre o host dos formulários quando ele
existe (`origemDosFormularios()` devolve `null` em branco, com espaços ou
com valor que não é `http(s)`).
