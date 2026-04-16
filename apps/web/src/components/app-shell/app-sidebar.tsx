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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { NavDocuments } from "./nav-inventory"
import { NavUser } from "./nav-user"
import { NavMain } from "./nav-main"
import { NavSecondary } from "./nav-secondary"
import type { AuthUser } from "@/lib/queries"

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
  inventoryTree,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
  inventoryTree?: React.ReactNode
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
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments>{inventoryTree}</NavDocuments>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
