# PROMPT CLAUDE CODE — Figma Email Auto-Slicer

> **INSTRUÇÃO PRINCIPAL**: Você vai implementar uma feature completa no admin-convertfy. Siga as 4 fases na ordem exata: ESTUDAR → ENTENDER → EXECUTAR → REVISAR. Não pule etapas. Não pergunte nada — todas as decisões já estão documentadas aqui. Se encontrar ambiguidade, escolha a opção mais simples e siga em frente.

---

## FASE 1: ESTUDAR (leia antes de escrever qualquer código)

### 1.1 — Entenda o projeto

Leia estes arquivos na ordem, sem pular nenhum:

```
1. README.md                          → Visão geral do projeto, stack, funcionalidades
2. CLAUDE.md                          → Knowledge base de APIs (Shopify, Klaviyo)
3. ARCHITECTURE.md                    → Arquitetura do sistema
4. package.json                       → Dependências existentes, scripts
5. next.config.mjs                    → Configuração do Next.js
6. tailwind.config.ts                 → Configuração do Tailwind
7. tsconfig.json                      → Configuração TypeScript
8. src/middleware.ts                   → Auth middleware
9. .env.example e .env.local.example  → Variáveis de ambiente existentes
```

### 1.2 — Entenda a estrutura de pastas

```
Leia a árvore de diretórios:
- src/app/                            → Todas as rotas (App Router)
- src/components/                     → Componentes compartilhados
- src/components/ui/                  → Componentes shadcn/ui instalados
- src/lib/                            → Utilitários (supabase client, etc)
- src/types/                          → TypeScript types
- supabase/                           → Migrations existentes
```

### 1.3 — Estude páginas existentes como referência de padrão

Encontre e leia pelo menos 2 páginas/ferramentas existentes para entender os padrões:

```
- Procure: src/app/(dashboard)/ferramentas/   → Páginas de ferramentas existentes
- Se não existir, procure qualquer página em src/app/(dashboard)/ como modelo
- Identifique: como importam componentes shadcn, como usam Supabase, como fazem API routes
- Leia pelo menos 1 API route existente em src/app/api/
```

### 1.4 — Identifique componentes shadcn/ui disponíveis

```
Liste os arquivos em src/components/ui/ para saber quais componentes shadcn já estão instalados.
Você vai precisar de: Button, Card, Input, Badge, ScrollArea, Separator, Skeleton, Tooltip, Select, Label, Progress
Se algum não existir, instale com: npx shadcn@latest add <componente>
```

### 1.5 — Identifique o Supabase client

```
Procure em src/lib/ o arquivo que cria o Supabase client.
Provavelmente: src/lib/supabase.ts ou src/lib/supabase/client.ts
Entenda como ele é importado e usado nas outras páginas.
Identifique se usam createClientComponentClient, createServerComponentClient, ou outro padrão.
```

### 1.6 — Verifique a navigation/sidebar

```
Procure o componente de sidebar/navigation do dashboard.
Provavelmente em: src/components/sidebar.tsx ou src/app/(dashboard)/layout.tsx
Você vai precisar adicionar um link para a nova página /ferramentas/figma-slicer
Identifique o padrão: usam ícones do lucide-react? Como são os links?
```

**AÇÃO APÓS FASE 1**: Escreva um resumo de 10 linhas do que aprendeu — padrões identificados, client Supabase, componentes disponíveis, estrutura de API routes. Depois siga para a Fase 2.

---

## FASE 2: ENTENDER (o que vamos construir)

### O que é esta feature

A Convertfy é uma agência que gerencia 50+ lojas de e-commerce. Para cada loja, eles criam emails marketing no Figma. Para montar esses emails na plataforma Omnisend, precisam "fatiar" (slice) o design do email em seções separadas (hero, body, produtos, CTA, footer). Hoje isso é feito manualmente — cortando cada seção no Figma, exportando uma por uma, e subindo na Omnisend. Leva ~30 minutos por email.

**Esta feature automatiza esse processo**: o operador sobe a imagem do email completo, o sistema usa Claude Vision API para detectar automaticamente onde estão as seções, mostra um preview interativo onde o operador pode ajustar os cortes se necessário, e exporta tudo como ZIP com um click.

