import Image from 'next/image'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Tamanhos padronizados do DS v3.0 Convertfy
// 16 = tabela, inline, badges
// 20 = botões, formulários, sidebar, navegação (DEFAULT)
// 24 = headers de seção, page headers
type IconSize = 16 | 20 | 24

interface IconProps {
  icon: LucideIcon
  size?: IconSize
  className?: string
  /** Para casos excepcionais onde precisa de um tamanho fora do padrão */
  customSize?: number
}

/**
 * Wrapper de ícones Lucide padronizado pelo Design System v3.0 Convertfy.
 *
 * Força strokeWidth=2 em TODOS os ícones (padrão Shopify Polaris/Stripe).
 * O Lucide default é 1.5 — não usar sem o wrapper.
 *
 * Tamanhos: 16 (inline) | 20 (default, nav/buttons) | 24 (headers)
 *
 * REGRA DO DS: Nunca envolver ícone em círculo colorido.
 * Ícones são sempre inline, naked, sem container.
 *
 * @example
 * import { BarChart3 } from 'lucide-react'
 * <Icon icon={BarChart3} />                    // 20px default
 * <Icon icon={BarChart3} size={16} />          // inline/tabela
 * <Icon icon={BarChart3} size={24} />          // header
 * <Icon icon={BarChart3} className="text-brand-400" />
 */
export function Icon({ icon: IconComponent, size = 20, className, customSize }: IconProps) {
  return (
    <IconComponent
      size={customSize ?? size}
      strokeWidth={2}
      className={cn('shrink-0', className)}
    />
  )
}

/**
 * Para usar ícones de marca (Shopify, Klaviyo, Meta, Google) que são imagens PNG.
 * NÃO usar Lucide para ícones de marca — usar este componente.
 *
 * @example
 * <BrandIcon src="/images/logo shopify (1).png" alt="Shopify" />
 * <BrandIcon src="/images/logo-klaviyo-fundo-preto (1).png" alt="Klaviyo" size={24} />
 */
interface BrandIconProps {
  src: string
  alt: string
  size?: number
  className?: string
}

export function BrandIcon({ src, alt, size = 20, className }: BrandIconProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}

/**
 * Constantes de paths dos ícones de marca para fácil referência.
 * Usar com <BrandIcon src={BRAND_ICONS.shopify} alt="Shopify" />
 */
export const BRAND_ICONS = {
  shopify: '/images/logo shopify (1).png',
  klaviyo: '/images/logo-klaviyo-fundo-preto (1).png',
  google: '/images/logo google (1).png',
  meta: '/images/logo meta (1).png',
  convertfyWhite: '/images/logo da convertfy com escrito branco.png',
  convertfyBlack: '/images/logo da convertfy com escrito preto.png',
} as const
