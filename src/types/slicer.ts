// ============================================================================
// Figma Email Slicer — shared types
// ============================================================================

// ===== FIGMA =====

export interface FigmaEmail {
  id: string
  name: string
  width?: number
  height?: number
}

export interface FigmaFunnel {
  id: string
  name: string
  emails: FigmaEmail[]
}

export interface FigmaPage {
  id: string
  name: string
  funnels: FigmaFunnel[]
}

export interface FigmaFileStructure {
  name: string
  fileKey: string
  lastModified: string
  pages: FigmaPage[]
}

// ===== SLICER =====

export interface SliceSection {
  id: string
  name: string
  y_start: number
  y_end: number
  description?: string
}

export interface SliceAnalysisSection {
  name: string
  y_start: number
  y_end: number
  description?: string
}

export interface SliceAnalysisResponse {
  success: boolean
  analysis: {
    total_height: number
    image_width: number
    sections: SliceAnalysisSection[]
  }
  duration_ms: number
}

export interface ImageDimensions {
  width: number
  height: number
}
