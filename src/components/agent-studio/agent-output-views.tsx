"use client"

/**
 * Saídas LEGÍVEIS por agente da fase 1 (Curador, Montador, Blueprint,
 * Assunto) — o mesmo princípio do painel do Estruturador: a decisão da IA
 * tem de ser lida sem decodificar JSON.
 *
 * Cada view lê o `parsed_output` da run e DEGRADA em silêncio quando o
 * campo que ela precisa não existe (runs anteriores ao PR de telemetria
 * legível) — devolve null e o `CodeBlock` com o JSON cru, que continua
 * logo abaixo, segue sendo a verdade completa.
 */

import { C, F, TNUM } from "@/components/email-generation/ui/eg-theme"

import {
  OUT_BODY,
  OutCard,
  OutItem,
  OutPill,
  OutSection,
} from "./studio-atoms"

// ── Shapes tolerantes (a run é a fonte; a UI não valida) ────────────────

interface RankingOpcao {
  rank?: number
  variant_id?: string
  name?: string
  motivo?: string
}
interface RankingPosicao {
  block_index?: number
  section?: string
  label?: string
  opcoes?: RankingOpcao[]
}
interface EscolhaView {
  block_index?: number
  variant_id?: string
  variant_name?: string | null
  section?: string | null
  label?: string | null
  rank?: number
  motivo?: string | null
}
interface BlocoView {
  position?: number
  type?: string
  label?: string
  papel?: string | null
  needs_image?: boolean
  campos?: number
  variant_name?: string | null
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Cabeçalho "3. produtos · Papel da posição" reusado pelas views. */
function PosicaoHead({
  index,
  section,
  label,
}: {
  index: number | undefined
  section: string | null | undefined
  label: string | null | undefined
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span style={{ ...OUT_BODY, fontWeight: 700, ...TNUM }}>
        {index != null ? `${index + 1}.` : "•"}
      </span>
      <span style={{ ...OUT_BODY, fontWeight: 700 }}>{section ?? "?"}</span>
      {label && label !== section && (
        <span style={{ ...OUT_BODY, color: C.g500 }}>{label}</span>
      )}
    </div>
  )
}

// ── Curador: o ranking por posição ──────────────────────────────────────

export function CuradorRankingView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const posicoes = asArray<RankingPosicao>(o.ranking_detalhado)
  if (posicoes.length === 0) return null

  const excluidas = o.candidates_excluded_unfillable as
    | Record<string, string[]>
    | number
    | undefined
  const nExcluidas =
    typeof excluidas === "number"
      ? excluidas
      : Object.values(excluidas ?? {}).reduce((n, arr) => n + arr.length, 0)

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill text={`${o.catalog_variants ?? "?"} variantes no catálogo`} tone="neut" />
        <OutPill text={`${posicoes.length} posições rankeadas`} tone="info" />
        {Number(o.attempts ?? 1) > 1 && (
          <OutPill text={`${o.attempts} tentativas`} tone="warn" />
        )}
        {asArray(o.empty_blocks).length > 0 && (
          <OutPill
            text={`${asArray(o.empty_blocks).length} posição(ões) sem finalista`}
            tone="warn"
          />
        )}
        {nExcluidas > 0 && (
          <OutPill text={`${nExcluidas} variante(s) impreenchível(is)`} tone="warn" />
        )}
      </div>

