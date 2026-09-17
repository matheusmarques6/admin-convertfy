# Patch do flow de copy — a mecânica do cupom e a régua de assunto

> **Estado:** pendente de aplicação no n8n. Enquanto não for colado, as duas
> coisas abaixo continuam no payload e **não chegam ao redator**.

Medido em 17/09 contra `email-copy-prompt-v3.2.md` e
`email-copy.workflow.json`. O prompt **não lê o payload direto**: lê o que o
nó Code `CONTEXTO DA COPY` derivou em variáveis `*_txt`. Os Code nodes fazem
`...email`, então toda chave nova do admin chega ao item — mas só entra no
prompt se aquele nó a derivar. É esse filtro que decide tudo.

| Chave que o admin manda | O flow lê hoje? |
|---|---|
| `emails[].doutrina` | **Sim, completo** — `doutrina_txt` já faz o `.map` do array de objetos, e `{{ $json.doutrina_txt }}` já está no prompt |
| `campos[*].orientacao` | **Sim**, dentro de `blocos_json` |
| `campos[*].directive` | **Sim**, com regra dura (regra 4) |
| `decisao.proibido` · `decisao.insumos_permitidos` | **Sim** |
| **`decisao.incentivo.mecanica`** | **Não** — `incentivoTxt` toca só `existe`, `valor` e `codigo` |
| **`emails[].orientacao`** (assunto/preheader) | **Não** — nenhuma referência |

Os dois patches abaixo fecham exatamente essas duas linhas.

---

## Patch 1 — nó Code `CONTEXTO DA COPY`

### 1a. `incentivoTxt` passa a dizer COMO o cupom funciona

O e-mail de 17/09 entregou `WELCOME10` e não disse onde aplicá-lo. No lugar
dessa informação saiu jargão de plataforma ("Your checkout runs on Shopify:
PCI-compliant, SSL built in") — mesma posição, mesma função de tirar atrito,
escrita do lado errado do balcão.

**ANTES** (bloco `// ---- decisão ----`):

```js
const incentivoTxt = inc.existe === true
  ? `EXISTE: ${inc.valor ?? ''} com o código ${inc.codigo ?? ''}. Use SÓ este valor e este código. Sem prazo, sem condição nova.`
  : inc.existe === false
    ? 'NÃO EXISTE incentivo neste e-mail. Proibido: desconto, cupom, código, percentual, "use o código", "oferta", em QUALQUER campo.'
    : 'NÃO SE SABE se há incentivo. Não prometa oferta nem cupom.';
```

**DEPOIS**:

```js
// A mecânica vem do admin (`decisao.incentivo.mecanica`) e é INSTRUÇÃO, não
// texto final: quem redige no idioma da loja é você.
const mec = inc.mecanica || {};
const ondeAplicar = mec.onde_aplicar === 'checkout'
  ? 'DIGA ONDE APLICAR: o código entra no campo de cupom do checkout. Uma frase curta, junto do código — não é promessa, é o próximo passo de quem está lendo.'
  : '';
const confirmadas = Array.isArray(mec.condicoes_confirmadas) && mec.condicoes_confirmadas.length
  ? `Condições CONFIRMADAS pela loja (só estas podem ser ditas): ${mec.condicoes_confirmadas.join('; ')}.`
  : '';
const naoAfirmar = Array.isArray(mec.nao_afirmar) && mec.nao_afirmar.length
  ? `NÃO AFIRME nada sobre: ${mec.nao_afirmar.join(', ')}. Não há confirmação da loja, e omitir é o certo — inventar prazo ou mínimo é promessa que a loja não fez.`
  : '';

const incentivoTxt = inc.existe === true
  ? [
      `EXISTE: ${inc.valor ?? ''} com o código ${inc.codigo ?? ''}. Use SÓ este valor e este código. Sem prazo, sem condição nova.`,
      ondeAplicar,
      confirmadas,
      naoAfirmar,
    ].filter(Boolean).join('\n')
  : inc.existe === false
    ? 'NÃO EXISTE incentivo neste e-mail. Proibido: desconto, cupom, código, percentual, "use o código", "oferta", em QUALQUER campo.'
    : 'NÃO SE SABE se há incentivo. Não prometa oferta nem cupom.';
```

### 1b. `orientacao_txt` — a régua de assunto e preheader

Derivação NOVA. `emails[].orientacao` já chega ao item pelo spread `...email`
e morre ali.

**ACRESCENTAR** ao mesmo nó, perto de `incentivoTxt`:

```js
// ---- orientação de redação (assunto e preheader) ----
// Vem de `orientacao-por-papel.ts` no admin, que é versionado e testado.
// Ausente → o GERADOR cai na régua dele, como antes deste patch.
const ori = email.orientacao || {};
const orientacaoTxt = [
  ori.assunto ? `ASSUNTO — ${ori.assunto}` : '',
  ori.preheader ? `PREHEADER — ${ori.preheader}` : '',
].filter(Boolean).join('\n');
```

E incluir `orientacaoTxt` no objeto que o nó devolve, ao lado de
`incentivo_txt`, como `orientacao_txt`.

---

## Patch 2 — `GERADOR DE ASSUNTO` (User Message)

**ACRESCENTAR** depois do bloco `DECISÃO`:

```
RÉGUA DE REDAÇÃO (do admin; quando presente, VENCE as regras 2 e 3 do system)
{{ $('CONTEXTO DA COPY').item.json.orientacao_txt || '(sem régua enviada — use as regras 2 e 3)' }}
```

### Por que isto é substituição, e não mais uma regra

Hoje existem **duas réguas que ninguém comparou**: o system do `GERADOR` diz
"até 50 caracteres" e o admin diz 55. Elas divergiam em silêncio porque a do
admin não era lida. Depois do patch quem manda é `orientacao-por-papel.ts`,
que é versionado, testado e visível na tela.

A regra que **só este patch entrega** é *"o assunto não começa pelo código do
cupom"*. É redação, e só o redator pode cumpri-la. O e-mail de 17/09 saiu com
`WELCOME10: Cut for Your Body` — o código é o que a pessoa encontra dentro,
não o motivo de abrir.

> Se a régua enviada contradisser o system em algum ponto, **a régua vence**:
> é ela que está sob teste do outro lado. Aproveitar para mover para o admin
> o que o system tem e ele não ("ideia central nos primeiros 33 caracteres")
> evita que esse critério se perca.

---

## Depois de colar, conferir

1. Uma geração de teste; no admin, run `copy_dispatch` → `input_vars.payload`
   deve ter `decisao.incentivo.mecanica` e `emails[].orientacao` (já tem).
2. No n8n, o prompt renderizado do `FAZEDOR` deve mostrar a mecânica dentro
   do bloco de incentivo, e o do `GERADOR` deve mostrar a RÉGUA DE REDAÇÃO.
3. No e-mail entregue: o bloco de cupom diz onde aplicar o código, e o
   assunto não começa por ele.
4. Os três achados de QA que hoje observam isso depois do fato
   (`mecanica_do_incentivo_ausente`, `assunto_comeca_pelo_codigo`,
   `preheader_repete_o_assunto`) devem parar de aparecer.

**Rollback**: desfazer os dois trechos. O payload não muda em nada, então
nenhum caminho do admin depende deste patch ter sido aplicado.
