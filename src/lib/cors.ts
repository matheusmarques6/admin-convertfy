import { NextRequest, NextResponse } from "next/server"

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
]

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim())
  }
  if (process.env.NODE_ENV === "development") {
    return DEFAULT_ALLOWED_ORIGINS
  }
  return []
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (process.env.NODE_ENV === "development") return true
  return getAllowedOrigins().includes(origin)
}

export function corsHeaders(origin?: string | null) {
  const allowedOrigin = origin && isOriginAllowed(origin) ? origin : getAllowedOrigins()[0] || ""

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

export function handleCorsPreFlight(request: NextRequest) {
  const origin = request.headers.get("origin")
  return NextResponse.json({}, { headers: corsHeaders(origin) })
}
