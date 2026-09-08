/**
 * Prepara um arquivo do usuário para virar anexo da ConvertIA. **Só roda
 * no navegador** (canvas, FileReader) e é onde o "limite de 2 MB" deixa
 * de existir para quem usa.
 *
 * A regra: quem se ajusta ao transporte é o ARQUIVO, não a pessoa.
 *
 *   - imagem  → reduzida a `LADO_MAXIMO_PX` e recomprimida até caber
 *   - planilha→ CSV por aba (SheetJS)
 *   - .docx   → texto dos parágrafos (o arquivo é um zip; JSZip já é dep)
 *   - pdf     → texto por página (pdf.js, importado sob demanda)
 *   - texto   → conteúdo cru
 *
 * Os parsers entram por `import()` DINÂMICO: pdf.js e SheetJS somam
 * megabytes, e quem só conversa no chat não deve baixá-los. O custo
 * aparece quando o usuário anexa uma planilha, que é quando ele espera
 * esperar um pouco.
 *
 * Falha aqui é sempre DITA. Formato que o navegador não decodifica
 * (HEIC fora do Safari é o caso real) devolve mensagem com o nome do
 * formato e o que fazer — não some da lista em silêncio.
 */

import {
  ALVO_POR_IMAGEM,
  classificarArquivo,
  dimensaoReduzida,
  formatarBytes,
  LADO_MAXIMO_PX,
  limitarTexto,
  TETO_POR_IMAGEM,
  type TipoAnexo,
} from "./anexos"

export interface AnexoPreparado {
  name: string
  mime: string
  kind: "image" | "text"
  data_url?: string
  text?: string
  /** Só para imagem: miniatura para o chip do composer. */
  thumb?: string
  /** "3,9 MB → 412 KB · 1568×1046" — a conta que a UI mostra no hover. */
  detalhe?: string
}

export class AnexoError extends Error {}

function lerComoTexto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new AnexoError(`Não consegui ler "${file.name}".`))
    r.onload = () => resolve(String(r.result ?? ""))
    r.readAsText(file)
  })
}

function lerComoDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new AnexoError("Não consegui ler o arquivo."))
    r.onload = () => resolve(String(r.result ?? ""))
    r.readAsDataURL(file)
  })
}

/**
 * Decodifica a imagem. `createImageBitmap` é o caminho rápido e o que
 * respeita a orientação EXIF da foto de celular — sem isso a foto entra
 * deitada e o modelo descreve a cena errada.
 */
async function decodificar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // cai no <img> abaixo — alguns formatos só decodificam por lá
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new AnexoError("formato não decodificado"))
      img.src = url
    })
  } finally {
    // Revogar só depois do onload; o decode já terminou aqui.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function desenhar(
  fonte: ImageBitmap | HTMLImageElement,
  largura: number,
  altura: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new AnexoError("O navegador não liberou o canvas para redimensionar a imagem.")
  // Fundo branco: JPEG/WebP não têm transparência, e sem isto um PNG com
  // fundo transparente vira preto — texto escuro some no resultado.
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, largura, altura)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(fonte as CanvasImageSource, 0, 0, largura, altura)
  return canvas
}

const TIPOS_SAIDA = ["image/webp", "image/jpeg"] as const
/** WebP primeiro: a mesma qualidade em menos bytes, e segura texto de
 *  print melhor que JPEG na mesma faixa. */
const QUALIDADES = [0.9, 0.8, 0.68, 0.55] as const

async function comprimir(canvas: HTMLCanvasElement): Promise<{ dataUrl: string; mime: string }> {
  let melhor: { dataUrl: string; mime: string } | null = null
  for (const mime of TIPOS_SAIDA) {
    for (const q of QUALIDADES) {
      const dataUrl = canvas.toDataURL(mime, q)
      // Navegador que não sabe gravar WebP devolve PNG silenciosamente —
      // insistir na qualidade não muda nada, então pula para o JPEG.
      if (!dataUrl.startsWith(`data:${mime}`)) break
      if (!melhor || dataUrl.length < melhor.dataUrl.length) melhor = { dataUrl, mime }
      if (dataUrl.length <= ALVO_POR_IMAGEM) return { dataUrl, mime }
    }
  }
  if (melhor) return melhor
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7)
  return { dataUrl, mime: "image/jpeg" }
}

