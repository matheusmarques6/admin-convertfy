/**
 * Conector "Omnisend" — MCP da loja sobre a omnisend_api_key dela.
 * Reusa as 8 tools do ritual chat (OMNISEND_TOOLS/executeOmnisendTool,
 * já batalhadas em produção), convertendo o schema Anthropic
 * (input_schema) pro formato OpenAI/OpenRouter (function.parameters).
 */

import {
  OMNISEND_TOOLS,
  executeOmnisendTool,
} from "@/lib/integrations/omnisend/ritual-tools"
import type { ConnectorTool, ResolvedConnector } from "./types"

export function buildOmnisendConnector(apiKey: string): ResolvedConnector {
  const tools: ConnectorTool[] = OMNISEND_TOOLS.map((t) => ({
    label: t.name.replace(/^omnisend_/, "").replace(/_/g, " "),
    def: {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: (t.input_schema as unknown as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    },
    execute: async (args) => {
      const content = await executeOmnisendTool(t.name, args, apiKey)
      return { content }
    },
  }))

  return { key: "omnisend", name: "Omnisend", tools }
}
