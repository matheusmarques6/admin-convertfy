import { ConvertiaChat } from "@/components/convertia/convertia-chat"

export const dynamic = "force-dynamic"

/** /admin/comercial/ia — ConvertIA no workspace comercial. */
export default function ConvertiaComercialPage() {
  return <ConvertiaChat ws="comercial" />
}
