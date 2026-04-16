import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"

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
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import { NavUser } from "./nav-user"
import type { AuthUser } from "@/lib/queries"
import {
  ManagementPermissionBits,
  hasManagementPermission,
} from "@/lib/queries"
import {
  InventoryTreeBody,
  InventoryTreeHeader,
  InventoryTreeProvider,
} from "@/components/inventory/tree/inventory-tree"

const navItems = [
  { title: "Dashboard", url: "/", icon: IconDashboard },
  { title: "SDN", url: "/sdn", icon: IconNetwork },
  { title: "Users", url: "/users", icon: IconUser },
  { title: "Groups", url: "/groups", icon: IconUsersGroup },
] as const

function isActivePath(pathname: string, url: string) {
  if (url === "/") return pathname === "/"
  return pathname === url || pathname.startsWith(url + "/")
}

export function AppSidebar({
  user,
  className,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const visibleNavItems = React.useMemo(
    () =>
      navItems.filter((item) => {
        if (item.url === "/sdn") {
          return hasManagementPermission(
            user.management_permissions,
            ManagementPermissionBits.viewSdn
          )
        }
        if (item.url === "/users") {
          return hasManagementPermission(
            user.management_permissions,
            ManagementPermissionBits.viewPrincipals
          )
        }
        if (item.url === "/groups") {
          return (
            hasManagementPermission(
              user.management_permissions,
              ManagementPermissionBits.viewPrincipals
            ) ||
            hasManagementPermission(
              user.management_permissions,
              ManagementPermissionBits.manageAccess
            )
          )
        }

        return true
      }),
    [user.management_permissions]
  )

  return (
    <Sidebar
      collapsible="icon"
      className={cn("overflow-hidden", className)}
      {...props}
    >
      <div className="flex h-full w-full flex-row">
        {/* Icon rail */}
        <Sidebar
          collapsible="none"
          className="w-[calc(var(--sidebar-width-icon)+8px)]! border-r pr-2 group-data-[state=collapsed]:border-r-0"
        >
          <SidebarHeader>
            <SidebarMenu className="items-center">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  className="justify-center md:size-8 md:p-0"
                  tooltip={{ children: "Kamino", hidden: false }}
                  render={<Link to="/" />}
                >
                  <img src="/kamino.svg" alt="Kamino" className="size-5!" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu className="items-center">
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          tooltip={{ children: item.title, hidden: false }}
                          isActive={isActivePath(pathname, item.url)}
                          className="size-8 justify-center p-2"
                          render={<Link to={item.url} />}
                        >
                          <Icon />
                          <span className="sr-only">{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <NavUser user={user} />
          </SidebarFooter>
        </Sidebar>

        {/* Inventory panel */}
        <Sidebar collapsible="none" className="flex flex-1">
          <InventoryTreeProvider>
            <SidebarHeader className="px-1 py-0">
              <SidebarGroup className="mb-1 rounded-b-3xl border-b shadow">
                <InventoryTreeHeader />
              </SidebarGroup>
            </SidebarHeader>
            <SidebarContent>
              <InventoryTreeBody />
            </SidebarContent>
          </InventoryTreeProvider>
        </Sidebar>
      </div>
    </Sidebar>
  )
}
