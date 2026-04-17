import { IconDeviceImac, IconMoon, IconSun } from "@tabler/icons-react"
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
          <IconSun className="text-muted-foreground" />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <IconMoon className="text-muted-foreground" />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <IconDeviceImac className="text-muted-foreground" />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}
