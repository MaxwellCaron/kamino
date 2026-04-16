import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  IconDashboard,
  IconHelp,
  IconNetwork,
  IconSearch,
  IconSettings,
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
      icon: <IconDashboard />,
    },
    {
      title: "SDN",
      url: "/sdn",
      icon: <IconNetwork />,
    },
    {
      title: "Users",
      url: "/users",
      icon: <IconUser />,
    },
    {
      title: "Groups",
      url: "/groups",
      icon: <IconUsersGroup />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: <IconSettings />,
    },
    {
      title: "Get Help",
      url: "#",
      icon: <IconHelp />,
    },
    {
      title: "Search",
      url: "#",
      icon: <IconSearch />,
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
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
