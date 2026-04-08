// ============================================================================
// Figma Email Slicer — shared types
// ============================================================================

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
    sections: SliceAnalysisSection[]
  }
  duration_ms: number
}

export interface ImageDimensions {
  width: number
  height: number
}
