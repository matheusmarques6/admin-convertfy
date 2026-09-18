"use client"

/**
 * As seções de Configurar que o handoff §7 acrescenta e que moram no
 * SCHEMA (`settings`), não em colunas: qualificação por pontos, o que
 * fazer com duplicado, textos do sistema e acesso.
 *
 * Tudo aqui é lido por alguém — `lib/forms/pontuacao.ts` é a régua que o
 * submit e o renderer importam. Sem consumidor, uma seção destas seria o
 * campo fantasma que a espinha do editor existe para impedir.
 */

import { Plus, Trash2 } from "lucide-react"
import type { FaixaDePontuacao, FormSchema, PoliticaDeDuplicado } from "@/types/forms-conversational"
import { POLITICAS_DE_DUPLICADO } from "@/types/forms-conversational"
import { avaliarFaixas, pontuar, TEXTOS_PADRAO, type ChaveDeTexto } from "@/lib/forms/pontuacao"

type Settings = NonNullable<FormSchema["settings"]>

const ROTULO_DA_POLITICA: Record<PoliticaDeDuplicado, { rotulo: string; apoio: string }> = {
  atualiza: { rotulo: "Atualizar o lead", apoio: "Completa os dados do lead que já existe. É o padrão." },
  novo: { rotulo: "Criar outro lead", apoio: "Cada envio vira um lead novo, mesmo com o mesmo e-mail." },
  ignora: { rotulo: "Ignorar", apoio: "Reusa o lead existente sem mexer nos dados dele; o negócio ainda é criado." },
}

const TEXTOS_ROTULOS: Array<{ chave: ChaveDeTexto; rotulo: string }> = [
  { chave: "obrigatorio", rotulo: "Campo obrigatório" },
  { chave: "escolha_obrigatoria", rotulo: "Escolha obrigatória" },
  { chave: "email_invalido", rotulo: "E-mail inválido" },
  { chave: "telefone_invalido", rotulo: "Telefone inválido" },
  { chave: "rotulo_avancar", rotulo: "Botão de avançar" },
  { chave: "dica_teclado", rotulo: "Dica de teclado" },
  { chave: "fechado", rotulo: "Formulário fechado" },
]