### Fluxo do usuário

```
1. Operador acessa /ferramentas/figma-slicer no admin
2. Arrasta a imagem do email completo (1 PNG exportado do Figma)
3. Sistema analisa com Claude Vision API (~3-5 segundos)
4. Aparece preview com linhas de corte sobrepostas na imagem
5. Operador pode:
   a. Arrastar linhas para ajustar posição do corte
   b. Adicionar novas linhas de corte (botão +)
   c. Remover linhas de corte (botão ×)
   d. Editar nome de cada seção
6. Clica "Exportar ZIP"
7. Recebe download: email-slices.zip contendo 01_hero.png, 02_body.png, etc.
```

### Arquitetura técnica

```
FRONTEND (Next.js App Router + shadcn/ui):
  /ferramentas/figma-slicer/page.tsx          → Página principal
  /ferramentas/figma-slicer/components/       → Componentes da feature
    image-uploader.tsx                         → Upload drag & drop
    slice-preview.tsx                          → Canvas interativo (componente principal)
    slice-list.tsx                             → Lista lateral das seções
    export-button.tsx                          → Download ZIP

BACKEND (Next.js API Routes):
  /api/tools/figma-slicer/analyze/route.ts    → Envia imagem → Claude Vision → retorna cortes
  /api/tools/figma-slicer/slice/route.ts      → Recebe imagem + cortes → retorna ZIP

DATABASE (Supabase):
  Tabela: slicer_export_logs                  → Log de exportações

STORAGE (Supabase):
  Bucket: email-slices                        → (opcional, para cache)
```

### Tipos TypeScript centrais

```typescript
// Usar em todo o projeto — criar em src/types/slicer.ts

interface SliceSection {
  id: string           // UUID gerado no frontend
  name: string         // ex: "hero_banner", "body_copy", "products"
  y_start: number      // coordenada Y em pixels da imagem ORIGINAL
  y_end: number        // coordenada Y em pixels da imagem ORIGINAL
  description?: string // descrição opcional do Claude
}

interface SliceAnalysisResult {
  total_height: number
  sections: SliceSection[]
}

interface ImageDimensions {
  width: number
  height: number
}

interface SliceExportLog {
  id: string
  user_id: string
  client_id?: string
  original_filename: string
  original_width: number
  original_height: number
  slices_count: number
  slice_data: SliceSection[]
  analysis_method: 'claude_vision' | 'manual'
  analysis_duration_ms?: number
  created_at: string
}
```

---

## FASE 3: EXECUTAR (implementar na ordem exata)

### ETAPA 3.1 — Instalar dependências

```bash
npm install sharp jszip @anthropic-ai/sdk
npm install -D @types/jszip
```

Verificar se `lucide-react` já está instalado (provavelmente sim). Se não:
```bash
npm install lucide-react
```

Instalar componentes shadcn que faltam:
```bash
npx shadcn@latest add button card input badge scroll-area separator skeleton tooltip select label progress
```
(Se algum já existir, o shadcn vai avisar — ignore e continue.)

### ETAPA 3.2 — Configurar next.config.mjs

Adicionar `sharp` aos external packages para funcionar no Vercel. Abrir `next.config.mjs` e adicionar dentro do objeto de configuração:

```javascript
experimental: {
  serverComponentsExternalPackages: ['sharp'],
},
```

Se já existir um bloco `experimental`, adicionar `serverComponentsExternalPackages` dentro dele sem sobrescrever o resto.

Também adicionar nos `images.domains` (se existir) ou criar: não é necessário para esta feature.

### ETAPA 3.3 — Adicionar variável de ambiente

Adicionar ao `.env.example` e `.env.local.example`:
```
# Figma Email Slicer - Claude Vision
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### ETAPA 3.4 — Criar tipos TypeScript

Criar `src/types/slicer.ts`:

```typescript
export interface SliceSection {
  id: string
  name: string
  y_start: number
  y_end: number
  description?: string
}

export interface SliceAnalysisResponse {
  success: boolean
  analysis: {
    total_height: number
    sections: Array<{
      name: string
      y_start: number
      y_end: number
      description?: string
    }>
  }
  duration_ms: number
}

