import { MoreHorizontal, type LucideIcon } from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ActionItem {
  label: string
  icon?: LucideIcon
  onClick?: () => void
  href?: string
  destructive?: boolean
  disabled?: boolean
  hidden?: boolean
}

interface ActionMenuProps {
  items: ActionItem[]
  label?: string
  triggerClassName?: string
  align?: "start" | "center" | "end"
}

export function ActionMenu({ items, label = "Ações", triggerClassName, align = "end" }: ActionMenuProps) {
  const visibleItems = items.filter(item => !item.hidden)
  const regularItems = visibleItems.filter(item => !item.destructive)
  const destructiveItems = visibleItems.filter(item => item.destructive)

  if (visibleItems.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={cn("h-8 w-8", triggerClassName)}>
          <IconWrapper icon={MoreHorizontal} size={16} />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {regularItems.map((item) => {
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              asChild={!!item.href}
            >
              {item.href ? (
                <a href={item.href}>
                  {item.icon && <IconWrapper icon={item.icon} size={16} className="mr-2" />}
                  {item.label}
                </a>
              ) : (
                <>
                  {item.icon && <IconWrapper icon={item.icon} size={16} className="mr-2" />}
                  {item.label}
                </>
              )}
            </DropdownMenuItem>
          )
        })}
        {destructiveItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {destructiveItems.map((item) => {
              return (
                <DropdownMenuItem
                  key={item.label}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  className="text-destructive focus:text-destructive"
                >
                  {item.icon && <IconWrapper icon={item.icon} size={16} className="mr-2" />}
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
