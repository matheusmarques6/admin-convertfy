/**
 * Resolve `@/...` para `src/...` fora do Next.
 *
 * O alias vem do tsconfig e o `sucrase-node` não o lê, então um script
 * que importe qualquer módulo do app morre em MODULE_NOT_FOUND na
 * primeira dependência transitiva. Carregue com `-r`.
 */
const path = require("node:path")
const Module = require("node:module")
const raiz = path.resolve(__dirname, "..", "src")
const original = Module._resolveFilename
Module._resolveFilename = function (pedido, ...resto) {
  const alvo = pedido.startsWith("@/") ? path.join(raiz, pedido.slice(2)) : pedido
  return original.call(this, alvo, ...resto)
}