      <OutSection title="Ranking por posição">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {posicoes.map((p, i) => (
            <OutItem key={p.block_index ?? i}>
              <PosicaoHead index={p.block_index} section={p.section} label={p.label} />
              <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                {asArray<RankingOpcao>(p.opcoes).map((op, j) => (
                  <div key={op.variant_id ?? j} style={{ ...OUT_BODY }}>
                    <span
                      style={{
                        ...TNUM,
                        color: op.rank === 1 ? C.g900 : C.g400,
                        fontWeight: op.rank === 1 ? 700 : 500,
                      }}
                    >
                      {op.rank ?? j + 1}º
                    </span>{" "}
                    <span style={{ fontWeight: op.rank === 1 ? 600 : 400 }}>
                      {op.name ?? op.variant_id ?? "—"}
                    </span>
                    {op.motivo && (
                      <div style={{ ...OUT_BODY, color: C.g500, marginTop: 1 }}>
                        {op.motivo}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </OutItem>
          ))}
        </div>
      </OutSection>

      {(asArray(o.invalid_ids).length > 0 || asArray(o.wrong_type_ids).length > 0) && (
        <OutSection title="Escolhas inválidas (descartadas pelo parser)">
          <div style={{ ...OUT_BODY, color: C.g500 }}>
            {asArray(o.invalid_ids).length > 0 && (
              <div>{asArray(o.invalid_ids).length} id(s) fora do catálogo</div>
            )}
            {asArray(o.wrong_type_ids).length > 0 && (
              <div>{asArray(o.wrong_type_ids).length} id(s) de outra seção</div>
            )}
          </div>
        </OutSection>
      )}
    </OutCard>
  )
}

// ── Montador: a composição final ────────────────────────────────────────

export function MontadorEscolhasView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const escolhas = asArray<EscolhaView>(o.escolhas)
  if (escolhas.length === 0) return null

  // O motivo só existe quando o Montador SAIU do rank 1 — é o que explica a
  // correção sobre o Curador.
  const motivoPorBloco = new Map<number, string>()
  for (const d of asArray<EscolhaView>(o.desvios_por_posicao)) {
    if (d.block_index != null && d.motivo) motivoPorBloco.set(d.block_index, d.motivo)
  }
  const puladas = asArray<{ block_index?: number }>(o.blocks_skipped)

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {o.degraded === true && (
          <OutPill text="degradado — caiu no rank 1 do Curador" tone="warn" />
        )}
        <OutPill text={`${o.blocks_assembled ?? escolhas.length} bloco(s) montado(s)`} tone="pos" />
        <OutPill
          text={
            Number(o.desvios ?? 0) === 0
              ? "sem desvios do Curador"
              : `${o.desvios} desvio(s) do rank 1`
          }
          tone={Number(o.desvios ?? 0) === 0 ? "neut" : "info"}
        />
        {puladas.length > 0 && (
          <OutPill text={`${puladas.length} posição(ões) fora do email`} tone="warn" />
        )}
      </div>

      <OutSection title="Escolha por posição">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {escolhas.map((e, i) => {
            const motivo = e.block_index != null ? motivoPorBloco.get(e.block_index) : undefined
            const foraDoEmail = puladas.some((p) => p.block_index === e.block_index)
            return (
              <OutItem key={e.block_index ?? i}>
                <PosicaoHead index={e.block_index} section={e.section} label={e.label} />
                <div
                  style={{
                    ...OUT_BODY,
                    marginTop: 3,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {e.variant_name ?? e.variant_id ?? "—"}
                  </span>
                  <OutPill
                    text={`rank ${e.rank ?? "?"}`}
                    tone={e.rank === 1 ? "neut" : "info"}
                  />
                  {foraDoEmail && <OutPill text="não entrou no email" tone="warn" />}
                </div>
                {motivo && (
                  <div style={{ ...OUT_BODY, color: C.g500, marginTop: 2 }}>
                    <strong>Por que saiu do 1º:</strong> {motivo}
                  </div>
                )}
              </OutItem>
            )
          })}
        </div>
      </OutSection>
    </OutCard>
  )
}

// ── Blueprint: os blocos decididos ──────────────────────────────────────

export function BlueprintBlocosView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const blocos = asArray<BlocoView>(o.blocos)
  if (blocos.length === 0) return null
  const fio = typeof o.fio_narrativo === "string" ? o.fio_narrativo : null

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill
          text={o.blueprint_path === "deterministic" ? "determinístico" : "LLM (fallback)"}
          tone={o.blueprint_path === "deterministic" ? "pos" : "warn"}
        />
        <OutPill text={`${blocos.length} bloco(s)`} tone="neut" />
        {o.estruturador_consumido === true && (
          <OutPill text="papéis do Estruturador aplicados" tone="info" />
        )}
        {Number(o.schema_anchor_issue_count ?? 0) > 0 && (
          <OutPill
            text={`${o.schema_anchor_issue_count} campo(s) sem âncora no HTML`}
            tone="warn"
          />
        )}
      </div>

      {fio && (
        <OutSection title="Fio narrativo">
          <div style={{ ...OUT_BODY, fontStyle: "italic" }}>{fio}</div>
        </OutSection>
      )}

      <OutSection title="Blocos">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {blocos.map((b, i) => (
            <OutItem key={b.position ?? i}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...OUT_BODY, fontWeight: 700, ...TNUM }}>
                  {b.position ?? i + 1}.
                </span>
                <span style={{ ...OUT_BODY, fontWeight: 700 }}>{b.type ?? "?"}</span>
                {b.variant_name && <OutPill text={b.variant_name} tone="neut" />}
                {b.needs_image && <OutPill text="imagem" tone="info" />}
                {b.campos != null && (
                  <span style={{ ...OUT_BODY, color: C.g400, ...TNUM }}>
                    {b.campos} campo(s)
                  </span>
                )}
              </div>
              {/* O papel é a 1ª linha do purpose — onde o Estruturador
                  escreve o que a posição cumpre no arco. */}
              {b.papel && (
                <div style={{ ...OUT_BODY, marginTop: 3 }}>{b.papel}</div>
              )}
              {b.label && b.label !== b.type && (
                <div style={{ ...OUT_BODY, color: C.g500, marginTop: 2 }}>{b.label}</div>
              )}
            </OutItem>
          ))}
        </div>
      </OutSection>
    </OutCard>
  )
}