export interface ImageDimensions {
  width: number
  height: number
}
```

### ETAPA 3.5 — Criar migration SQL no Supabase

Criar arquivo `supabase/migrations/YYYYMMDD_create_slicer_tables.sql` (usar data de hoje no formato YYYYMMDD):

```sql
-- Tabela de logs de exportação do slicer
CREATE TABLE IF NOT EXISTS slicer_export_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID DEFAULT NULL,
  original_filename TEXT NOT NULL,
  original_width INTEGER NOT NULL,
  original_height INTEGER NOT NULL,
  slices_count INTEGER NOT NULL DEFAULT 0,
  slice_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_method TEXT NOT NULL DEFAULT 'claude_vision',
  analysis_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slicer_logs_created ON slicer_export_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slicer_logs_user ON slicer_export_logs(user_id);

ALTER TABLE slicer_export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view slicer logs"
  ON slicer_export_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert slicer logs"
  ON slicer_export_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

**NOTA**: Se o projeto usar `client_id` como FK para uma tabela `clients`, verifique se essa tabela existe e adicione a foreign key. Se não existir, deixe `client_id` como UUID simples sem FK.

### ETAPA 3.6 — Criar API Route: /api/tools/figma-slicer/analyze

Criar `src/app/api/tools/figma-slicer/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const SLICE_ANALYSIS_PROMPT = `Você é um especialista em email marketing design. Analise esta imagem de um email marketing completo e identifique cada seção visual distinta que deve ser cortada como uma imagem separada para montagem em plataforma de email marketing (Omnisend/Klaviyo).

REGRAS CRÍTICAS DE DETECÇÃO:
1. Cada seção é uma faixa horizontal que ocupa a LARGURA TOTAL do email
2. Seções típicas incluem (mas não se limitam a):
   - hero/banner (imagem principal com headline)
   - body/texto (bloco de texto com oferta/desconto)
   - cupom/oferta (bloco de cupom com código)
   - grid de produtos (2x2, 3x3 de produtos com botões "comprar")
   - benefícios/trust badges (ícones de envio, qualidade, segurança)
   - CTA final (chamada para ação com botão)
   - footer (logo, links, copyright)
3. O ponto de corte deve ser EXATAMENTE na fronteira visual entre duas seções — onde uma "faixa" termina e outra começa
4. Se duas áreas têm o mesmo fundo mas conteúdo FUNCIONALMENTE diferente (ex: bloco de texto vs grid de produtos, ambos fundo branco), são seções SEPARADAS
5. Se uma área tem conteúdo que forma uma unidade visual coesa (ex: 3 ícones de trust badges + texto abaixo de cada um), é UMA seção
6. O primeiro slice SEMPRE começa em y_start=0
7. O último slice SEMPRE termina em y_end=<altura total da imagem>
8. y_end de uma seção DEVE ser EXATAMENTE igual ao y_start da próxima — sem gaps, sem sobreposição
9. Cada seção deve ter um nome descritivo curto em snake_case (ex: hero_banner, coupon_code, product_grid, trust_badges, cta_final, footer)

RETORNE APENAS um JSON válido. Sem markdown, sem backticks, sem texto antes ou depois. O formato exato:

{
  "total_height": <altura total da imagem em pixels, deve ser um inteiro>,
  "sections": [
    {
      "name": "hero_banner",
      "y_start": 0,
      "y_end": 780,
      "description": "Banner principal com imagem de produto e headline de desconto"
    },
    {
      "name": "coupon_code",
      "y_start": 780,
      "y_end": 1230,
      "description": "Bloco com código de cupom ESPECIAL e countdown de 12h"
    }
  ]
}

