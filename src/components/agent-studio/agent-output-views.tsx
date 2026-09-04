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

/** Uma posição no formato do Curador do vault (ranking justificado). */
interface PosicaoJustificada {
  block_index?: number
  section?: string
  justificativa?: string
  escolhas?: Array<{
    rank?: number
    variant_id?: string
    variante?: string
    motivo?: string
  }>
}

export function CuradorRankingView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  // Dois formatos convivem: `ranking_detalhado` é o do Curador antigo
  // (kimi, metadados do banco) e `ranking_justificado` é o do Curador do
  // vault, que traz o TRAÇO da decisão por posição. Ler só o primeiro era o
  // motivo de a tela devolver JSON cru quando o segundo aparecia.
  const justificado = asArray<PosicaoJustificada>(o.ranking_justificado)
  const posicoes: RankingPosicao[] =
    asArray<RankingPosicao>(o.ranking_detalhado).length > 0
      ? asArray<RankingPosicao>(o.ranking_detalhado)
      : justificado.map((p) => ({
          block_index: p.block_index,
          section: p.section,
          opcoes: (p.escolhas ?? []).map((e, i) => ({
            rank: e.rank ?? i + 1,
            variant_id: e.variant_id,
            name: e.variante ?? e.variant_id,
            motivo: e.motivo,
          })),
        }))
  const justificativaPorPosicao = new Map(
    justificado
      .filter((p) => typeof p.block_index === "number" && p.justificativa)
      .map((p) => [p.block_index as number, p.justificativa as string]),
  )
  const estrutura = asArray<{ section?: string; papel?: string }>(o.estrutura)
  const semVariante = asArray<{
    block_index?: number
    section?: string
    justificativa?: string
  }>(o.posicoes_sem_variante)
  const divergente = o.estrutura_divergente as
    | { total?: number; detalhe?: string }
    | null
    | undefined
  // Variantes em que a prosa do vault e o cadastro do banco descrevem
  // peças diferentes. O catálogo passou a servir as duas descrições; aqui a
  // contradição vira linha visível, com o slug para consertar no Obsidian.
  const catalogoDivergente = asArray<{
    slug?: string
    variant_id?: string
    name?: string
    vault?: string
    banco?: string
    similaridade?: number
  }>(o.catalogo_divergente)
  const modo = typeof o.curador_vault_mode === "string" ? o.curador_vault_mode : null
  const ehShadow = o.shadow === true
  // Consultas ao Obsidian sob demanda (02/09): cada chamada de ferramenta,
  // na ordem. `consultou_vault` false = decidiu só com o prompt.
  const consultas = asArray<{
    ferramenta?: string
    argumento?: string
    chars?: number
    ms?: number
    erro?: string
  }>(o.consultas_ao_vault)

  if (posicoes.length === 0 && estrutura.length === 0) return null

  const excluidas = o.candidates_excluded_unfillable as
    | Record<string, string[]>
    | number
    | undefined
  const nExcluidas =
    typeof excluidas === "number"
      ? excluidas
      : Object.values(excluidas ?? {}).reduce((n, arr) => n + arr.length, 0)

  const retipadas = asArray<{ block_index?: number; from?: string; to?: string }>(
    o.retyped_positions,
  )
  const formaPorPosicao = new Map(
    retipadas
      .filter((r) => typeof r.block_index === "number")
      .map((r) => [r.block_index as number, `${r.from ?? "?"} → ${r.to ?? "?"}`]),
  )

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {modo === "on" && !ehShadow && (
          <OutPill text="Curador do vault — protocolo" tone="pos" />
        )}
        {ehShadow && <OutPill text="shadow — saída NÃO consumida" tone="warn" />}
        <OutPill text={`${o.catalog_variants ?? "?"} variantes no catálogo`} tone="neut" />
        <OutPill text={`${posicoes.length} posições rankeadas`} tone="info" />
        {/* A pergunta que a virada existe para responder: ele seguiu a
            arquitetura? Vale mesmo quando seguiu — silêncio aqui seria a
            mesma ambiguidade de antes. */}
        {estrutura.length > 0 && (
          <OutPill
            text={
              divergente
                ? `estrutura ALTERADA — ${divergente.total} desvio(s), corrigidos`
                : "seguiu a arquitetura do email"
            }
            tone={divergente ? "warn" : "pos"}
          />
        )}
        {semVariante.length > 0 && (
          <OutPill
            text={`${semVariante.length} posição(ões) sem variante na biblioteca`}
            tone="warn"
          />
        )}
        {o.estruturador_consumido === true && (
          <OutPill text="decisão do Estruturador servida" tone="info" />
        )}
        {o.consultou_vault === true ? (
          <OutPill text={`consultou o Obsidian ${consultas.length}×`} tone="info" />
        ) : (
          o.consultou_vault === false && <OutPill text="sem consulta ao Obsidian" tone="neut" />
        )}
        {o.fallback_sem_ferramentas === true && (
          <OutPill text="ferramentas falharam — respondeu sem consultar" tone="warn" />
        )}
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
        {/* Escolha de outra seção: a posição adotou a forma da variante.
            Antes isso era descarte silencioso — e quando era a única
            escolha da posição, o bloco sumia do email. */}
        {retipadas.length > 0 && (
          <OutPill
            text={`${retipadas.length} posição(ões) com forma trocada`}
            tone="info"
          />
        )}
        {catalogoDivergente.length > 0 && (
          <OutPill
            text={`${catalogoDivergente.length} variante(s) com vault × banco divergentes`}
            tone="warn"
          />
        )}
      </div>

      {catalogoDivergente.length > 0 && (
        <OutSection title="Vault e banco descrevem peças diferentes">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {catalogoDivergente.map((d, i) => (
              <OutItem key={d.variant_id ?? i}>
                <div style={{ ...OUT_BODY, fontWeight: 700, color: "#B91C1C" }}>
                  {d.slug ?? "?"} → {d.name ?? d.variant_id ?? "?"}
                  {typeof d.similaridade === "number" && (
                    <span style={{ ...TNUM, fontWeight: 400, color: C.g500 }}>
                      {" "}· semelhança {d.similaridade}
                    </span>
                  )}
                </div>
                <div style={{ ...OUT_BODY, color: C.g500, marginTop: 3, fontFamily: F.sans }}>
                  <b>vault:</b> {d.vault}
                </div>
                <div style={{ ...OUT_BODY, color: C.g500, marginTop: 2, fontFamily: F.sans }}>
                  <b>banco:</b> {d.banco}
                </div>
              </OutItem>
            ))}
          </div>
          <div style={{ ...OUT_BODY, color: C.g500, marginTop: 6 }}>
            O HTML montado é o da linha do BANCO. As duas descrições vão no
            catálogo para o Curador não decidir sobre uma peça e receber
            outra — o conserto é o `variant_id` da nota no Obsidian.
          </div>
        </OutSection>
      )}

      {divergente?.detalhe && (
        <OutSection title="O que ele tentou mudar na sequência (e foi desarmado)">
          <div style={{ ...OUT_BODY, color: "#92400E", fontFamily: F.sans }}>
            {divergente.detalhe}
          </div>
          <div style={{ ...OUT_BODY, color: C.g500, marginTop: 4 }}>
            A sequência que valeu é a da aba Arquitetura. Isto é sinal sobre o
            prompt, não sobre o email.
          </div>
        </OutSection>
      )}

      {semVariante.length > 0 && (
        <OutSection title="Posições que a biblioteca não cobre">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {semVariante.map((p, i) => (
              <OutItem key={p.block_index ?? i}>
                <div
                  style={{
                    ...OUT_BODY,
                    fontWeight: 700,
                    color: "#B91C1C",
                  }}
                >
                  {(p.block_index ?? i) + 1}. {p.section ?? "?"} — sem variante elegível
                </div>
                {p.justificativa && (
                  <div style={{ ...OUT_BODY, color: C.g500, marginTop: 3, fontFamily: F.sans }}>
                    {p.justificativa}
                  </div>
                )}
              </OutItem>
            ))}
          </div>
          {/* Com a sequência fixa, a posição não some mais: ela fica e cai no
              template global. Sem este aviso, o bloco chega ao cliente com o
              texto do template e ninguém sabe por quê. */}
          <div style={{ ...OUT_BODY, color: C.g500, marginTop: 6 }}>
            Estas posições ficam na peça e caem no bloco do template global —
            cadastrar a variante na aba Componentes é o que fecha a lacuna.
          </div>
        </OutSection>
      )}

      {estrutura.some((e) => (e.papel ?? "").trim()) && (
        <OutSection title="Papel de cada posição">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {estrutura.map((e, i) => (
              <OutItem key={i}>
                <PosicaoHead index={i} section={e.section} label={null} />
                <div
                  style={{
                    ...OUT_BODY,
                    fontFamily: F.sans,
                    marginTop: 3,
                    color: (e.papel ?? "").trim() ? C.g900 : "#92400E",
                  }}
                >
                  {(e.papel ?? "").trim() ||
                    "sem papel — o bloco fica com a orientação da variante"}
                </div>
              </OutItem>
            ))}
          </div>
          <div style={{ ...OUT_BODY, color: C.g500, marginTop: 6 }}>
            É o que vira o <code>purpose</code> de cada bloco e desce até a copy.
          </div>
        </OutSection>
      )}

      {typeof o.fio_narrativo === "string" && o.fio_narrativo.trim() && (
        <OutSection title="Fio narrativo">
          <div style={{ ...OUT_BODY, fontFamily: F.sans }}>
            {o.fio_narrativo as string}
          </div>
        </OutSection>
      )}

      {consultas.length > 0 && (
        <OutSection title="Consultas ao Obsidian (na ordem)">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {consultas.map((c, i) => (
              <OutItem key={i}>
                <div style={{ ...OUT_BODY, fontFamily: F.sans }}>
                  <b>{c.ferramenta ?? "?"}</b> · {c.argumento ?? ""}
                  <span style={{ ...TNUM, color: C.g500 }}>
                    {" "}· {Number(c.chars ?? 0).toLocaleString("pt-BR")} chars · {Number(c.ms ?? 0)} ms
                  </span>
                  {c.erro && <span style={{ color: "#B91C1C" }}> · {c.erro}</span>}
                </div>
              </OutItem>
            ))}
          </div>
        </OutSection>
      )}

      <OutSection title="Ranking por posição">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {posicoes.map((p, i) => (
            <OutItem key={p.block_index ?? i}>
              <PosicaoHead index={p.block_index} section={p.section} label={p.label} />
              {formaPorPosicao.has(p.block_index as number) && (
                <div style={{ marginTop: 4 }}>
                  <OutPill
                    text={`forma trocada: ${formaPorPosicao.get(p.block_index as number)}`}
                    tone="info"
                  />
                </div>
              )}
              {justificativaPorPosicao.has(p.block_index as number) && (
                <div
                  style={{
                    ...OUT_BODY,
                    color: C.g500,
                    fontFamily: F.sans,
                    marginTop: 4,
                  }}
                >
                  {justificativaPorPosicao.get(p.block_index as number)}
                </div>
              )}
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

/** Por que este email não usou a estrutura do Estruturador. */
function estruturadorAusente(status: unknown): string {
  const base = "estrutura do outline genérico"
  switch (status) {
    case "desligado":
      return `${base} — Estruturador desligado`
    case "sem_material":
      return `${base} — sem material no vault para este flow`
    case "falhou":
      return `${base} — o Estruturador falhou`
    case "text_only":
      return `${base} — text_only não é consumido nesta versão`
    default:
      return `${base} — sem papéis do Estruturador`
  }
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
        {o.estruturador_consumido === true ? (
          <OutPill text="papéis do Estruturador aplicados" tone="info" />
        ) : (
          // O contrário do "aplicados" não existia: email montado na
          // estrutura genérica do outline saía sem marca nenhuma, e o motivo
          // só vivia no log de servidor.
          <OutPill text={estruturadorAusente(o.estruturador_status)} tone="warn" />
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
        {/* Faixa que recebe texto por cima. O veredito vem PRONTO da run
            (`overlayLight`): o corte mora ao lado do `sharp`, no servidor,
            e reimplementá-lo aqui criaria uma segunda régua. */}
        {typeof o.overlayLuminance === "number" && (
          <OutPill
            text={
              o.overlayLight === true
                ? `overlay claro (${o.overlayLuminance.toFixed(2)}) — texto corrigido`
                : `overlay escuro (${o.overlayLuminance.toFixed(2)})`
            }
            tone={o.overlayLight === true ? "warn" : "neut"}
          />
        )}
      </div>
      {/* A imagem em si: era uma URL perdida no meio do JSON. */}
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
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

// ── Copy do n8n: adesão ao contrato e o que estourou ────────────────────
//
// O agente `copy` não tinha view: caía no `default` do switch e virava JSON
// cru. Foi assim que 74 campos acima do limite num único dia (27/08)
// passaram sem ninguém ver — o dado estava em `parsed_output.desvios` desde
// sempre, sem leitor.

interface DesvioView {
  position?: number
  type?: string
  key?: string
  kind?: string
  length?: number
  max_len?: number
}

const ROTULO_DE_DESVIO: Record<string, string> = {
  max_len: "acima do limite",
  missing: "não veio",
  required_empty: "obrigatório vazio",
  unknown_key: "fora do contrato",
  sem_contrato: "bloco sem contrato",
}

export function CopyContratoView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const contrato = (o.contrato ?? null) as Record<string, unknown> | null
  // `desvios_pre_fit` é o que o n8n entregou; `desvios` é o que sobrou
  // depois do encurtador. Sem encurtador, os dois são a mesma coisa.
  const vigentes = asArray<DesvioView>(o.desvios)
  const antesDoFit = asArray<DesvioView>(o.desvios_pre_fit)
  const fit = (o.copy_fit ?? null) as Record<string, unknown> | null
  if (!contrato && vigentes.length === 0 && antesDoFit.length === 0) return null

  const doN8n = antesDoFit.length > 0 ? antesDoFit : vigentes
  const estourosOriginais = doN8n.filter((d) => d.kind === "max_len")
  const estourosVigentes = vigentes.filter((d) => d.kind === "max_len")
  const taxa = contrato?.taxa_pct
  const porKind = new Map<string, number>()
  for (const d of vigentes) {
    const k = d.kind ?? "?"
    porKind.set(k, (porKind.get(k) ?? 0) + 1)
  }

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill
          text={`${o.blocks_written ?? "?"}/${o.blocks_total ?? "?"} bloco(s) gravado(s)`}
          tone="pos"
        />
        {typeof taxa === "number" && (
          <OutPill
            text={`${taxa}% das chaves no contrato`}
            tone={taxa === 100 ? "pos" : taxa === 0 ? "warn" : "info"}
          />
        )}
        <OutPill
          text={
            estourosVigentes.length === 0
              ? estourosOriginais.length === 0
                ? "tudo dentro do limite"
                : `${estourosOriginais.length} estouro(s) corrigido(s)`
              : `${estourosVigentes.length} campo(s) acima do limite`
          }
          tone={estourosVigentes.length === 0 ? "pos" : "warn"}
        />
        {fit && (
          <OutPill
            text={`encurtador: ${fit.corrigidos ?? 0} corrigido(s), ${fit.mantidos ?? 0} mantido(s)`}
            tone="info"
          />
        )}
      </div>

      {/* O encurtador falhou e a geração seguiu (fail-open). O run PRÓPRIO
          dele é o lugar natural desse dado — e é justamente o que some
          quando a telemetria falha. Aqui a resposta sempre existe. */}
      {fit && typeof fit.erro === "string" && (
        <OutSection title="O encurtador não completou">
          <div style={{ ...OUT_BODY, color: "#92400E", fontFamily: F.sans }}>
            {fit.erro}
          </div>
        </OutSection>
      )}
      {fit &&
        fit.recusas != null &&
        typeof fit.recusas === "object" &&
        Object.keys(fit.recusas as Record<string, number>).length > 0 && (
          <OutSection title="Por que as reescritas foram recusadas">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(fit.recusas as Record<string, number>).map(
                ([motivo, n]) => (
                  <OutPill
                    key={motivo}
                    text={`${n}× ${MOTIVO_DE_RECUSA[motivo] ?? motivo}`}
                    tone="warn"
                  />
                ),
              )}
            </div>
          </OutSection>
        )}

      {estourosOriginais.length > 0 && (
        <OutSection
          title={
            fit
              ? "O que o n8n entregou acima do limite"
              : "Campos acima do limite"
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {estourosOriginais.map((d, i) => {
              const aindaFora = estourosVigentes.some(
                (v) => v.position === d.position && v.key === d.key,
              )
              return (
                <OutItem key={`${d.position}-${d.key}-${i}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ ...OUT_BODY, fontWeight: 600 }}>{d.key}</span>
                    <span style={{ ...OUT_BODY, color: C.g400 }}>
                      {d.type ?? "?"} · posição {d.position ?? "?"}
                    </span>
                    <span
                      style={{
                        ...OUT_BODY,
                        ...TNUM,
                        marginLeft: "auto",
                        fontWeight: 600,
                        color: aindaFora ? "#B91C1C" : C.g400,
                      }}
                    >
                      {d.length ?? "?"}/{d.max_len ?? "?"}
                    </span>
                    {fit && (
                      <OutPill
                        text={aindaFora ? "não coube" : "encurtado"}
                        tone={aindaFora ? "warn" : "pos"}
                      />
                    )}
                  </div>
                </OutItem>
              )
            })}
          </div>
        </OutSection>
      )}

      {porKind.size > 0 && (
        <OutSection title="Outros desvios do contrato">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...porKind.entries()]
              .filter(([k]) => k !== "max_len")
              .map(([k, n]) => (
                <OutPill key={k} text={`${n} ${ROTULO_DE_DESVIO[k] ?? k}`} tone="warn" />
              ))}
          </div>
        </OutSection>
      )}
    </OutCard>
  )
}

// ── Encurtador: o antes e o depois, campo a campo ───────────────────────

interface DeParaView {
  position?: number
  key?: string
  antes?: string
  antes_len?: number
  depois?: string | null
  depois_len?: number | null
  max?: number
  aceito?: boolean
  motivo?: string
  /** "max_len" | "travessao" | "idioma" — um campo pode ter mais de um. */
  motivos?: string[]
  tracos_antes?: number
  tracos_depois?: number
  idioma_antes?: string
  idioma_depois?: string
}

const MOTIVO_DE_RECUSA: Record<string, string> = {
  igual_a_irmao: "o item criado repete um irmão da lista",
  ainda_acima_do_limite: "a reescrita continuou acima do limite",
  vazio: "veio vazia",
  identico: "devolveu a mesma frase",
  cresceu: "ficou maior que a original",
  abaixo_do_minimo: "ficou abaixo do mínimo do campo",
  sem_resposta: "o agente não respondeu por este campo",
  traco_permaneceu: "a reescrita manteve o travessão",
  idioma_permaneceu: "a reescrita voltou no idioma errado",
  mudou_de_idioma: "a reescrita trocou a língua do campo",
}

export function CopyFitView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const dePara = asArray<DeParaView>(o.de_para)
  if (dePara.length === 0 && o.alvos == null) return null

  // O agente tem DOIS motivos para pegar um campo: estouro do limite e
  // travessão. Chamar todo alvo de "acima do limite" era mentira para o
  // segundo — e o número que diz se ele cumpriu (`travessoes_depois`)
  // existia no JSON sem nenhum leitor.
  const total = Number(o.alvos ?? dePara.length)
  const comTravessao = Number(o.com_travessao ?? 0)
  // O terceiro motivo (01/09): o campo voltou do n8n na língua errada. A
  // ordem de idioma VAI no payload — este número é o tamanho do que o flow
  // ignora, e `idioma_errado_depois` diz quanto ficou sem conserto.
  const comIdioma = Number(o.com_idioma_errado ?? 0)
  const idiomaEsperado = typeof o.idioma_esperado === "string" ? o.idioma_esperado : ""
  const idiomaErradoDepois = Number(o.idioma_errado_depois ?? 0)
  const traducoesRecusadas = Number(o.traducoes_recusadas ?? 0)
  // Item de lista que o gerador pulou (02/09): quantos entraram e quantos
  // o modelo criou. O resto sai do email pelo merge.
  const comAusente = Number(o.com_ausente ?? 0)
  const ausentesPreenchidos = Number(o.ausentes_preenchidos ?? 0)
  // Um campo pode ter mais de um motivo (estourou E tem traço), então isto
  // NÃO é uma partição: cada número conta quantos campos têm aquele motivo.
  // Contar por subtração dava negativo assim que o terceiro motivo entrou.
  const porEstouro =
    dePara.length > 0
      ? dePara.filter((d) => (d.motivos ?? ["max_len"]).includes("max_len")).length
      : Math.max(0, total - comTravessao - comIdioma)
  const antes = o.travessoes_antes
  const depois = o.travessoes_depois
  const mediuTravessao = typeof antes === "number" && typeof depois === "number"

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <OutPill text={`${total} campo(s) a corrigir`} tone="warn" />
        {(comTravessao > 0 || comIdioma > 0) && (
          <OutPill
            text={[
              porEstouro > 0 ? `${porEstouro} por estouro` : "",
              comTravessao > 0 ? `${comTravessao} por travessão` : "",
              comIdioma > 0 ? `${comIdioma} por idioma` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            tone="info"
          />
        )}
        <OutPill text={`${o.corrigidos ?? 0} reescrito(s)`} tone="pos" />
        {traducoesRecusadas > 0 && (
          <OutPill text={`${traducoesRecusadas} tradução(ões) recusada(s)`} tone="warn" />
        )}
        {comAusente > 0 && (
          <OutPill
            text={`${ausentesPreenchidos}/${comAusente} item(ns) ausente(s) criado(s)`}
            tone={ausentesPreenchidos === comAusente ? "pos" : "warn"}
          />
        )}
        {Number(o.mantidos ?? 0) > 0 && (
          <OutPill text={`${o.mantidos} mantido(s) como estava(m)`} tone="warn" />
        )}
        {mediuTravessao && (
          <OutPill
            text={`travessões ${antes} → ${depois}`}
            tone={depois === 0 ? "pos" : "warn"}
          />
        )}
        {comIdioma > 0 && (
          <>
            <OutPill
              text={`${comIdioma} em outra língua${idiomaEsperado ? ` (loja ${idiomaEsperado})` : ""}`}
              tone="warn"
            />
            <OutPill
              text={
                idiomaErradoDepois === 0
                  ? "idioma corrigido"
                  : `${idiomaErradoDepois} ainda na língua errada`
              }
              tone={idiomaErradoDepois === 0 ? "pos" : "warn"}
            />
          </>
        )}
        {Number(o.tentativas ?? 0) > 1 && (
          <OutPill text={`${o.tentativas} passadas`} tone="info" />
        )}
      </div>

      {dePara.length > 0 && (
        <OutSection title="Antes → depois">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dePara.map((d, i) => {
              // Snapshot antigo não tem `motivos` — trata como estouro, que
              // era o único motivo que existia até 01/09.
              const motivos = d.motivos ?? ["max_len"]
              const porEstouroAqui = motivos.includes("max_len")
              const porTraco = motivos.includes("travessao")
              const porIdioma = motivos.includes("idioma")
              const porAusente = motivos.includes("ausente")
              return (
              <OutItem key={`${d.position}-${d.key}-${i}`}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ ...OUT_BODY, fontWeight: 600 }}>{d.key}</span>
                  {/* Alvo só de travessão não tem estouro para mostrar: o
                      "máx ?" ali não significava nada. */}
                  {porEstouroAqui && (
                    <span style={{ ...OUT_BODY, ...TNUM, color: C.g400 }}>
                      {d.antes_len ?? "?"} → {d.depois_len ?? "—"} (máx {d.max ?? "?"})
                    </span>
                  )}
                  {porTraco && (
                    <span style={{ ...OUT_BODY, ...TNUM, color: C.g400 }}>
                      travessões {d.tracos_antes ?? "?"} → {d.tracos_depois ?? "?"}
                    </span>
                  )}
                  {porIdioma && (
                    <span style={{ ...OUT_BODY, ...TNUM, color: C.g400 }}>
                      idioma {d.idioma_antes ?? "?"} → {d.idioma_depois ?? "?"}
                    </span>
                  )}
                  {porAusente && (
                    <span style={{ ...OUT_BODY, ...TNUM, color: C.g400 }}>
                      item ausente → {d.depois_len ?? "—"} (máx {d.max ?? "?"})
                    </span>
                  )}
                  <span style={{ marginLeft: "auto" }}>
                    <OutPill
                      text={
                        d.aceito
                          ? porAusente
                            ? "criado"
                            : "aplicado"
                          : "recusado"
                      }
                      tone={d.aceito ? "pos" : "warn"}
                    />
                  </span>
                </div>
                <div style={{ ...OUT_BODY, color: C.g400, fontFamily: F.sans }}>
                  {d.antes}
                </div>
                {d.aceito ? (
                  <div style={{ ...OUT_BODY, fontFamily: F.sans, marginTop: 4 }}>
                    {d.depois}
                  </div>
                ) : (
                  <div
                    style={{
                      ...OUT_BODY,
                      color: "#92400E",
                      fontFamily: F.sans,
                      marginTop: 4,
                    }}
                  >
                    {MOTIVO_DE_RECUSA[d.motivo ?? ""] ?? d.motivo ?? "recusada"}
                  </div>
                )}
              </OutItem>
              )
            })}
          </div>
        </OutSection>
      )}
    </OutCard>
  )
}

interface BackgroundCompostoView {
  key?: string
  width?: number
  height?: number
  band_color?: string
  band_height?: number
  side?: string
  replaced?: number
  para?: string
}

/**
 * Fundo no tamanho declarado: quantos boxes o documento tem, quantos foram
 * compostos (faixa + foto) e o que ficou sem ajuste ou falhou. A miniatura
 * do composto é a prova visual — antes disso o defeito só aparecia no
 * email do cliente.
 */
export function BackgroundFitView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  if (o.boxes == null && o.compostos == null) return null
  const compostos = asArray<BackgroundCompostoView>(o.compostos)
  const semAjuste = asArray<{ key?: string | null; motivo?: string }>(o.sem_ajuste)
  const falhas = asArray<{ key?: string | null; erro?: string }>(o.falhas)
  const boxes = Number(o.boxes ?? 0)

  return (
    <OutCard>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <OutPill text={`${boxes} box(es) de fundo`} tone="neut" />
        <OutPill
          text={`${compostos.length} composto(s)`}
          tone={compostos.length > 0 ? "pos" : "neut"}
        />
        {semAjuste.length > 0 && <OutPill text={`${semAjuste.length} sem ajuste`} tone="neut" />}
        {falhas.length > 0 && <OutPill text={`${falhas.length} falha(s)`} tone="warn" />}
      </div>
      {compostos.map((c, i) => (
        <OutItem key={`${c.key ?? i}`}>
          <div style={{ ...OUT_BODY, fontWeight: 700 }}>{c.key ?? "?"}</div>
          <div style={{ ...OUT_BODY, color: C.g500, ...TNUM }}>
            {c.width}×{c.height}px · faixa {c.band_color} de {c.band_height}px ({c.side === "top" ? "foto no topo" : "foto na base"}) · URL trocada ×{c.replaced ?? 0}
          </div>
          {typeof c.para === "string" && (
            <a href={c.para} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.para}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 260,
                  objectFit: "contain",
                  borderRadius: 7,
                  border: `1px solid ${C.border}`,
                  background: C.g50,
                  display: "block",
                  marginTop: 6,
                }}
              />
            </a>
          )}
        </OutItem>
      ))}
      {semAjuste.map((s, i) => (
        <div key={`s${i}`} style={{ ...OUT_BODY, color: C.g500 }}>
          {s.key ?? "(url externa)"}: {s.motivo}
        </div>
      ))}
      {falhas.map((f, i) => (
        <div key={`f${i}`} style={{ ...OUT_BODY, color: "#B45309" }}>
          {f.key ?? "?"}: {f.erro}
        </div>
      ))}
    </OutCard>
  )
}

/** Roteia a view legível pelo agente do nó. null = sem view própria. */
// ── Objeções (set/2026): Seletor e Catalogador ────────────────────────

function ObjLinha({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] leading-snug text-slate-700 mb-1">{children}</div>
}

function ObjBloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 mb-2 bg-white">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{titulo}</div>
      {children}
    </div>
  )
}

/** Saída do Seletor: o alvo do toque (modo, alvos, veículos, proibições, lacuna). */
export function SeletorAlvoView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const meta = (o._seletor ?? {}) as Record<string, unknown>
  const alvos = Array.isArray(o.alvos) ? (o.alvos as Array<Record<string, unknown>>) : []
  const angulos = Array.isArray(o.angulo_do_tratamento) ? (o.angulo_do_tratamento as Array<Record<string, unknown>>) : []
  const ja = Array.isArray(o.ja_atacadas) ? (o.ja_atacadas as Array<Record<string, unknown>>) : []
  const proib = Array.isArray(o.proibido_neste_toque) ? (o.proibido_neste_toque as string[]) : []
  const medos = Array.isArray(o.medos_alvo) ? (o.medos_alvo as string[]) : []
  const lacuna = (o.lacuna ?? null) as { motivo?: string; detalhe?: string | null } | null
  const skip = typeof o.skip_reason === "string" ? o.skip_reason : null
  if (skip) {
    return <OutPill text={`Seletor pulado — ${skip}`} tone="warn" />
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <OutPill text={`modo ${String(o.modo ?? "?")}`} tone="pos" />
        {meta.shadow === true && <OutPill text="shadow — alvo gravado, NÃO consumido" tone="warn" />}
        {meta.consumido === true && <OutPill text="consumido pelo pipeline" tone="pos" />}
        {typeof meta.retry_count === "number" && meta.retry_count > 0 && <OutPill text={`${meta.retry_count} retry`} tone="warn" />}
        {lacuna?.motivo && <OutPill text={`LACUNA: ${lacuna.motivo}`} tone="warn" />}
      </div>
      {lacuna?.detalhe && <ObjLinha>{lacuna.detalhe}</ObjLinha>}
      {alvos.length > 0 && (
        <ObjBloco titulo={`Alvos (${alvos.length})`}>
          {alvos.map((a, i) => (
            <ObjLinha key={i}>
              <strong>{String(a.id)}</strong>
              {a.primaria === true ? " · primária" : ""} · risco <em>{String(a.tipo_de_risco ?? "?")}</em> · aliviador{" "}
              <em>{String(a.aliviador_pedido ?? "?")}</em> · profundidade <em>{String(a.profundidade_de_prova ?? "?")}</em>
              <div className="text-slate-600 italic">“{String(a.objecao ?? "")}”</div>
              <div className="text-slate-500">tratamento: {String(a.tratamento ?? "")}</div>
            </ObjLinha>
          ))}
        </ObjBloco>
      )}
      {medos.length > 0 && (
        <ObjBloco titulo="Medos de categoria (alvo)">
          {medos.map((m, i) => <ObjLinha key={i}>• {m}</ObjLinha>)}
        </ObjBloco>
      )}
      {typeof o.promessa_a_pagar === "string" && o.promessa_a_pagar && (
        <ObjBloco titulo="Promessa a pagar"><ObjLinha>{o.promessa_a_pagar}</ObjLinha></ObjBloco>
      )}
      {angulos.length > 0 && (
        <ObjBloco titulo="Veículos (ângulo do tratamento)">
          {angulos.map((g, i) => (
            <ObjLinha key={i}>
              {String(g.ordem ?? i + 1)}. <strong>{String(g.veiculo)}</strong> — {String(g.papel ?? "")} · insumo:{" "}
              <em>{String(g.insumo_disponivel)}</em>
            </ObjLinha>
          ))}
        </ObjBloco>
      )}
      {(typeof o.criterio_de_selecao === "string" || typeof o.razao === "string") && (
        <ObjBloco titulo="Por quê">
          {typeof o.criterio_de_selecao === "string" && o.criterio_de_selecao && <ObjLinha>{o.criterio_de_selecao}</ObjLinha>}
          {typeof o.razao === "string" && o.razao && <ObjLinha><em>{o.razao}</em></ObjLinha>}
          {typeof o.suspeita_a_antecipar === "string" && o.suspeita_a_antecipar && <ObjLinha>Suspeita a antecipar: {o.suspeita_a_antecipar}</ObjLinha>}
          {typeof o.alerta_de_lastro === "string" && o.alerta_de_lastro && <ObjLinha>⚠ lastro: {o.alerta_de_lastro}</ObjLinha>}
        </ObjBloco>
      )}
      {proib.length > 0 && (
        <ObjBloco titulo="Proibido neste toque">
          {proib.map((p, i) => <ObjLinha key={i}>• {p}</ObjLinha>)}
        </ObjBloco>
      )}
      {ja.length > 0 && (
        <ObjBloco titulo="Já atacadas pelos irmãos">
          {ja.map((j, i) => (
            <ObjLinha key={i}>
              {String(j.id)} · email #{String(j.email_number)} · {String(j.profundidade)} · {String(j.via)}
            </ObjLinha>
          ))}
        </ObjBloco>
      )}
      {Array.isArray(meta.candidatas_elegiveis) && (
        <ObjLinha>
          <span className="text-slate-400">candidatas elegíveis por código: {(meta.candidatas_elegiveis as string[]).join(", ") || "nenhuma"}</span>
        </ObjLinha>
      )}
    </div>
  )
}

/** Saída do Catalogador: os quatro catálogos, resumidos. */
export function CatalogadorView({ output }: { output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  const objecoes = Array.isArray(o.objecoes) ? (o.objecoes as Array<Record<string, unknown>>) : []
  const veiculos = (o.veiculos_de_argumento ?? {}) as Record<string, Record<string, unknown>>
  const medos = Array.isArray(o.medos_de_categoria) ? (o.medos_de_categoria as Array<Record<string, unknown>>) : []
  const cobertura = (o.cobertura ?? {}) as { tipos_cobertos?: string[]; lacunas?: string[] }
  const descartadas = Array.isArray(o.descartadas) ? (o.descartadas as Array<Record<string, unknown>>) : []
  const incentivo = (o.incentivo ?? {}) as Record<string, unknown>
  const erros = Array.isArray(o.erros) ? (o.erros as string[]) : []
  if (erros.length > 0 && objecoes.length === 0) {
    return (
      <ObjBloco titulo="Catalogador reprovado">
        {erros.map((e, i) => <ObjLinha key={i}>• {e}</ObjLinha>)}
      </ObjBloco>
    )
  }
  return (
    <div>
      <ObjBloco titulo={`Objeções (${objecoes.length})`}>
        {objecoes.map((ob, i) => (
          <ObjLinha key={i}>
            <strong>{String(ob.id)}</strong> · {String(ob.tipo_de_risco)} · {String(ob.aliviador)} · sev {String(ob.severidade)}
            {ob.dominante_da_categoria === true ? " · DOMINANTE" : ""} · flows {(Array.isArray(ob.flows_elegiveis) ? (ob.flows_elegiveis as string[]) : []).join(", ")}
            <div className="text-slate-600 italic">“{String(ob.objecao ?? "")}”</div>
            <div className="text-slate-500">tratamento: {String(ob.tratamento ?? "")}</div>
          </ObjLinha>
        ))}
      </ObjBloco>
      <ObjBloco titulo="Veículos de argumento">
        {Object.entries(veiculos).map(([k, v]) => (
          <ObjLinha key={k}>
            <strong>{k}</strong>:{" "}
            {v.aplicavel === false ? "não se aplica" : typeof v.texto === "string" && v.texto ? v.texto : `sem insumo${typeof v.alerta === "string" && v.alerta ? ` — ${v.alerta}` : ""}`}
          </ObjLinha>
        ))}
      </ObjBloco>
      <ObjBloco titulo="Medos de categoria">
        {medos.length === 0 && <ObjLinha>(nenhum)</ObjLinha>}
        {medos.map((m, i) => (
          <ObjLinha key={i}>
            <strong>{String(m.medo)}</strong>: {typeof m.marca_esta_fora_porque === "string" && m.marca_esta_fora_porque ? m.marca_esta_fora_porque : "sem lastro"}
          </ObjLinha>
        ))}
      </ObjBloco>
      <ObjBloco titulo="Incentivo · cobertura · descartadas">
        <ObjLinha>
          incentivo:{" "}
          {incentivo.existe === true
            ? [incentivo.valor, incentivo.codigo, incentivo.condicoes, incentivo.prazo].filter(Boolean).map(String).join(" · ")
            : incentivo.existe === false
              ? "nenhum"
              : "não identificado"}
        </ObjLinha>
        <ObjLinha>cobertura: {(cobertura.tipos_cobertos ?? []).join(", ") || "—"}</ObjLinha>
        {(cobertura.lacunas ?? []).map((l, i) => <ObjLinha key={i}>lacuna: {l}</ObjLinha>)}
        {descartadas.map((d, i) => (
          <ObjLinha key={i}><span className="text-slate-400">descartada ({String(d.motivo)}): {String(d.texto)}</span></ObjLinha>
        ))}
      </ObjBloco>
    </div>
  )
}

export function AgentOutputView({
  agent,
  output,
}: {
  agent: string | undefined
  output: unknown
}) {
  switch (agent) {
    case "seletor":
      return <SeletorAlvoView output={output} />
    case "catalogador":
      return <CatalogadorView output={output} />
    case "assembler_chooser":
      return <CuradorRankingView output={output} />
    case "assembler":
      return <MontadorEscolhasView output={output} />
    case "blueprint":
      return <BlueprintBlocosView output={output} />
    case "subject":
      return <AssuntoView output={output} />
    case "copy":
      return <CopyContratoView output={output} />
    case "copy_fit":
      return <CopyFitView output={output} />
    case "background_fit":
      return <BackgroundFitView output={output} />
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
