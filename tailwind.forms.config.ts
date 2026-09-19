import type { Config } from "tailwindcss"
import base from "./tailwind.config"

/**
 * O Tailwind do FORMULÁRIO PÚBLICO — o mesmo tema, outro `content`.
 *
 * A raiz `(publico)` não carrega o `globals.css` do admin (258 KB de
 * utilitários de todas as telas). O que o renderizador de página única
 * usa são vinte classes; este config gera SÓ o que os componentes de
 * formulário citam. O tema é o do admin por construção (`...base`), então
 * `sm:` e as cores casam byte a byte com o preview do editor.
 */
const config: Config = {
  ...base,
  content: [
    "./src/components/forms/**/*.{ts,tsx}",
    "./src/app/(publico)/**/*.{ts,tsx}",
  ],
}

export default config
