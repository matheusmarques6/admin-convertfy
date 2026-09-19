import type { Metadata } from "next"
import { ImageSpikeClient } from "./image-spike-client"

export const metadata: Metadata = {
  title: "Spike — Agente de Imagem",
}

export default function ImageSpikePage() {
  return <ImageSpikeClient />
}
