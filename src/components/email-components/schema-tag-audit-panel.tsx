"use client"

/**
 * Painel "Schema × HTML" — o alinhamento fica VISÍVEL, o tempo todo.
 *
 * Antes isto era um toast que aparecia no save e sumia em 4 segundos, o que
 * na prática significava que ninguém via. Uma variante podia declarar
 * `hero_headline`/`hero_subhead` no schema e carregar `{{HERO_EYEBROW}}` e
 * `{{COUPON_CODE}}` no HTML por meses — e o defeito só aparecia no email
 * pronto, com placeholder cru na peça.
 *
 * O painel NÃO bloqueia salvar (a biblioteca tem 38 variantes legadas e
 * travar o save travaria o conserto delas). Ele grita: fica vermelho, lista
 * os dois lados e, onde dá, diz qual tag do HTML deveria virar qual
 * placeholder.
 */

import { useMemo } from "react"
import { AlertTriangle, Check } from "lucide-react"

import { auditSchemaTags } from "@/lib/email-workspace/schema-tag-coherence"
import type { ComponentOutputField } from "@/types/email-generation"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import { EGCard } from "@/components/email-generation/ui/eg-atoms"

const RED = "#B42318"
const RED_BG = "#FEF3F2"
const RED_BORDER = "#FDA29B"
const AMBER = "#B54708"
const AMBER_BG = "#FFFAEB"
const AMBER_BORDER = "#FEC84B"

const code: React.CSSProperties = {
  fontFamily: F.mono,
  fontSize: 12,
  padding: "1px 5px",
  borderRadius: 4,
  background: "rgba(0,0,0,.06)",
  whiteSpace: "nowrap",
}

function Row({
  tone,
  children,
}: {
  tone: "red" | "amber"
  children: React.ReactNode
}) {
  const red = tone === "red"
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        fontSize: 12.5,
        lineHeight: 1.6,
        color: red ? RED : AMBER,
        background: red ? RED_BG : AMBER_BG,
        border: `1px solid ${red ? RED_BORDER : AMBER_BORDER}`,
        borderRadius: 5,
        padding: "7px 10px",
      }}
    >
      {children}
    </div>
  )
}

export function SchemaTagAuditPanel({
  html,
  schema,
}: {
  /** HTML efetivo da variante (o mesmo que o pipeline consome). */
  html: string
  schema: ComponentOutputField[]
}) {
  const audit = useMemo(() => auditSchemaTags(html, schema), [html, schema])

  if (schema.length === 0) return null

  const title = audit.ok
    ? "Schema × HTML — alinhado"
    : `Schema × HTML — ${audit.missing.length + audit.orphans.length} problema(s)`

  return (
    <EGCard title={title}>
      <p style={{ fontSize: 12, color: C.g500, margin: "0 0 12px", lineHeight: 1.6 }}>
        O schema é a base. Cada campo endereça{" "}
        <code style={code}>{"{{MAIÚSCULA_DA_KEY}}"}</code> no HTML — sem apelido,
        sem tradução. É esse endereço que o blueprint manda para o n8n e que o
        merge de copy procura na hora de montar o email.
      </p>

      {audit.ok && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: "#067647",
          }}
        >
          <Check size={14} />
          {audit.anchored.length} campo(s) ancorado(s), nenhuma tag sobrando.
        </div>
      )}

      {audit.missing.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: RED,
              marginBottom: 6,
            }}
          >
            <AlertTriangle size={13} />
            Campos do schema sem endereço no HTML — a copy não tem onde entrar
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {audit.missing.map((m) => (
              <Row key={m.key} tone="red">
                <code style={code}>{m.key}</code>
                <span>precisa de</span>
                <code style={code}>{`{{${m.placeholder}}}`}</code>
                {m.legacyTag && (
                  <span>
                    — o HTML usa <code style={code}>{`{{${m.legacyTag}}}`}</code>{" "}
                    nesse papel: renomeie a tag.
                  </span>
                )}
                {!m.legacyTag && <span>— e o HTML não tem nada equivalente.</span>}
              </Row>
            ))}
          </div>
        </div>
      )}

      {audit.orphans.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: AMBER,
              marginBottom: 6,
            }}
          >
            <AlertTriangle size={13} />
            Tags do HTML sem campo no schema — ninguém preenche
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {audit.orphans.map((o) => (
              <Row key={o.tag} tone="amber">
                <code style={code}>{`{{${o.tag}}}`}</code>
                <span>
                  {o.kind === "copy"
                    ? "é tag de copy do registry, mas nenhum campo do schema a reivindica."
                    : "está fora do registry e fora do schema."}{" "}
                  Crie o campo com a key{" "}
                  <code style={code}>{o.tag.toLowerCase()}</code> ou remova o
                  slot do HTML.
                </span>
              </Row>
            ))}
          </div>
        </div>
      )}
    </EGCard>
  )
}