// ── Assunto: o par subject/messaging ────────────────────────────────────

export function AssuntoView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const subject = typeof o.subject_hint === "string" ? o.subject_hint : null
  const messaging = typeof o.messaging === "string" ? o.messaging : null
  if (!subject && !messaging) return null

  return (
    <OutCard>
      <OutSection title="Linha de assunto">
        <div style={{ ...OUT_BODY, fontSize: 13, fontWeight: 600 }}>
          {subject ?? "— não gerada (fallback determinístico) —"}
        </div>
        {subject && (
          <div style={{ ...OUT_BODY, color: C.g400, marginTop: 2, ...TNUM }}>
            {subject.length} caracteres
          </div>
        )}
      </OutSection>
      {messaging && (
        <OutSection title="Direção editorial (messaging)">
          <div style={{ ...OUT_BODY, fontFamily: F.sans }}>{messaging}</div>
        </OutSection>
      )}
    </OutCard>
  )
}

// ── Fase 2: hero, imagem e QA ───────────────────────────────────────────

interface HeroReportView {
  imagem?: string
  campos_vazios?: string[]
  linhas_removidas?: string[]
  logo?: string
}

/** Hero: o que o agente declara ter feito com a região. */
export function HeroSectionView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const rep = (o.hero_report ?? null) as HeroReportView | null
  if (!rep && o.graft_status == null) return null

  const grafted = o.graft_status === "grafted"
  const vazios = asArray<string>(rep?.campos_vazios)
  const removidas = asArray<string>(rep?.linhas_removidas)

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill
          text={grafted ? "variante enxertada por código" : `enxerto: ${o.graft_status ?? "?"}`}
          tone={grafted ? "pos" : "warn"}
        />
        {o.hero_source === "library" && <OutPill text="região da biblioteca" tone="info" />}
        {o.variant_mismatch === true && (
          <OutPill text="blueprint × slot_map divergiram" tone="warn" />
        )}
        {o.hero_report_missing === true && (
          <OutPill text="sem relatório do agente" tone="warn" />
        )}
      </div>

      {rep && (
        <OutSection title="O que o agente declara">
          <div style={{ ...OUT_BODY, display: "flex", flexDirection: "column", gap: 3 }}>
            <div>
              <strong>Imagem:</strong> {rep.imagem ?? "—"}
              {rep.logo ? ` · Logo: ${rep.logo}` : ""}
            </div>
            {/* O que ele REMOVEU é o que costuma explicar uma hero estranha. */}
            <div>
              <strong>Linhas removidas:</strong>{" "}
              {removidas.length > 0 ? removidas.join(", ") : "nenhuma"}
            </div>
            <div>
              <strong>Campos sem copy:</strong>{" "}
              {vazios.length > 0 ? vazios.join(", ") : "nenhum"}
            </div>
          </div>
        </OutSection>
      )}

      {o.rendered_reference != null && (
        <OutSection title="Exemplo de acabamento">
          <div style={{ ...OUT_BODY, color: C.g500 }}>
            {(() => {
              const rr = o.rendered_reference as Record<string, unknown>
              return `${rr.used ? "usado" : "não usado"} — ${String(rr.reason ?? "sem motivo")}${rr.stale ? " (desatualizado)" : ""}`
            })()}
          </div>
        </OutSection>
      )}
    </OutCard>
  )
}