async function prepararImagem(file: File): Promise<AnexoPreparado> {
  let fonte: ImageBitmap | HTMLImageElement
  try {
    fonte = await decodificar(file)
  } catch {
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toUpperCase() ?? "desconhecido"
    throw new AnexoError(
      `"${file.name}": este navegador não abre ${ext}. ` +
        `(HEIC de iPhone só decodifica no Safari — exporte como JPG ou PNG.)`,
    )
  }

  const lArg = "width" in fonte ? fonte.width : (fonte as HTMLImageElement).naturalWidth
  const aArg = "height" in fonte ? fonte.height : (fonte as HTMLImageElement).naturalHeight
  const { largura, altura } = dimensaoReduzida(lArg, aArg, LADO_MAXIMO_PX)

  const original = await lerComoDataUrl(file)
  // Imagem que JÁ cabe e já está no tamanho útil vai INTACTA: recomprimir
  // um print pequeno só perde nitidez do texto sem economizar nada, e
  // destruiria a animação de um GIF por nada.
  const semMudanca = largura === lArg && altura === aArg && original.length <= ALVO_POR_IMAGEM

  const mini = dimensaoReduzida(lArg, aArg, 96)
  const thumb = desenhar(fonte, mini.largura, mini.altura).toDataURL("image/webp", 0.7)

  const final = semMudanca
    ? { dataUrl: original, mime: file.type || "image/png" }
    : await comprimir(desenhar(fonte, largura, altura))

  if ("close" in fonte && typeof fonte.close === "function") fonte.close()

  if (final.dataUrl.length > TETO_POR_IMAGEM) {
    throw new AnexoError(
      `"${file.name}": mesmo reduzida a imagem ficou em ${formatarBytes(final.dataUrl.length)}, ` +
        `acima do que cabe no envio. Recorte a parte que importa e mande de novo.`,
    )
  }

  return {
    name: file.name || "imagem.png",
    mime: final.mime,
    kind: "image",
    data_url: final.dataUrl,
    thumb,
    detalhe: semMudanca
      ? `${formatarBytes(file.size)} · ${lArg}×${aArg}`
      : `${formatarBytes(file.size)} → ${formatarBytes(final.dataUrl.length)} · ${largura}×${altura}`,
  }
}

async function prepararPlanilha(file: File): Promise<string> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
  const partes = wb.SheetNames.map((nome) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nome], { blankrows: false })
    // O nome da aba viaja junto: numa planilha de várias abas, "Total" sem
    // dizer de qual aba é não serve para nada.
    return `## Aba: ${nome}\n${csv.trim()}`
  })
  return partes.join("\n\n")
}

async function prepararDocx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const doc = zip.file("word/document.xml")
  if (!doc) throw new AnexoError(`"${file.name}" não parece um .docx válido.`)
  const xml = await doc.async("string")
  return xml
    // Fim de parágrafo e quebra viram quebra de linha ANTES de tirar as
    // tags — sem isto o documento inteiro sai como um parágrafo só.
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function prepararPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist")
  // O worker é servido da NOSSA origem (webpack emite o asset) — CDN
  // exigiria abrir o CSP para um host de terceiro.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const paginas: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const texto = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    if (texto) paginas.push(`## Página ${i}\n${texto}`)
  }
  await doc.destroy()

  if (paginas.length === 0) {
    throw new AnexoError(
      `"${file.name}": o PDF não tem camada de texto (é um scan ou uma imagem). ` +
        `Mande as páginas como imagem — a IA lê o que está escrito nelas.`,
    )
  }
  return paginas.join("\n\n")
}

const ROTULO: Record<TipoAnexo, string> = {
  imagem: "imagem",
  texto: "arquivo de texto",
  planilha: "planilha",
  documento: "documento do Word",
  pdf: "PDF",
}

/**
 * Ponto único de entrada. Lança `AnexoError` com texto para a tela —
 * mensagem genérica aqui vira "não funcionou" sem o usuário saber o quê.
 */
export async function prepararAnexo(file: File): Promise<AnexoPreparado> {
  const tipo = classificarArquivo(file.name, file.type)
  if (!tipo) {
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toUpperCase()
    throw new AnexoError(
      `"${file.name}": ${ext ? `arquivos ${ext}` : "este formato"} não entram no chat. ` +
        `Aceita imagem, PDF, planilha (xlsx/csv), Word (docx) e arquivos de texto ou código.`,
    )
  }

  if (tipo === "imagem") return prepararImagem(file)

  const texto =
    tipo === "planilha"
      ? await prepararPlanilha(file)
      : tipo === "documento"
        ? await prepararDocx(file)
        : tipo === "pdf"
          ? await prepararPdf(file)
          : await lerComoTexto(file)

  if (!texto.trim()) {
    throw new AnexoError(`"${file.name}": a ${ROTULO[tipo]} está vazia — não há o que ler.`)
  }

  return {
    name: file.name,
    mime: file.type || "text/plain",
    kind: "text",
    text: limitarTexto(texto),
    detalhe: `${ROTULO[tipo]} · ${formatarBytes(file.size)} → ${texto.length.toLocaleString("pt-BR")} caracteres`,
  }
}