VALIDAÇÃO FINAL antes de retornar:
- total_height é um número inteiro positivo?
- Primeiro y_start é 0?
- Último y_end é igual a total_height?
- Cada y_end === próximo y_start (sem gaps)?
- Todos os valores são inteiros (não decimais)?
- Pelo menos 2 seções detectadas?
Se qualquer validação falhar, corrija antes de retornar.`

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma imagem enviada. Envie um arquivo no campo "image".' },
        { status: 400 }
      )
    }

    // Validar tipo
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPG ou WebP.` },
        { status: 400 }
      )
    }

    // Validar tamanho (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Arquivo muito grande. Máximo 10MB.' },
        { status: 400 }
      )
    }

    // Converter para base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const mediaType = file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

    const startTime = Date.now()

    // Chamar Claude Vision API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: SLICE_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    })

    const analysisMs = Date.now() - startTime

    // Extrair texto da resposta
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // Limpar e parsear JSON
    const cleanJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    let analysis
    try {
      analysis = JSON.parse(cleanJson)
    } catch (parseError) {
      console.error('Erro ao parsear resposta do Claude:', cleanJson)
      return NextResponse.json(
        { success: false, error: 'Claude retornou resposta inválida. Tente novamente.' },
        { status: 500 }
      )
    }

    // Validar e corrigir seções
    if (!analysis.sections || !Array.isArray(analysis.sections) || analysis.sections.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma seção detectada. A imagem pode não ser um email marketing.' },
        { status: 422 }
      )
    }

    // Garantir que seções são contíguas (corrigir gaps)
    for (let i = 1; i < analysis.sections.length; i++) {
      if (analysis.sections[i].y_start !== analysis.sections[i - 1].y_end) {
        analysis.sections[i].y_start = analysis.sections[i - 1].y_end
      }
    }

    // Garantir que começa em 0
    analysis.sections[0].y_start = 0

    // Arredondar todos os valores para inteiros
    for (const section of analysis.sections) {
      section.y_start = Math.round(section.y_start)
      section.y_end = Math.round(section.y_end)
    }

    return NextResponse.json({
      success: true,
      analysis,
      duration_ms: analysisMs,
    })
  } catch (error: unknown) {
    console.error('Erro na análise de slices:', error)
    const message = error instanceof Error ? error.message : 'Erro interno ao analisar imagem'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
```

### ETAPA 3.7 — Criar API Route: /api/tools/figma-slicer/slice

Criar `src/app/api/tools/figma-slicer/slice/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import JSZip from 'jszip'

interface SliceSectionInput {
  name: string
  y_start: number
  y_end: number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null
    const sectionsJson = formData.get('sections') as string | null

    if (!file || !sectionsJson) {
      return NextResponse.json(
        { error: 'Campos "image" e "sections" são obrigatórios' },
        { status: 400 }
      )
    }

    let sections: SliceSectionInput[]
    try {
      sections = JSON.parse(sectionsJson)
    } catch {
      return NextResponse.json(
        { error: 'Campo "sections" deve ser JSON válido' },
        { status: 400 }
      )
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: 'Pelo menos 1 seção é necessária' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Obter metadata da imagem
    const metadata = await sharp(buffer).metadata()
    const imageWidth = metadata.width!
    const imageHeight = metadata.height!

    // Gerar ZIP com os slices
    const zip = new JSZip()

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const sliceHeight = section.y_end - section.y_start

      // Validações de segurança
      if (sliceHeight <= 0) continue
      if (section.y_start < 0) section.y_start = 0
      if (section.y_end > imageHeight) section.y_end = imageHeight

      const actualHeight = Math.min(sliceHeight, imageHeight - section.y_start)

      try {
        const sliceBuffer = await sharp(buffer)
          .extract({
            left: 0,
            top: section.y_start,
            width: imageWidth,
            height: actualHeight,
          })
          .png()
          .toBuffer()

        const fileName = `${String(i + 1).padStart(2, '0')}_${section.name}.png`
        zip.file(fileName, sliceBuffer)
      } catch (sliceError) {
        console.error(`Erro ao cortar seção ${section.name}:`, sliceError)
        // Continuar com as outras seções
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="email-slices-${Date.now()}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (error: unknown) {
    console.error('Erro ao gerar slices:', error)
    const message = error instanceof Error ? error.message : 'Erro ao processar imagem'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// Aumentar limite de body para imagens grandes
export const config = {
  api: {
    bodyParser: false,
  },
}
```

**IMPORTANTE sobre tamanho de body**: No Next.js 14 App Router, verifique se existe um `route segment config` para aumentar o limite. Se necessário, adicione no topo do arquivo:
```typescript
export const runtime = 'nodejs'
export const maxDuration = 30 // segundos
```

### ETAPA 3.8 — Criar a página principal

Criar `src/app/(dashboard)/ferramentas/figma-slicer/page.tsx`.

**IMPORTANTE**: Antes de criar, verifique o layout do dashboard:
- Se existe `src/app/(dashboard)/layout.tsx`, a página herdará o layout
- Se a estrutura de rotas for diferente, adapte o path

A página deve:

1. Ser um `'use client'` component (precisa de estado e interatividade)
2. Ter 3 estados visuais controlados por um state `step`:
   - `'upload'` → Mostra ImageUploader
   - `'analyzing'` → Mostra skeleton/loading com mensagem "Analisando email com IA..."
   - `'preview'` → Mostra SlicePreview + SliceList + ExportButton
3. Usar o layout com duas colunas no estado preview:
   - Esquerda (2/3): imagem com linhas de corte (SlicePreview)
   - Direita (1/3): lista de seções + botão exportar (SliceList + ExportButton)

**Esqueleto da página**:

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Scissors, Upload, ArrowLeft } from 'lucide-react'
// ... importar componentes que você vai criar

// Tipos
interface SliceSection {
  id: string
  name: string
  y_start: number
  y_end: number
  description?: string
}

interface ImageData {
  file: File
  url: string // Object URL
  width: number
  height: number
}

type Step = 'upload' | 'analyzing' | 'preview'

export default function FigmaSlicerPage() {
  const [step, setStep] = useState<Step>('upload')
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [sections, setSections] = useState<SliceSection[]>([])
  const [analysisTime, setAnalysisTime] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Handler: imagem selecionada
  const handleImageSelected = useCallback(async (file: File, dimensions: { width: number; height: number }) => {
    const url = URL.createObjectURL(file)
    setImageData({ file, url, width: dimensions.width, height: dimensions.height })
    setError(null)
    setStep('analyzing')

    // Chamar API de análise
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch('/api/tools/figma-slicer/analyze', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Erro na análise')
      }

      // Adicionar IDs únicos às seções
      const sectionsWithIds = data.analysis.sections.map((s: any, i: number) => ({
        ...s,
        id: crypto.randomUUID(),
      }))

      setSections(sectionsWithIds)
      setAnalysisTime(data.duration_ms)
      setStep('preview')
    } catch (err: any) {
      setError(err.message)
      setStep('upload')
    }
  }, [])

  // Handler: exportar ZIP
  const handleExport = useCallback(async () => {
    if (!imageData || sections.length === 0) return

    setIsExporting(true)
    try {
      const formData = new FormData()
      formData.append('image', imageData.file)
      formData.append('sections', JSON.stringify(sections.map(({ name, y_start, y_end }) => ({ name, y_start, y_end }))))

      const response = await fetch('/api/tools/figma-slicer/slice', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Erro ao exportar')
      }

      // Download do ZIP
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `slices-${imageData.file.name.replace(/\.[^/.]+$/, '')}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsExporting(false)
    }
  }, [imageData, sections])

  // Handler: recomeçar
  const handleReset = useCallback(() => {
    if (imageData?.url) URL.revokeObjectURL(imageData.url)
    setImageData(null)
    setSections([])
    setError(null)
    setStep('upload')
  }, [imageData])

  // Handler: atualizar seções (quando operador arrasta linhas ou edita nomes)
  const handleSectionsChange = useCallback((newSections: SliceSection[]) => {
    setSections(newSections)
  }, [])

  // RENDERIZAR conforme step atual
  // ... implementar o JSX completo com os componentes
}
```

### ETAPA 3.9 — Criar componente ImageUploader

Criar `src/app/(dashboard)/ferramentas/figma-slicer/components/image-uploader.tsx`:

Requisitos do componente:
- Drag & drop zone com visual claro (borda dashed, ícone Upload)
- Aceitar: .png, .jpg, .jpeg, .webp
- Máximo: 10MB
- Ao dropar/selecionar arquivo:
  1. Validar tipo e tamanho
  2. Criar `new Image()` e carregar o file como dataURL
  3. No `onload`, extrair `naturalWidth` e `naturalHeight`
  4. Chamar `onImageSelected(file, { width, height })`
- Mostrar erro inline se arquivo inválido
- Visual: usar Card do shadcn, ícone Upload do lucide-react
- Estados visuais: idle, dragover (highlight azul), error (highlight vermelho)
- Adicionar texto: "PNG, JPG ou WebP — até 10MB"

```typescript
// Props
interface ImageUploaderProps {
  onImageSelected: (file: File, dimensions: { width: number; height: number }) => void
  isDisabled?: boolean
}
```

### ETAPA 3.10 — Criar componente SlicePreview (MAIS COMPLEXO — atenção total)

Criar `src/app/(dashboard)/ferramentas/figma-slicer/components/slice-preview.tsx`:

Este é o componente central da feature. Leia com muita atenção.

**CONCEITO CHAVE: Coordenadas proporcionais**

A imagem original pode ter, por exemplo, 600×2700px. No preview ela é renderizada menor (ex: 400×1800px). As coordenadas `y_start` e `y_end` são sempre em pixels da imagem ORIGINAL. Para posicionar as linhas de corte no preview:

```
displayY = (originalY / originalHeight) * containerHeight
```

Para converter de volta quando o operador arrasta:
```
originalY = (displayY / containerHeight) * originalHeight
```

**ESTRUTURA DO COMPONENTE**:

```
<div ref={containerRef} className="relative select-none">
  {/* Imagem do email */}
  <img
    src={imageUrl}
    className="w-full"
    draggable={false}
    onLoad={(e) => /* capturar altura renderizada */}
  />

  {/* Overlay com linhas de corte */}
  {sections.slice(0, -1).map((section, index) => {
    // Linha de corte na posição y_end de cada seção (exceto a última)
    const displayY = (section.y_end / imageDimensions.height) * displayHeight
    return (
      <CutLine
        key={section.id}
        y={displayY}
        index={index}
        onDrag={handleDrag}
      />
    )
  })}

  {/* Labels das seções (nome + dimensão) */}
  {sections.map((section, index) => {
    const topY = (section.y_start / imageDimensions.height) * displayHeight
    const bottomY = (section.y_end / imageDimensions.height) * displayHeight
    const centerY = (topY + bottomY) / 2
    return (
      <SectionLabel
        key={section.id}
        section={section}
        centerY={centerY}
        index={index}
        imageWidth={imageDimensions.width}
      />
    )
  })}
