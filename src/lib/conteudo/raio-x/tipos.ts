/**
 * O payload do Raio-X.
 *
 * Mora aqui, e não no serviço, porque a TELA também o importa: tipo que
 * vive no serviço arrasta o cliente do Supabase para o bundle do cliente na
 * primeira vez que alguém esquecer o `import type`.
 */

import type { Kpi, Perfil, PerfilFiltro, PilarMix, Post } from "../types"
import type { DesempenhoDeFormato, Lacuna } from "./diagnostico"
import type { NotaDoPerfil } from "./nota"

export interface RaioXData {
  perfil: PerfilFiltro
  periodo: { start: string; end: string }
  perfis: Perfil[]
  /** Os MESMOS cards do dashboard — endereçados por rótulo, nunca por índice. */
  kpis: Kpi[]
  nota: NotaDoPerfil
  lacunas: Lacuna[]
  formatos: DesempenhoDeFormato[]
  pilarMix: PilarMix
  posts: Post[]
  /** Seguidores no fim do período (null sem snapshot). */
  seguidores: number | null
  /** Meta semanal somada dos perfis do recorte — o denominador da constância. */
  metaSemanal: number
  cobertura: { totalPosts: number; ultimoPostEm: string | null; primeiroPostEm: string | null; backfillPendente: boolean }
  sincronizadoEm: string | null
  avisos: string[]
  extras: { referenciasAtivas: number; brandKits: number }
}