export function ConfigurarExtras({
  fluxo,
  onSettings,
  etapas,
  desligado,
}: {
  fluxo: FormSchema
  /** Merge em `settings` do rascunho. */
  onSettings: (patch: Partial<Settings>) => void
  etapas: Array<{ id: string; name: string }>
  /** Fluxo indisponível: mostra, não deixa editar. */
  desligado?: boolean
}) {
  const settings: Settings = fluxo.settings ?? {}
  const faixas = settings.faixas ?? []
  const teto = pontuar(fluxo, {})
  const avisos = avaliarFaixas(faixas)
  const textos = settings.textos ?? {}

  const trocarFaixa = (i: number, patch: Partial<FaixaDePontuacao>) =>
    onSettings({ faixas: faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-6">
      {/* ── Qualificação por pontos ── */}
      <section>
        <Titulo
          titulo="Qualificação por pontos"
          apoio={
            teto.perguntasQuePontuam === 0
              ? "Nenhuma pergunta pontua ainda. Ligue «Pontuação» no inspetor de uma pergunta de escolha, Sim/Não ou estrelas."
              : `${teto.perguntasQuePontuam} ${teto.perguntasQuePontuam === 1 ? "pergunta pontua" : "perguntas pontuam"} · máximo de ${teto.maximo} pts. A faixa que contém o total decide a etapa e a etiqueta; fora de toda faixa vale a etapa padrão.`
          }
        />
        <div className="mt-2 space-y-1.5">
          {faixas.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-700 dark:text-white/75">
              <span>de</span>
              <input
                type="number"
                value={f.de}
                disabled={desligado}
                onChange={(e) => trocarFaixa(i, { de: Number(e.target.value) || 0 })}
                className="crm-input w-[64px] text-right text-[11.5px]"
              />
              <span>a</span>
              <input
                type="number"
                value={f.ate}
                disabled={desligado}
                onChange={(e) => trocarFaixa(i, { ate: Number(e.target.value) || 0 })}
                className="crm-input w-[64px] text-right text-[11.5px]"
              />
              <span>pts →</span>
              <select
                value={f.stage_id ?? ""}
                disabled={desligado}
                onChange={(e) => trocarFaixa(i, { stage_id: e.target.value || undefined })}
                className="crm-input min-w-[150px] flex-1 text-[11.5px]"
              >
                <option value="">Etapa padrão</option>
                {etapas.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={f.tag ?? ""}
                disabled={desligado}
                onChange={(e) => trocarFaixa(i, { tag: e.target.value || undefined })}
                placeholder="etiqueta"
                className="crm-input w-[120px] text-[11.5px]"
              />
              <button
                type="button"
                disabled={desligado}
                onClick={() => onSettings({ faixas: faixas.filter((_, j) => j !== i) })}
                aria-label="Remover faixa"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-white/[0.06]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={desligado}
            onClick={() => {
              const ultimo = faixas.length > 0 ? Math.max(...faixas.map((f) => f.ate)) + 1 : 0
              onSettings({ faixas: [...faixas, { de: ultimo, ate: Math.max(ultimo, teto.maximo) }] })
            }}
            className="inline-flex items-center gap-1 rounded-[6px] border border-dashed border-black/[0.15] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/[0.18] dark:text-white/65 dark:hover:bg-white/[0.04]"
          >
            <Plus className="h-3 w-3" />
            Adicionar faixa
          </button>
          {avisos.map((a) => (
            <p key={a} className="text-[11px] text-amber-700 dark:text-amber-300">
              {a}
            </p>
          ))}
        </div>
      </section>

      {/* ── Duplicado ── */}
      <section>
        <Titulo titulo="Se o e-mail já existir" apoio="O que acontece quando quem responde já é lead no CRM." />
        <div className="mt-2 space-y-1">
          {POLITICAS_DE_DUPLICADO.map((p) => {
            const ativo = (settings.duplicado ?? "atualiza") === p
            return (
              <label
                key={p}
                className={
                  "flex cursor-pointer items-start gap-2 rounded-[6px] border px-2.5 py-2 " +
                  (ativo
                    ? "border-[#4E62D8] bg-[#4E62D8]/[0.05]"
                    : "border-black/[0.08] hover:bg-slate-50 dark:border-white/[0.10] dark:hover:bg-white/[0.04]")
                }
              >
                <input
                  type="radio"
                  name="duplicado"
                  checked={ativo}
                  disabled={desligado}
                  onChange={() => onSettings({ duplicado: p })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[12px] font-medium text-slate-800 dark:text-white/85">
                    {ROTULO_DA_POLITICA[p].rotulo}
                  </span>
                  <span className="block text-[10.5px] text-slate-500 dark:text-white/45">
                    {ROTULO_DA_POLITICA[p].apoio}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </section>

      {/* ── Textos do sistema ── */}
      <section>
        <Titulo titulo="Textos do sistema" apoio="O que o formulário diz por conta própria. Vazio = o padrão." />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TEXTOS_ROTULOS.map(({ chave, rotulo }) => (
            <label key={chave} className="block">
              <span className="block text-[11px] font-medium text-slate-700 dark:text-white/75">{rotulo}</span>
              <input
                type="text"
                value={textos[chave] ?? ""}
                disabled={desligado}
                placeholder={TEXTOS_PADRAO[chave]}
                onChange={(e) => {
                  const prox = { ...textos }
                  if (e.target.value.trim()) prox[chave] = e.target.value
                  else delete prox[chave]
                  onSettings({ textos: Object.keys(prox).length > 0 ? prox : undefined })
                }}
                className="crm-input mt-1 w-full text-[11.5px]"
              />
            </label>
          ))}
        </div>
      </section>

      {/* ── Acesso ── */}
      <section>
        <Titulo titulo="Acesso" apoio="Fechar ou limitar. Quem abrir o endereço vê a mensagem de «Formulário fechado» no lugar das perguntas." />
        <div className="mt-2 space-y-2">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-[12px] font-medium text-slate-800 dark:text-white/85">Fechar formulário</span>
              <span className="block text-[10.5px] text-slate-500 dark:text-white/45">
                Para de receber respostas; o endereço continua existindo.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.fechado)}
              disabled={desligado}
              onClick={() => onSettings({ fechado: !settings.fechado || undefined })}
              className={
                "relative mt-0.5 h-[18px] w-[30px] shrink-0 rounded-full p-0 transition-colors " +
                (settings.fechado ? "bg-red-500" : "bg-slate-300 dark:bg-white/20")
              }
            >
              <span
                className={
                  "absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform " +
                  (settings.fechado ? "translate-x-[14px]" : "translate-x-[2px]")
                }
              />
            </button>
          </label>
          {settings.fechado && (
            <input
              type="text"
              value={settings.mensagem_fechado ?? ""}
              disabled={desligado}
              placeholder={TEXTOS_PADRAO.fechado}
              onChange={(e) => onSettings({ mensagem_fechado: e.target.value || undefined })}
              className="crm-input w-full text-[11.5px]"
            />
          )}
          <label className="flex items-center justify-between gap-3 text-[12px] text-slate-800 dark:text-white/85">
            <span>
              Limite de envios
              <span className="block text-[10.5px] font-normal text-slate-500 dark:text-white/45">
                Ao chegar no número, o formulário fecha sozinho. Vazio = sem limite.
              </span>
            </span>
            <input
              type="number"
              min={1}
              value={settings.limite_envios ?? ""}
              disabled={desligado}
              onChange={(e) => onSettings({ limite_envios: e.target.value ? Number(e.target.value) : undefined })}
              className="crm-input w-[96px] text-right text-[11.5px]"
            />
          </label>
        </div>
      </section>
    </div>
  )
}

function Titulo({ titulo, apoio }: { titulo: string; apoio?: string }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">{titulo}</h3>
      {apoio && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-white/45">{apoio}</p>}
    </div>
  )
}
