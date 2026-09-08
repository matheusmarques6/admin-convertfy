import { describe, it, expect, vi } from "vitest"

// Isola o I/O: o módulo importa createAdminClient no topo (só o bucket,
// que é puro, é exercitado aqui).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { bucketOfEmail } from "./agent-executions.service"
import { EM_VOO } from "@/types/agent-executions"

describe("bucketOfEmail", () => {
  it("ready, approved e live são sucesso — approved/live são do epic Klaviyo", () => {
    expect(bucketOfEmail("ready")).toBe("success")
    expect(bucketOfEmail("approved")).toBe("success")
    expect(bucketOfEmail("live")).toBe("success")
  })

  it("failed é erro", () => {
    expect(bucketOfEmail("failed")).toBe("error")
  })

  it("todo status EM VOO cai em running", () => {
    for (const s of EM_VOO) expect(bucketOfEmail(s)).toBe("running")
  })

  it("status desconhecido conta como running, não como erro", () => {
    // A lista de status do pipeline cresce (copy_generating_recovery,
    // image_done…). Tratar o que não conhecemos como ERRO pintaria de
    // vermelho uma geração saudável na primeira vez que um status novo
    // aparecesse.
    expect(bucketOfEmail("status_que_nao_existe_ainda")).toBe("running")
  })
})
