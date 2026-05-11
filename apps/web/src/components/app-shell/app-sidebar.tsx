import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import {
  IconHome,
  IconLayoutDashboard,
  IconNetwork,
  IconPackageExport,
  IconPackages,
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
    group: "home",
    visibility: "all",
  },
  {
    title: "Pods",
    description: "Browse available and ready to clone pods.",
    url: "/pods/browse",
    icon: IconPackages,
    group: "pods",
    visibility: "all",
  },
  {
    title: "My Pods",
    description: "Browse your already cloned pods.",
    url: "/",
    icon: IconPackageExport,
    group: "pods",
    visibility: "all",
  },
  {
    title: "Requests",
    description:
      "Review pending and completed user requests for VM power changes or snapshots.",
    url: "/manager/requests",
    icon: IconReceipt,
    group: "manager",
    visibility: "requests",
  },
  {
    title: "Admin",
    description:
      "Review cluster health, principal activity, request flow, and capacity.",
    url: "/admin",
    icon: IconLayoutDashboard,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "SDN",
    description: "Inspect networks, topology, and software-defined resources.",
    url: "/admin/sdn",
    icon: IconNetwork,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Users",
    description: "Browse people, identities, and account-level access details.",
    url: "/admin/principals/users",
    icon: IconUser,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Groups",
    description: "Manage shared access, memberships, and management roles.",
    url: "/admin/principals/groups",
    icon: IconUsersGroup,
    group: "admin",
    visibility: "admin",
  },
] as const

type NavItem = (typeof navItems)[number]
type NavGroupKey = NavItem["group"]

const navGroupStyles = {
  pods: "bg-blue-600/5 dark:bg-blue-400/5 text-blue-600 dark:text-blue-400",
  home: "bg-muted/5 text-muted-foreground",
  manager: "bg-chart-1/5 text-chart-1",
  admin: "bg-primary/5 text-primary",
} as const satisfies Record<NavGroupKey, string>

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
  return pathname === url
}

function IconRailNavItem({
  item,
  pathname,
}: {
  item: NavItem
  pathname: string
}) {
  const Icon = item.icon
  const isActive = isActivePath(pathname, item.url)

  return (
    <SidebarMenuItem key={item.title} className="overflow-visible">
      <IconRailHoverCard title={item.title} description={item.description}>
        <SidebarMenuButton
          isActive={isActive}
          className="size-9 cursor-default justify-center"
          render={<Link to={item.url} />}
        >
          <Icon className="size-5!" />
          <span className="sr-only">{item.title}</span>
        </SidebarMenuButton>
      </IconRailHoverCard>
      {isActive && (
        <span className="absolute top-1/2 -left-4 h-7 w-1 -translate-y-1/2 rounded-r-full bg-foreground" />
      )}
    </SidebarMenuItem>
  )
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
  const navGroups = React.useMemo(() => {
    const visible = navItems.filter((item) => {
      if (item.visibility === "admin") {
        return canAdminister
      }
      if (item.visibility === "requests") {
        return canReviewRequests
      }
      return true
    })

    return [
      {
        key: "home" as const,
        items: visible.filter((item) => item.group === "home"),
      },
      {
        key: "pods" as const,
        items: visible.filter((item) => item.group === "pods"),
      },
      {
        key: "manager" as const,
        items: visible.filter((item) => item.group === "manager"),
      },
      {
        key: "admin" as const,
        items: visible.filter((item) => item.group === "admin"),
      },
    ].filter((group) => group.items.length > 0)
  }, [canAdminister, canReviewRequests])

  return (
    navGroups.length > 0 && (
      <Sidebar
        collapsible="icon"
        className={cn("overflow-hidden", className)}
        {...props}
      >
        <div className="flex h-full w-full flex-row">
          {/* Icon rail */}
          <Sidebar
            collapsible="none"
            className="w-[calc(var(--sidebar-width-icon)+12px)]! border-r pr-1.5 group-data-[state=collapsed]:border-r-0"
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
                      className="cursor-default justify-center md:size-9 md:p-0"
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
                    {navGroups.map((group, index) => (
                      <React.Fragment key={group.key}>
                        {index > 0 && <Separator className="my-2" />}
                        <div
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-2xl p-1",
                            navGroupStyles[group.key]
                          )}
                        >
                          {group.items.map((item) => (
                            <IconRailNavItem
                              key={item.title}
                              item={item}
                              pathname={pathname}
                            />
                          ))}
                        </div>
                      </React.Fragment>
                    ))}
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
  )
}
