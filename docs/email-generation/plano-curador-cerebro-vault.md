# Plano de execução — Curador com o cérebro do vault

*31/08/2026 · branch `claude/resume-previous-session-UvATK` · segue o desenho
recomendado pelo agente do vault (All-for-Eficiencia): "Curador absorve a
estrutura, protocolo vira system prompt".*

> **Status da execução (01/09, pós-aprovação):**
> ✅ Fase 0 aplicada em produção — migration 20261093 (Estruturador `off` na
> org, que estava `on`; alavanca `curador_vault_mode`; tabela
> `email_vault_docs`). O vault-sync novo ingeriu `componentes/**` sozinho no
> primeiro cron pós-deploy (223 arquivos, 222 upserts, 1 skip = `_INDEX.md`;
> **44/44 variantes casadas por `variant_id`**; protocolo + 8 notas de seção
> ativos).
> ✅ Fase 1 implementada e pushada (`curador-shadow.ts`, commit `48295f9`) e
> **shadow LIGADO** na org (`curador_vault_mode='shadow'`) — começa a rodar
> no deploy desse commit, em toda execução da fase 1 do Architect.
> ⏳ Fase 2 (goldens + métricas) aguarda as primeiras runs shadow.
> ⏳ Fase 3 (flip) aguarda o verde da fase 2.

## Decisão de desenho (a tese)

**Não recriar o Estruturador em outro lugar.** Um único call do Curador
(`assembler_chooser`, sonnet-4.6) decide **estrutura + variantes de uma vez**.
Dois passes de LLM ("decidir esqueleto" e depois "escolher variante") seriam o
Estruturador de volta com outro nome — e a informação que separa os dois
passes é a mesma (intenção + catálogo).

```
SYSTEM (cacheável, igual entre lojas — troca só quando o vault muda):
├─ _protocolo-de-selecao        ← as regras: 9 passos + desempate final
├─ eixos por variante           ← momento/objecao/registro/paleta/papel + exige/peso/convivencia
│                                  (fundidos NO catálogo, por variant_id)
├─ secoes/_*.md                 ← chaves de desempate por seção
├─ convivencia/ (6 notas)       ← regras de coexistência
├─ requisitos/ (glossário)      ← o que cada `exige` pergunta à loja
└─ catálogo atual do banco      ← name/description/quando_usar (a prosa do vault VENCE)

USER (por loja × email):
├─ intencao_flow + intencao_email   ← email_intents (já sincronizado)
├─ estruturas de referência         ← email_structure_refs (já sincronizado)
├─ aprendizados                     ← email_learnings (já sincronizado)  [fase 1]
├─ momento do email                 ← flow_type/número → eixo (código)
├─ perfil da loja                   ← store-context (o que já manda hoje)
└─ memoria + contagem de uso        ← email_generation_choices           [fase 1]

OUTPUT (contrato ampliado — no flip):
└─ sequência de seções + papel por posição + fio_narrativo
   + até 3 variantes rankeadas por posição (motivo na 1ª)
```

O ganho estrutural: hoje o Curador escolhe por name/description/tones — ele
nunca viu os eixos. O vault entrega os eixos, e o protocolo diz a **ordem de
uso** (eliminar antes de rankear; ranking lexicográfico `objecao → registro →
paleta → papel_na_peca` com degradação). Sonnet-4.6 segue procedimento por
texto com folga; kimi-k3 era o motivo de manter a tarefa rasa.

**Precedência declarada:** onde o eixo/prosa do vault contradiz a tag do banco,
**o vault vence** (lacuna `tags-do-banco-contradizem-a-prosa` já documentada;
a filosofia da casa já é "dado curado vence o LLM").

## O que NÃO fazer

- **Pré-filtro determinístico dos passos 3–6 em código** — segunda vez que
  pisaríamos nessa cobra (pré-filtro por score já nasceu e morreu duas vezes).
  O protocolo fica como TEXTO; a telemetria mede se o sonnet viola filtro
  duro. Se violar com frequência, endurece **só o veto** em código (nunca o
  ranking).
- **Estruturador em shadow "por garantia"** — custo de sonnet por email para
  output que ninguém consome. Off. A config fica como kill-switch de graça.

---

## Fases

### Fase 0 — Infraestrutura (PRONTA nesta branch; comportamento vivo inalterado)

Tudo atrás da alavanca `email_generation_settings.curador_vault_mode`
(`off|shadow|on`, **default `off`**) — deploy desta fase é neutro.

