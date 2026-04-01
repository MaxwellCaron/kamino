import {
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import TreeExample from "./tree-example"

export function NavDocuments() {
  return (
    <SidebarGroup className="px-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>VMs</SidebarGroupLabel>
      <TreeExample />
    </SidebarGroup>
  )
}
