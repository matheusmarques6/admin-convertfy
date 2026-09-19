# Domínio próprio dos formulários (`forms.convertfy.me`)

Os formulários públicos vivem num host separado do admin. O motivo é
isolamento: o endereço do anúncio deixa de entregar que existe um `/admin`
ao lado, o cookie de sessão do time não viaja para a página pública, e
nesse host **nada além do formulário existe** — login, painel, portal e API
interna respondem 404 antes de qualquer rota rodar.

## Como o host é reconhecido

Duas fontes, nesta ordem:

1. **`NEXT_PUBLIC_FORMS_ORIGIN`**, quando existe (ex.:
   `https://cadastro.convertfy.me`). Pina um host fora da convenção.
2. **Convenção `forms.<apex>`** — qualquer host cujo primeiro rótulo é
   `forms` (`forms.convertfy.me`, `forms.convertfy.com`). **Não precisa de
   variável nem de deploy**: no instante em que a Vercel começa a rotear o
   domínio para o projeto, o middleware fecha a superfície.

A convenção existe por um incidente real (19/09): o domínio foi conectado
na Vercel, a variável ainda não tinha entrado no bundle (ela é
`NEXT_PUBLIC_`, só vale num deploy feito DEPOIS dela), e
`forms.convertfy.me` passou a servir `/admin` e `/login` — o oposto do que
o domínio existe para fazer. Uma régua que depende de uma variável chegar
ao bundle falha justamente no dia em que o domínio é ligado.

`NEXT_PUBLIC_FORMS_ORIGIN=off` desliga as duas (convenção incluída). Em
`localhost`, IP e previews `*.vercel.app` a convenção não vale — ali não
existe `forms.` ligado, e derivar um redirecionaria o formulário para um
host que não responde.

A régua é `src/lib/forms/dominio.ts` (módulo puro, com teste). Quem
executa é `src/middleware.ts` (testado com `NextRequest` real).

## O que muda com o domínio próprio ativo

| Onde | Antes | Depois |
|---|---|---|
| Link público, QR, embed, "Abrir no ar" | `app.convertfy.me/forms/<slug>` | `forms.convertfy.me/forms/<slug>` |
| `event_source_url` enviado à Meta (CAPI) | host do admin | host dos formulários |
| `app.convertfy.me/forms/<slug>` | servia a página | **308** para o host dos formulários (query preservada) |
| `forms.convertfy.me/admin`, `/login`, `/api/crm/…`, `/` | — | **404** (`X-Robots-Tag: noindex`) |
| `forms.convertfy.me/api/public/forms/…` | — | serve (é o que a página consome) |
| `forms.convertfy.me/api/script/form-embed.js` | — | serve (o embed é carregado de sites de terceiros) |

O que é servido está em `PREFIXOS_SERVIDOS`. Os links do admin são
montados por `buildCrmFormUrl` (`lib/utils/form-url.ts`), que no browser
deriva o host da aba (`app.convertfy.me` → `forms.convertfy.me`) e no
servidor deriva de `NEXT_PUBLIC_APP_URL`.

**Os embeds antigos continuam funcionando**: o iframe em site de cliente
aponta para o host do admin, recebe o 308 e segue para o domínio próprio,
que permite ser embutido (`frame-ancestors *`). A API pública continua
respondendo no host antigo de propósito — redirecionar API quebraria o
formulário no meio da transição.

## Passo a passo (uma vez)

1. **DNS**: `forms.convertfy.me` como `CNAME` → `cname.vercel-dns.com`
   (se o apex já está na Vercel, ela informa o registro exato).
2. **Vercel → projeto do admin → Settings → Domains → Add**:
   `forms.convertfy.me`, sem redirect — ele tem de servir o MESMO deploy.
3. **Nada mais é obrigatório.** A variável só entra em cena para pinar um
   host fora da convenção ou para desligar (`off`); se for definida, é
   `NEXT_PUBLIC_` e exige deploy novo.
4. **Conferir**:
   - `https://forms.convertfy.me/forms/diagnostico` abre o formulário;
   - `https://forms.convertfy.me/admin` e `/login` → 404;
   - `https://app.convertfy.me/forms/diagnostico` → 308 para o host novo;
   - no editor, aba Compartilhar: o link, o QR e os snippets mostram
     `forms.convertfy.me`.
5. **Meta**: nada a mudar no pixel. Se o Gerenciador de Eventos tiver o
   domínio verificado por site, verificar também `forms.convertfy.me`
   (Configurações do negócio → Segurança da marca → Domínios).
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

## A raiz pública é outra (velocidade)

`/forms/[slug]` mora em `src/app/(publico)/`, com layout raiz próprio: não
carrega o `globals.css` do admin (258 KB), nem as quatro fontes que o
painel pré-carrega, nem `next-themes`, SWR e toaster. O CSS dele é
`(publico)/formularios.css` — Tailwind com o MESMO tema do admin
(`tailwind.forms.config.ts`) e `content` restrito aos componentes de
formulário. Tudo o mais do app está em `src/app/(app)/`; a API ficou em
`src/app/api/` (route handler não precisa de layout).

O dado vem de `lib/services/public-form.service.ts`, cacheado por slug
(60 s, tag `form-publico:<slug>`) e invalidado ao salvar, publicar,
arquivar, e no envio quando há `limite_envios`. A página não faz mais
`fetch` da própria API; a visita é contada em `after()`, fora do caminho
crítico.