/** Imagem: a imagem gerada, não a URL. */
export function ImageGeradaView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const url = typeof o.imageUrl === "string" ? o.imageUrl : null
  if (!url) return null

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {typeof o.fieldKey === "string" && <OutPill text={o.fieldKey} tone="info" />}
        {typeof o.role === "string" && <OutPill text={String(o.role)} tone="neut" />}
        {o.kind === "testimonial_avatar" && <OutPill text="avatar de depoimento" tone="neut" />}
        {typeof o.trigger === "string" && <OutPill text={String(o.trigger)} tone="neut" />}
      </div>
      {/* A imagem em si: era uma URL perdida no meio do JSON. */}
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt=""
          style={{
            width: "100%",
            maxHeight: 320,
            objectFit: "contain",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: C.g50,
            display: "block",
          }}
        />
      </a>
      <div style={{ ...OUT_BODY, color: C.g400, marginTop: 6, wordBreak: "break-all" }}>
        {url}
      </div>
    </OutCard>
  )
}

interface QaIssueView {
  type?: string
  severity?: string
  message?: string
  location?: string
}

/** QA: o veredito e o que reprovou. */
export function QaView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  if (o.passed == null && o.issues_count == null) return null
  const sev = (o.issues_by_severity ?? {}) as Record<string, number>
  const issues = asArray<QaIssueView>(o.issues)

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill
          text={o.passed === true ? "aprovado" : "reprovado"}
          tone={o.passed === true ? "pos" : "warn"}
        />
        {(sev.high ?? 0) > 0 && <OutPill text={`${sev.high} alta`} tone="warn" />}
        {(sev.medium ?? 0) > 0 && <OutPill text={`${sev.medium} média`} tone="neut" />}
        {(sev.low ?? 0) > 0 && <OutPill text={`${sev.low} baixa`} tone="neut" />}
        {o.vision_ran === true && <OutPill text="visão rodou" tone="info" />}
        {o.deterministic_only === true && (
          <OutPill text="só checagens determinísticas" tone="neut" />
        )}
      </div>

      {issues.length > 0 && (
        <OutSection title={`Achados (${issues.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {issues.map((iss, i) => (
              <OutItem key={i}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <OutPill
                    text={iss.severity ?? "?"}
                    tone={iss.severity === "high" ? "warn" : "neut"}
                  />
                  <span style={{ ...OUT_BODY, fontWeight: 600 }}>{iss.type ?? "?"}</span>
                </div>
                <div style={{ ...OUT_BODY, marginTop: 3 }}>{iss.message ?? "—"}</div>
                {iss.location && (
                  <div style={{ ...OUT_BODY, color: C.g500, marginTop: 2 }}>
                    {iss.location}
                  </div>
                )}
              </OutItem>
            ))}
          </div>
        </OutSection>
      )}
    </OutCard>
  )
}

/** Roteia a view legível pelo agente do nó. null = sem view própria. */
export function AgentOutputView({
  agent,
  output,
}: {
  agent: string | undefined
  output: unknown
}) {
  switch (agent) {
    case "assembler_chooser":
      return <CuradorRankingView output={output} />
    case "assembler":
      return <MontadorEscolhasView output={output} />
    case "blueprint":
      return <BlueprintBlocosView output={output} />
    case "subject":
      return <AssuntoView output={output} />
    case "hero_section":
      return <HeroSectionView output={output} />
    case "image":
      return <ImageGeradaView output={output} />
    case "qa":
    case "qavision":
      return <QaView output={output} />
    default:
      return null
  }
}
