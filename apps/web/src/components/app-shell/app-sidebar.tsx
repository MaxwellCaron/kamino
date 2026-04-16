import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  IconDashboard,
  IconNetwork,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { NavUser } from "./nav-user"
import { NavMain } from "./nav-main"
import type { AuthUser } from "@/lib/queries"
import {
  InventoryTreeBody,
  InventoryTreeHeader,
  InventoryTreeProvider,
} from "@/components/inventory/tree/inventory-tree"

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: <IconDashboard className="text-muted-foreground" />,
    },
    {
      title: "SDN",
      url: "/sdn",
      icon: <IconNetwork className="text-muted-foreground" />,
    },
    {
      title: "Users",
      url: "/users",
      icon: <IconUser className="text-muted-foreground" />,
    },
    {
      title: "Groups",
      url: "/groups",
      icon: <IconUsersGroup className="text-muted-foreground" />,
    },
  ],
}
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link to="/" />}
            >
              <img src="/kamino.svg" alt="Kamino" className="size-5!" />
              <span className="text-base font-semibold">Kamino</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <NavMain items={data.navMain} />
      <InventoryTreeProvider>
        <SidebarGroup className="rounded-3xl border-b group-data-[collapsible=icon]:hidden">
          <InventoryTreeHeader />
        </SidebarGroup>
        <SidebarContent className="group-data-[collapsible=icon]:hidden">
          <InventoryTreeBody />
        </SidebarContent>
      </InventoryTreeProvider>
      <SidebarFooter className="group-data-[collapsible=icon]:mt-auto">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
