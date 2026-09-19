import { ConvertiaChat } from "@/components/convertia/convertia-chat"

export const dynamic = "force-dynamic"

/** /admin/operacional/ia — ConvertIA no workspace operacional. */
export default function ConvertiaOperacionalPage() {
  return <ConvertiaChat ws="operacional" />
}