</div>
```

**LINHA DE CORTE (CutLine)**:
- `position: absolute`, `left: 0`, `right: 0`, `top: ${y}px`
- Visual: linha com `height: 2px`, `background: #EF4444` (vermelho)
- Handle central: círculo de 28px no centro com ícone GripHorizontal
- Hover: linha fica `height: 3px`, handle destaca com shadow
- Cursor: `cursor-ns-resize`
- Na borda esquerda: badge com o número da seção abaixo
- Botão ×: ao hover, aparece botão para remover este corte (merge seções)

**DRAG DA LINHA**:
- `onPointerDown` no handle → capturar `startY`, `startOriginalY`, adicionar listeners
- `onPointerMove` → calcular deltaY, nova posição, clampar entre linha de cima e de baixo
- `onPointerUp` → finalizar, converter posição de volta para pixels originais, atualizar sections
- Usar `pointer events` (não mouse events) para funcionar em mobile
- Usar `e.preventDefault()` para evitar seleção de texto
- Opcional: mostrar tooltip com coordenada Y durante drag

**ADICIONAR CORTE (botão +)**:
- Ao clicar entre duas linhas, adicionar novo corte no meio da seção
- Calcular: `newY = (section.y_start + section.y_end) / 2`
- Criar nova seção com nome `section_${index + 1}`
- Atualizar array de sections

