import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { PublicFormView } from "@/components/forms/public-form-view"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface PublicFormPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface FormPayload {
  form: {
    id: string
    name: string
    slug: string
    description: string | null
    theme: {
      primaryColor?: string
      backgroundColor?: string
      textColor?: string
      borderRadius?: number
      fontFamily?: string
      fontSize?: number
      headline?: string
      subheadline?: string
      buttonText?: string
      hideTitle?: boolean
      hideLabels?: boolean
    }
    logo_url: string | null
    success_message: string | null
    redirect_url: string | null
  }
  fields: Array<{
    id: string
    field_type: string
    label: string
    placeholder: string | null
    description: string | null
    required: boolean
    position: number
    options: Array<string | { label: string; value: string }>
    validation: Record<string, unknown>
    map_to_lead_field: string | null
  }>
}

async function loadForm(slug: string): Promise<FormPayload | null> {
  // Em SSR precisamos do origin completo pra fetch interno.
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const url = `${proto}://${host}/api/public/forms/${encodeURIComponent(slug)}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.form) return null
    return { form: json.form, fields: json.fields ?? [] }
  } catch {
    return null
  }
}

export default async function PublicFormPage({
  params,
  searchParams,
}: PublicFormPageProps) {
  const { slug } = await params
  const sp = await searchParams
  const data = await loadForm(slug)
  if (!data) notFound()

  // Captura UTM pra repassar no submit.
  const utm = {
    utm_source: typeof sp.utm_source === "string" ? sp.utm_source : null,
    utm_medium: typeof sp.utm_medium === "string" ? sp.utm_medium : null,
    utm_campaign: typeof sp.utm_campaign === "string" ? sp.utm_campaign : null,
    utm_term: typeof sp.utm_term === "string" ? sp.utm_term : null,
    utm_content: typeof sp.utm_content === "string" ? sp.utm_content : null,
  }

  return (
    <PublicFormView
      slug={slug}
      payload={data}
      utm={utm}
      embed={sp.embed === "1" || sp.embed === "true"}
    />
  )
}
