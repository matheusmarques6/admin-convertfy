// scripts/spike-image-multimodal.mjs
//
// Spike empírico (story AE-13 pendente): prova se o modelo de imagem via
// OpenRouter REALMENTE recebe a imagem do produto pelo link (multimodal
// img2img) e a USA como referência.
//
// Gera 2 imagens pra MESMA campanha, e baixa a imagem de ENTRADA:
//   input.*           = a foto do produto (referência)
//   A-product_ref.png = gerada MANDANDO a imagem como image_url (multimodal)
//   B-text2img.png    = gerada SÓ com texto (sem imagem)
//
// Veredito (comparação visual):
//   - A parece com `input` e B é genérica  -> o modelo RECEBE e USA a imagem ✅
//   - A == B (ambas genéricas)             -> o modelo IGNORA a imagem ❌
//   - A dá erro 4xx "image not supported"  -> o modelo NÃO aceita multimodal ❌
//
// Uso:
//   OPENROUTER_API_KEY=sk-... node scripts/spike-image-multimodal.mjs \
//     "https://.../foto-de-produto-LIMPA.jpg" \
//     "Hero de boas-vindas: foto editorial do produto em uso, luz natural suave, 4:5, sem texto"
//
// IMPORTANTE: passe uma URL de FOTO DE PRODUTO limpa e PÚBLICA (200 + image/*).
// Não use as URLs atuais da loja (são asset de e-mail e dão 403).

import fs from "node:fs"
import path from "node:path"

const MODEL = process.env.SPIKE_MODEL ?? "openai/gpt-5.4-image-2"
const API = "https://openrouter.ai/api/v1/chat/completions"
const OUT = "spike-out"

const imageUrl = process.argv[2]
const prompt =
  process.argv[3] ??
  "Hero image for an e-commerce welcome email: editorial photo of the product in use, soft natural light, vertical 4:5, no text in the image."

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  console.error("✗ Falta OPENROUTER_API_KEY no ambiente.")
  process.exit(1)
}
if (!imageUrl) {
  console.error('✗ Uso: node scripts/spike-image-multimodal.mjs "<url_imagem_produto>" "[prompt]"')
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

function extractImage(raw) {
  const dataUri = raw.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/]+=*)/)
  if (dataUri?.[1]) return Buffer.from(dataUri[1], "base64")
  const b64 = raw.match(/"b64_json"\s*:\s*"([A-Za-z0-9+/]+=*)"/)
  if (b64?.[1]) return Buffer.from(b64[1], "base64")
  return null
}

async function generate(messages, label) {
  const t0 = Date.now()
  let res
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, response_format: "b64_json" }),
    })
  } catch (err) {
    console.log(`[${label}] erro de rede: ${err.message}`)
    return
  }
  const raw = await res.text()
  const ms = Date.now() - t0
  if (!res.ok) {
    console.log(`[${label}] HTTP ${res.status} (${ms}ms) — ${raw.slice(0, 400)}`)
    return
  }
  const buf = extractImage(raw)
  if (!buf) {
    console.log(`[${label}] 200 mas SEM imagem extraível (${ms}ms). Resposta: ${raw.slice(0, 400)}`)
    return
  }
  const file = path.join(OUT, `${label}.png`)
  fs.writeFileSync(file, buf)
  console.log(`[${label}] OK (${ms}ms) -> ${file} (${(buf.length / 1024).toFixed(0)} KB)`)
}

console.log(`\nModelo: ${MODEL}`)
console.log(`Prompt: ${prompt}`)

// 0) baixa a imagem de ENTRADA (e já valida se é acessível/é imagem)
console.log(`\n== ENTRADA: ${imageUrl}`)
try {
  const r = await fetch(imageUrl)
  const ct = r.headers.get("content-type") || ""
  console.log(`   HTTP ${r.status} | ${ct}`)
  if (r.ok && /^image\//i.test(ct)) {
    const ext = (ct.split("/")[1] || "img").split(";")[0]
    const buf = Buffer.from(await r.arrayBuffer())
    fs.writeFileSync(path.join(OUT, `input.${ext}`), buf)
    console.log(`   salva em ${OUT}/input.${ext} (${(buf.length / 1024).toFixed(0)} KB)`)
  } else {
    console.log("   ⚠️  a URL de entrada NÃO é imagem acessível — o multimodal (A) deve falhar.")
  }
} catch (err) {
  console.log(`   ⚠️  erro ao baixar entrada: ${err.message}`)
}

// A) product_ref — manda a imagem como referência visual
console.log("\n== A) product_ref (imagem + texto)")
await generate(
  [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: prompt },
      ],
    },
  ],
  "A-product_ref",
)

// B) text2img — só texto
console.log("\n== B) text2img (só texto)")
await generate([{ role: "user", content: prompt }], "B-text2img")

console.log(`\nPronto. Compare em ./${OUT}/ :`)
console.log("  input.*  (referência)   vs   A-product_ref.png   vs   B-text2img.png")
console.log("Se A reflete o produto da entrada e B é genérica → o modelo recebe e USA a imagem.")