**IMPLEMENTAR COM CUIDADO**:
- `useRef` para containerRef (medir displayHeight)
- `useState` para displayHeight (atualizar no onLoad da imagem e no resize)
- `useEffect` com ResizeObserver para manter displayHeight atualizado
- `useCallback` para handlers de drag (performance)
- `touch-action: none` no container para evitar scroll durante drag mobile

```typescript
interface SlicePreviewProps {
  imageUrl: string
  imageDimensions: ImageDimensions
  sections: SliceSection[]
  onSectionsChange: (sections: SliceSection[]) => void
}
```

### ETAPA 3.11 — Criar componente SliceList

Criar `src/app/(dashboard)/ferramentas/figma-slicer/components/slice-list.tsx`:

Lista lateral mostrando todas as seções detectadas:

```typescript
interface SliceListProps {
  sections: SliceSection[]
  imageDimensions: ImageDimensions
  onSectionsChange: (sections: SliceSection[]) => void
  onAddSection: () => void
}
```

Cada item da lista:
- Número: "01", "02", "03"... (derivado do index)
- Nome: input editável (inline, `contentEditable` ou input que aparece ao clicar)
  - Ao editar, atualizar sections com o novo nome
  - Validar: snake_case, sem espaços, sem caracteres especiais
- Dimensões: `{imageDimensions.width} × {section.y_end - section.y_start} px`
- Botão remover: ícone Trash2 do lucide-react (com confirmação ou undo)
  - Ao remover, merge a seção com a anterior (y_end da anterior = y_end desta)

