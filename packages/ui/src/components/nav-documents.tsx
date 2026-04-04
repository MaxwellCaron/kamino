import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@workspace/ui/components/sidebar"
import type { ReactNode } from "react"

export function NavDocuments({ children }: { children: ReactNode }) {
  return (
    <SidebarGroup className="px-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>VMs</SidebarGroupLabel>
      {children}
    </SidebarGroup>
  )
}
