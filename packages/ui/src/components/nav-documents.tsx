import {
  SidebarGroup,
  SidebarGroupLabel,
} from "@workspace/ui/components/sidebar"
import TreeExample from "./tree-example"

export function NavDocuments() {
  return (
    <SidebarGroup className="px-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Virtual Machines</SidebarGroupLabel>
      <TreeExample />
    </SidebarGroup>
  )
}