| Peça | Status | Onde |
|---|---|---|
| Migration 20261093: estruturador `off` em todas as orgs · coluna `curador_vault_mode` · tabela `email_vault_docs` (RLS service-role, padrão 20261081) | ✅ pronta | `supabase/migrations/20261093_curador_vault_conhecimento.sql` |
| Vault-sync sincroniza `componentes/**` (protocolo, catálogo, variantes c/ `variant_id`, seções, eixos, requisitos, convivência, lacunas; `_html/` fica fora — o HTML canônico já vive no banco) | ✅ pronto | `vault-parser.ts` (`componente_doc` + `isDocActive` + `docVariantId`) · `vault-sync.service.ts` |
| Módulo `curador-vault.ts`: loaders fail-open + builders puros (extração da prosa, `parsePesoRaw`, `momentoDoEmail`, blocos de system/user) | ✅ pronto | `src/lib/agents/architect/curador-vault.ts` |
| Catálogo com eixos do vault por variante (`buildCatalog(…, extras)`, casamento por `variant_id` → `nome_no_banco`; prosa do vault vence o cadastro) | ✅ pronto | `catalog-builder.ts` |
| Prompt default do Curador com os segmentos `{{protocolo}}`/`{{convivencias}}`/`{{requisitos}}` (system) e `{{momento}}`/`{{estruturas_ref}}`/`{{secoes_notas}}` (user), origens declaradas classe `vault` (guard de recomposição cobre) | ✅ pronto — dados só entram em modo `on` | `component-assembler.service.ts` |
| Rota `prompt-segment` reconstrói o catálogo nos DOIS mundos (com/sem extras) antes de declarar `stale` | ✅ pronta | `route.ts` |
| Testes: parser (componentes/**), builders do curador-vault, catálogo com extras, auditoria do system | ✅ 118 verdes | `*.test.ts` |

Pendências da fase 0 (operacional): aplicar a migration em produção e rodar um
sync manual do vault (aba Conhecimento) para popular `email_vault_docs`.

### Fase 1 — Shadow do Curador (sonnet com protocolo em paralelo ao kimi vivo)

`curador_vault_mode='shadow'` na org: depois do call vivo (kimi, prompt
atual), dispara-se um call **paralelo** com sonnet-4.6 + prompt novo completo,
gravando run com `parsed_output.shadow=true` — o pipeline segue no kimi
(mesmo padrão do shadow do Estruturador). Nada do shadow é consumido.

Inclui neste passo (baratos e necessários à comparação):

1. **`{{aprendizados}}`** no user do Curador (`email_learnings` — já
   sincronizado; mesmo formato do Estruturador).
2. **Contagem de uso por `variant_id`** agregada na var `memoria`
   (`email_generation_choices`) — fecha o "desempate por menor uso" do
   protocolo quase de graça.
3. **Medidor de veto por código** sobre a escolha (do vivo E do shadow):
   `momento_vetado`/`momento` positivo, `exige` sem evidência declarável,
   convivência violada, hero dupla — gravado em `parsed_output.
   protocol_violations[]` das duas runs. É a métrica que decide o flip
   (e o único lugar onde código toca o protocolo: MEDIR, não filtrar).
4. Shadow já responde no **contrato ampliado** (estrutura + papel + fio +
   rankings) para ensaiar o formato do flip sem consumi-lo.

### Fase 2 — Goldens + métricas de corte

- **Goldens do vault**: `componentes/_casos-de-teste.md` (Caso A e Caso B,
  com resultado esperado passo a passo — o B testa o zero-elegíveis) viram
  casos de aceitação: rodados pela aba Testar contra o shadow e conferidos
  contra o esperado; os passos DETERMINÍSTICOS (vetos, elegibilidade)
  viram asserts de código no medidor do item 3 acima.
- **Métricas de corte** (janela de shadow, por run):
  - taxa de `CuratorFailedError` (fail-closed continua);
  - violações de veto ≈ 0 no shadow (e comparação com o vivo);
  - concordância com a chave de desempate das notas de seção;
  - custo/latência por call (com prompt caching, o system cresce ~30-40k
    chars sobre os ~120k — custo marginal pequeno).

### Fase 3 — Flip (verde nas métricas → um call só)

1. Migration do flip: `assembler_chooser.model = 'anthropic/claude-sonnet-4.6'`
   (T 0.2 mantém) + `curador_vault_mode='on'`.
2. **Wiring do contrato ampliado** (o único ponto de código não-trivial —
   os consumidores já existem, muda a ORIGEM):
   - a **sequência** decidida pelo Curador substitui
     `resolveStructure(outline)` como `structure` da montagem (mesmo shape
     `PosicaoEstruturada`);
   - `fio_narrativo` do Curador → `outline_guidance` do Montador e
     `store_email_blueprints.fio_narrativo`;
   - `papel_por_posicao` do Curador → 1ª linha do `purpose` por bloco
     (`aplicarEstruturadorNoBlueprint` reusado — muda só a fonte);
   - Montador, Blueprint determinístico, seed e fase 2 seguem intocados no
     formato.
3. Parser do output ampliado com fallback: estrutura ausente/ilegível no
   JSON → sequência do outline (comportamento atual), rankings seguem
   valendo; estrutura válida → consumida. `CuratorFailedError` continua
   fail-closed para ranking inutilizável.
4. Estúdio: nó Estruturador passa a aparecer `pulado` (já é a verdade);
   painel do Curador ganha estrutura/fio no drill-down.

### Rollback

Cada fase recua por settings, sem deploy: `curador_vault_mode='off'` devolve
o Curador de hoje byte a byte (kimi + metadados do banco);
`estruturador_mode` continua existindo como kill-switch se um dia precisar
voltar. O flip recua com uma migration de volta do model + mode.

---

## Buracos que o vault já documenta (e vão aparecer)

- **`exige` não verificável** (`_parametros-da-loja` Parte 2): o Curador vai
  INFERIR "cupom ativo?" da pesquisa/contexto. Aceitável no shadow; o perfil
  de ativos da loja (52 perguntas) é o hardening real, depois.
- **Intenções só de welcome**: para outros flows o passo 1 degrada para
  `outline_objective` — comportamento atual, sem regressão. Item de conteúdo
  pendente (vault), não de código.
- **Duplicatas de cadastro** (hero-8≡hero-10, reviews-3a≡3b): desempate por
  menor uso (item 2 da fase 1) + fallback menor slug; a correção de verdade
  é reconciliar o cadastro (lacunas já registradas no vault).

## Aprovações que este plano pede

1. OK no desenho e no faseamento (em especial: flip do modelo só na fase 3,
   depois do shadow — não imediato).
2. Quem liga o `shadow` e por quanto tempo (sugestão: 1 semana de gerações
   reais ou ≥20 emails, o que vier antes).
3. OK para aplicar a migration da fase 0 em produção (desliga o Estruturador
   JÁ — hoje a org está com ele `on`).
