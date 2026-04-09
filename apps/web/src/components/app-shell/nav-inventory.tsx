import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@workspace/ui/components/sidebar"
import type { ReactNode } from "react"

export function NavDocuments({ children }: { children: ReactNode }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Inventory</SidebarGroupLabel>
      {children}
    </SidebarGroup>
  )
}