Abaixo da lista:
- Botão "+ Adicionar corte"
- Info: "Analisado em {analysisTime/1000}s" se disponível
- Botão "↺ Re-analisar" para rodar a análise novamente

Usar: ScrollArea do shadcn (caso lista fique longa), Card, Input, Button, Badge

### ETAPA 3.12 — Criar componente ExportButton

Criar `src/app/(dashboard)/ferramentas/figma-slicer/components/export-button.tsx`:

```typescript
interface ExportButtonProps {
  onExport: () => void
  isExporting: boolean
  sectionsCount: number
}
```

- Botão principal: "Exportar {sectionsCount} slices como ZIP"
- Ícone: Download do lucide-react
- Loading state: spinner + "Gerando slices..."
- Disabled quando isExporting ou sectionsCount === 0
- Variante: Button do shadcn, size="lg", className="w-full"

### ETAPA 3.13 — Adicionar link na navegação

Encontre o componente de sidebar/navegação do dashboard e adicione um link:
- Path: `/ferramentas/figma-slicer`
- Label: "Email Slicer" ou "Figma Slicer"
- Ícone: `Scissors` do lucide-react
- Posição: dentro da seção "Ferramentas" se existir, senão após os outros links

Se a navegação usar um array/config de itens, adicione:
```typescript
{
  title: 'Email Slicer',
  href: '/ferramentas/figma-slicer',
  icon: Scissors, // do lucide-react
}
```

### ETAPA 3.14 — Montar tudo na página

Voltar ao `page.tsx` e montar o JSX completo:

```tsx
return (
  <div className="space-y-6">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Slicer</h1>
        <p className="text-muted-foreground">
          Corte automático de emails com IA — arraste e ajuste os cortes
        </p>
      </div>
      {step === 'preview' && (
        <Button variant="outline" onClick={handleReset}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Novo email
        </Button>
      )}
    </div>

    {/* Erro global */}
    {error && (
      <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    )}

    {/* Step: Upload */}
    {step === 'upload' && (
      <ImageUploader onImageSelected={handleImageSelected} />
    )}

    {/* Step: Analyzing */}
    {step === 'analyzing' && (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
          {/* Spinner animado */}
          <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <div className="text-center">
            <p className="font-medium">Analisando email com IA...</p>
            <p className="text-sm text-muted-foreground">Claude está identificando as seções</p>
          </div>
        </CardContent>
      </Card>
    )}

    {/* Step: Preview */}
    {step === 'preview' && imageData && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: Preview com linhas de corte */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <SlicePreview
                imageUrl={imageData.url}
                imageDimensions={{ width: imageData.width, height: imageData.height }}
                sections={sections}
                onSectionsChange={handleSectionsChange}
              />
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: Lista de seções + Export */}
        <div className="space-y-4">
          <SliceList
            sections={sections}
            imageDimensions={{ width: imageData.width, height: imageData.height }}
            onSectionsChange={handleSectionsChange}
            analysisTime={analysisTime}
          />

          <ExportButton
            onExport={handleExport}
            isExporting={isExporting}
            sectionsCount={sections.length}
          />
        </div>
      </div>
    )}
  </div>
)
```

