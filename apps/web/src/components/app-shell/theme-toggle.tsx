import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons"
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@workspace/ui/components/dropdown-menu"
import { useTheme } from "@workspace/ui/components/theme-provider"

export function ThemeToggleMenuItems() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          if (value === "light" || value === "dark" || value === "system") {
            setTheme(value)
          }
        }}
      >
        <DropdownMenuRadioItem value="light">
          <HugeiconsIcon icon={Sun01Icon} className="text-muted-foreground" />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <HugeiconsIcon icon={Moon02Icon} className="text-muted-foreground" />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <HugeiconsIcon
            icon={ComputerIcon}
            className="text-muted-foreground"
          />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}
