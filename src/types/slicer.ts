// ============================================================================
// Figma Email Slicer V4 — shared types
// ============================================================================

// ===== FIGMA =====

export interface FigmaEmail {
  id: string
  name: string
  width: number
  height: number
}

export interface FigmaFunnel {
  id: string
  name: string
  emailCount: number
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
  pages: FigmaPage[]
}

// ===== SLICER =====

export interface SliceSection {
  id: string
  name: string // parte_1, parte_2, ...
  y_start: number
  y_end: number
}

export interface ImageDimensions {
  width: number
  height: number
}

export interface EmailResult {
  email: FigmaEmail
  sections: SliceSection[]
  imageBase64: string
  dimensions: ImageDimensions | null
  error: string | null
}

// ===== Fases da UI =====

export type SlicerStep =
  | "connect"
  | "browsing"
  | "processing"
  | "results"
  | "editing"
  | "manual"

export interface ProcessingStatus {
  phase: "exporting" | "analyzing"
  current: number
  total: number
}
