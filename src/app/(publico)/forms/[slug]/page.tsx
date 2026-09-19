import type { ComponentProps } from "react"
import type { Metadata } from "next"
import nextDynamic from "next/dynamic"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { preconnect, preload } from "react-dom"
import { metadataDoFormulario } from "@/lib/forms/metadata"
import { recursosDaPrimeiraTela } from "@/lib/forms/primeira-tela"
import { carregarFormularioPublico, contarVisitaDoFormulario } from "@/lib/services/public-form.service"
import type { FormTheme } from "@/components/forms/form-theme"

/**
 * Os dois renderizadores são client components de 1.000 e 2.400 linhas, e
 * um formulário só usa um. Importados estaticamente, os dois iriam no
 * mesmo chunk da página — quem abre o conversacional baixava o clássico
 * inteiro, e vice-versa. `next/dynamic` corta cada um no seu chunk; o
 * SSR continua (é o padrão em Server Component).
 */
const PublicFormView = nextDynamic(() =>
  import("@/components/forms/public-form-view").then((m) => m.PublicFormView),
)
const ConversationalFormView = nextDynamic(() =>
  import("@/components/forms/conversational-form-view").then((m) => m.ConversationalFormView),
)

// `searchParams` (UTM, ocultos, `retomar`) torna a página dinâmica por
// definição; o DADO é que vem do cache (ver `public-form.service`).
export const dynamic = "force-dynamic"
export const revalidate = 0

interface PublicFormPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * O título da aba e a prévia do link.
 *
 * Sem isto a página herdava o título do app — "Convertfy Admin - Sistema
 * de Gestão para Agências" — na aba e na prévia que o WhatsApp monta.
 * Num destino de anúncio, é a primeira coisa que a pessoa lê.
 *
 * `carregarFormularioPublico` é cacheada: o `generateMetadata` e o
 * componente pedem o MESMO payload e o banco é lido uma vez.
 */
export async function generateMetadata({ params }: PublicFormPageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await carregarFormularioPublico(slug)
  if (!data) return { title: "Formulário não encontrado" }

  const { title, description } = metadataDoFormulario({
    form: data.form,
    schema: data.schema,
    displayMode: data.display_mode,
  })
  return {
    title,
    description: description ?? undefined,
    // A prévia do link no WhatsApp e no Gerenciador da Meta sai daqui.
    openGraph: { title, description: description ?? undefined, type: "website" },
    twitter: { card: "summary", title, description: description ?? undefined },
  }
}

export default async function PublicFormPage({
  params,
  searchParams,
}: PublicFormPageProps) {
  const { slug } = await params
  const sp = await searchParams
  const data = await carregarFormularioPublico(slug)
  if (!data) notFound()

  // A visita conta DEPOIS de a resposta sair (`after()`): o visitante não
  // espera o UPDATE, e a Vercel mantém a função viva até ele terminar — a
  // diferença para o `void`, que morria no congelamento e deixava VISITAS
  // em 0 com 56 envios.
  const formId = data.form.id
  after(() => contarVisitaDoFormulario(formId))

  // O que a primeira tela desenha, avisado ao navegador junto do HTML:
  // logo, mídia da tela e a fonte do tema saem em paralelo com o JS, em
  // vez de esperar o React descobrir cada um. Regra em `primeira-tela.ts`.
  const tema = (data.form.theme ?? {}) as FormTheme
  const recursos = recursosDaPrimeiraTela({
    schema: data.schema,
    displayMode: data.display_mode,
    theme: tema,
    logoUrl: data.form.logo_url,
  })
  for (const o of recursos.preconnect) preconnect(o)
  for (const f of recursos.fontes) preload(f, { as: "font", type: "font/woff2", crossOrigin: "anonymous" })
  for (const i of recursos.imagens) preload(i, { as: "image" })

  // Captura UTM + click IDs de ads pra repassar no submit.
  const utm = {
    utm_source: typeof sp.utm_source === "string" ? sp.utm_source : null,
    utm_medium: typeof sp.utm_medium === "string" ? sp.utm_medium : null,
    utm_campaign: typeof sp.utm_campaign === "string" ? sp.utm_campaign : null,
    utm_term: typeof sp.utm_term === "string" ? sp.utm_term : null,
    utm_content: typeof sp.utm_content === "string" ? sp.utm_content : null,
    gclid: typeof sp.gclid === "string" ? sp.gclid : null,
    fbclid: typeof sp.fbclid === "string" ? sp.fbclid : null,
  }

  // Click ids pra matching de conversao (Meta fbclid / Google gclid).
  const clickIds = {
    fbclid: typeof sp.fbclid === "string" ? sp.fbclid : null,
    gclid: typeof sp.gclid === "string" ? sp.gclid : null,
  }

  // Fechado (à mão ou pelo limite de envios): a mensagem no lugar das
  // perguntas, no tema do formulário. O submit recusa pela mesma régua,
  // então a tela não é o único guarda.
  if (data.acesso && !data.acesso.aberto) {
    const escuro = tema.mode === "dark"
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: tema.backgroundColor ?? (escuro ? "#0B0B14" : "#FFFFFF"),
          color: tema.textColor ?? (escuro ? "#F1F5F9" : "#0F172A"),
          fontFamily: tema.fontFamily ?? "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>{data.form.name}</h1>
          <p style={{ marginTop: 14, fontSize: 16, opacity: 0.75, lineHeight: 1.5 }}>{data.acesso.mensagem}</p>
        </div>
      </main>
    )
  }

  // O conversacional é um renderizador DIFERENTE, não uma variação de
  // CSS: ele tem máquina de passos, sessão e teclado próprios. O clássico
  // fica intocado — é o que está no ar com verba em cima.
  if (data.display_mode === "conversational" && data.schema) {
    const schema = data.schema
    // Ocultos: tudo que veio na URL e não é UTM conhecido vira valor de
    // campo oculto, para a lógica e o recall poderem usar. É como o
    // Typeform trata `?plano=anual`.
    // `retomar` e `embed` são da MECÂNICA da página, não resposta de
    // ninguém: gravá-los como campo oculto sujaria a sessão e faria o
    // token de retomada acabar no banco em claro, que é o oposto do que
    // guardar só o hash resolve.
    const DA_MECANICA = new Set(["retomar", "embed"])
    const hidden: Record<string, string> = {}
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && !DA_MECANICA.has(k)) hidden[k] = v
    }
    return (
      <ConversationalFormView
        slug={slug}
        schema={schema}
        form={{
          id: data.form.id,
          name: data.form.name,
          logo_url: data.form.logo_url,
          theme: tema,
          success_message: data.form.success_message,
          redirect_url: data.form.redirect_url,
          // Sem isto o conversacional não carrega pixel nenhum: nem o
          // PageView da visita, nem o Lead deduplicado no envio. O
          // formulário que recebe a verba era justamente o cego.
          tracking: data.form.tracking as ComponentProps<
            typeof ConversationalFormView
          >["form"]["tracking"],
        }}
        contexto={{
          ...utm,
          // O cliente preenche os dois: `document.referrer` e a URL real
          // só existem no browser.
          referrer: null,
          landing_url: null,
        }}
        clickIds={clickIds}
        hidden={hidden}
        retomarToken={typeof sp.retomar === "string" ? sp.retomar : null}
      />
    )
  }

  return (
    <PublicFormView
      slug={slug}
      // theme e um JSON column livre — cast pro tipo amplo do renderer.
      payload={data as unknown as ComponentProps<typeof PublicFormView>["payload"]}
      utm={utm}
      clickIds={clickIds}
      embed={sp.embed === "1" || sp.embed === "true"}
    />
  )
}