**ADAPTAR** o JSX ao padrão visual das outras páginas do projeto. Se usam um wrapper diferente, padding diferente, estrutura de header diferente — siga o padrão existente.

---

## FASE 4: REVISAR (testar e corrigir)

### 4.1 — Checklist de compilação

```bash
# Rodar build — ZERO erros permitidos
npm run build

# Se houver erros TypeScript, corrija todos antes de prosseguir
# Se houver warnings de ESLint, corrija os críticos
```

### 4.2 — Checklist de funcionamento

Teste manual (necessário ANTHROPIC_API_KEY no .env.local):

```
1. [ ] Acessar /ferramentas/figma-slicer — página carrega sem erros
2. [ ] Zona de upload visível e funcional
3. [ ] Arrastar PNG de email — imagem é aceita, análise começa
4. [ ] Loading state aparece durante análise
5. [ ] Após análise: preview aparece com linhas de corte
6. [ ] Linhas de corte visíveis sobre a imagem
7. [ ] Arrastar uma linha — ela se move e atualiza as seções
8. [ ] Nomes das seções são editáveis
9. [ ] Botão exportar funciona — ZIP é baixado
10. [ ] ZIP contém os PNGs corretos com nomes numerados
11. [ ] Botão "Novo email" reseta tudo
12. [ ] Link na sidebar/navegação funciona
```

### 4.3 — Checklist de código

```
1. [ ] Nenhum `console.log` esquecido (apenas console.error para erros reais)
2. [ ] Nenhuma API key exposta no frontend
3. [ ] Todos os componentes com 'use client' quando necessário
4. [ ] Imports corretos (paths com @ alias)
5. [ ] Tipos TypeScript sem `any` (exceto em catches)
6. [ ] Error handling em todas as chamadas de API
7. [ ] Loading states em todas as operações assíncronas
8. [ ] Cleanup de Object URLs (URL.revokeObjectURL) no unmount
9. [ ] Acessibilidade básica: labels, alt texts, keyboard navigation
10. [ ] Responsivo: funcionar no mobile (preview scrollable, lista abaixo em tela pequena)
```

### 4.4 — Tratamento de edge cases

Verificar que o código lida com:
- Imagem muito pequena (<200px largura) → mostrar erro amigável
- Imagem muito grande (>10MB) → mostrar erro antes do upload
- API do Claude fora do ar → erro amigável + botão "tentar novamente"
- Claude retorna JSON inválido → erro + opção de re-analisar
- Claude detecta apenas 1 seção → avisar que não há cortes, permitir adicionar manual
- Seção com altura 0 ou negativa → filtrar automaticamente
- Operador arrasta linha além do limite → clampar na posição máxima/mínima
- Operador remove todas as linhas → voltar para 1 seção (imagem inteira)

### 4.5 — Após tudo funcionar

```bash
# Commit com mensagem descritiva
git add .
git commit -m "feat: add Figma Email Auto-Slicer tool with Claude Vision

- New page at /ferramentas/figma-slicer
- Claude Vision API integration for automatic section detection
- Interactive slice preview with draggable cut lines
- ZIP export with numbered slice PNGs
- Support for adding/removing/adjusting cut positions
- Server-side image processing with Sharp"
```

---

## REFERÊNCIA RÁPIDA

### Estrutura final de arquivos criados

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── ferramentas/
│   │       └── figma-slicer/
│   │           ├── page.tsx
│   │           └── components/
│   │               ├── image-uploader.tsx
│   │               ├── slice-preview.tsx
│   │               ├── slice-list.tsx
│   │               └── export-button.tsx
│   └── api/
│       └── tools/
│           └── figma-slicer/
│               ├── analyze/
│               │   └── route.ts
│               └── slice/
│                   └── route.ts
├── types/
│   └── slicer.ts
supabase/
└── migrations/
    └── YYYYMMDD_create_slicer_tables.sql
```

### Dependências adicionadas

```
sharp, jszip, @anthropic-ai/sdk, @types/jszip
```

### Variáveis de ambiente

```
ANTHROPIC_API_KEY=sk-ant-...
```
