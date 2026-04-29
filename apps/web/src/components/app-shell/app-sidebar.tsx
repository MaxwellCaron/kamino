import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import {
  IconHome,
  IconLayoutDashboard,
  IconNetwork,
  IconReceipt,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
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
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { NavUser } from "./nav-user"
import type { AuthUser } from "@/features/auth/types/auth-types"
import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/features/auth/utils/management-permissions"
import {
  InventoryTreeBody,
  InventoryTreeHeader,
} from "@/features/inventory/components/tree/inventory-tree"

const navItems = [
  {
    title: "Home",
    description: "Overview of infrastructure, activity, and recent changes.",
    url: "/",
    icon: IconHome,
    visibility: "all",
  },
  {
    title: "Requests",
    description:
      "Review pending and completed user requests for VM power changes or snapshots.",
    url: "/manager/requests",
    icon: IconReceipt,
    visibility: "requests",
  },
  {
    title: "Admin",
    description:
      "Review cluster health, principal activity, request flow, and capacity.",
    url: "/admin",
    icon: IconLayoutDashboard,
    visibility: "admin",
  },
  {
    title: "SDN",
    description: "Inspect networks, topology, and software-defined resources.",
    url: "/admin/sdn",
    icon: IconNetwork,
    visibility: "admin",
  },
  {
    title: "Users",
    description: "Browse people, identities, and account-level access details.",
    url: "/admin/principals/users",
    icon: IconUser,
    visibility: "admin",
  },
  {
    title: "Groups",
    description: "Manage shared access, memberships, and management roles.",
    url: "/admin/principals/groups",
    icon: IconUsersGroup,
    visibility: "admin",
  },
] as const

function IconRailHoverCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactElement
}) {
  return (
    <HoverCard>
      <HoverCardTrigger render={children} delay={50} closeDelay={150} />
      <HoverCardContent
        side="right"
        align="center"
        sideOffset={14}
        className="w-64"
      >
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

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
  const canReviewRequests = canAccessRequestQueue(user.management_permissions)
  const canAdminister = canAccessAdmin(user.management_permissions)
  const visibleNavItems = React.useMemo(
    () =>
      navItems.filter((item) => {
        if (item.visibility === "admin") {
          return canAdminister
        }
        if (item.visibility === "requests") {
          return canReviewRequests
        }
        return true
      }),
    [canAdminister, canReviewRequests]
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
                <IconRailHoverCard
                  title="Kamino"
                  description="Return to the main workspace and infrastructure overview."
                >
                  <SidebarMenuButton
                    size="lg"
                    className="justify-center md:size-9 md:p-0"
                    render={<Link to="/" />}
                  >
                    <img src="/kamino.svg" alt="Kamino" className="size-6!" />
                  </SidebarMenuButton>
                </IconRailHoverCard>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="overflow-visible">
            <SidebarGroup className="overflow-visible">
              <SidebarGroupContent className="overflow-visible">
                <SidebarMenu className="flex flex-col items-center gap-2 overflow-visible">
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon
                    const isActive = isActivePath(pathname, item.url)
                    return (
                      <SidebarMenuItem
                        key={item.title}
                        className="overflow-visible"
                      >
                        <IconRailHoverCard
                          title={item.title}
                          description={item.description}
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            className="size-9 justify-center"
                            render={<Link to={item.url} />}
                          >
                            <Icon className="size-5!" />
                            <span className="sr-only">{item.title}</span>
                          </SidebarMenuButton>
                        </IconRailHoverCard>
                        {isActive && (
                          <span className="absolute top-1/2 -left-2.75 h-5 w-1 -translate-y-1/2 rounded-r-full bg-foreground" />
                        )}
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
          <SidebarHeader className="py-0">
            <SidebarGroup>
              <InventoryTreeHeader />
            </SidebarGroup>
            <Separator className="-mt-2" />
          </SidebarHeader>
          <SidebarContent className="px-2">
            <InventoryTreeBody />
          </SidebarContent>
        </Sidebar>
      </div>
    </Sidebar>
  )
}
