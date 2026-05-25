import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import {
  IconHome,
  IconLayoutDashboard,
  IconListDetails,
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
    description: "Browse and launch published pods.",
    url: "/pods/browse",
    icon: IconPackages,
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
    title: "Published Pods",
    description:
      "Manager-facing catalog for reviewing pod visibility, access, and edit state.",
    url: "/pods/published",
    icon: IconListDetails,
    group: "manager",
    visibility: "requests",
  },
  {
    title: "Publish Pod",
    description:
      "Configure and publish a new pod for users to clone and interact with.",
    url: "/pods/publish",
    icon: IconPackageExport,
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
type NavGroup = {
  key: NavGroupKey
  items: Array<NavItem>
}

const navGroupStyles = {
  pods: {
    rail: "bg-blue-600/5 text-blue-600 dark:bg-blue-400/5 dark:text-blue-400",
    button:
      "text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 hover:text-blue-700 active:bg-blue-600/14 active:text-blue-700 data-active:bg-blue-600/14 data-active:text-blue-700 dark:hover:bg-blue-400/10 dark:hover:text-blue-300 dark:active:bg-blue-400/14 dark:active:text-blue-300 dark:data-active:bg-blue-400/14 dark:data-active:text-blue-300",
    indicator: "bg-blue-600 dark:bg-blue-400",
  },
  home: {
    rail: "bg-muted/5 text-muted-foreground",
    button:
      "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground data-active:bg-muted data-active:text-foreground",
    indicator: "bg-foreground",
  },
  manager: {
    rail: "bg-yellow-600/5 text-yellow-600 dark:bg-yellow-400/5 dark:text-yellow-400",
    button:
      "text-yellow-600 hover:bg-yellow-600/10 hover:text-yellow-700 active:bg-yellow-600/14 active:text-yellow-700 data-active:bg-yellow-600/14 data-active:text-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-400/10 dark:hover:text-yellow-300 dark:active:bg-yellow-400/14 dark:active:text-yellow-300 dark:data-active:bg-yellow-400/14 dark:data-active:text-yellow-300",
    indicator: "bg-yellow-600 dark:bg-yellow-400",
  },
  admin: {
    rail: "bg-green-600/5 text-green-600 dark:bg-green-400/5 dark:text-green-400",
    button:
      "text-green-600 hover:bg-green-600/10 hover:text-green-700 active:bg-green-600/14 active:text-green-700 data-active:bg-green-600/14 data-active:text-green-700 dark:text-green-400 dark:hover:bg-green-400/10 dark:hover:text-green-300 dark:active:bg-green-400/14 dark:active:text-green-300 dark:data-active:bg-green-400/14 dark:data-active:text-green-300",
    indicator: "bg-green-600 dark:bg-green-400",
  },
} as const satisfies Record<
  NavGroupKey,
  {
    rail: string
    button: string
    indicator: string
  }
>

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
  if (url === "/pods/browse") {
    return pathname === url || pathname.startsWith("/pods/")
  }

  return pathname === url
}

function useVisibleNavGroups(user: AuthUser): Array<NavGroup> {
  const canReviewRequests = canAccessRequestQueue(user.management_permissions)
  const canAdminister = canAccessAdmin(user.management_permissions)

  return React.useMemo(() => {
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
  const styles = navGroupStyles[item.group]

  return (
    <SidebarMenuItem key={item.title} className="overflow-visible">
      <IconRailHoverCard title={item.title} description={item.description}>
        <SidebarMenuButton
          isActive={isActive}
          className={cn(
            "cursor-default justify-center transition-[background-color,color,transform] duration-200 active:scale-[0.96]",
            styles.button
          )}
          render={<Link to={item.url} />}
        >
          <Icon className="size-5!" />
          <span className="sr-only">{item.title}</span>
        </SidebarMenuButton>
      </IconRailHoverCard>
      {isActive && (
        <span
          className={cn(
            "absolute top-1/2 -left-4 h-7 w-1 -translate-y-1/2 rounded-r-full",
            styles.indicator
          )}
        />
      )}
    </SidebarMenuItem>
  )
}

function AppSidebarIconRailContent({ user }: { user: AuthUser }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navGroups = useVisibleNavGroups(user)

  return (
    <>
      <SidebarHeader>
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <IconRailHoverCard
              title="Kamino"
              description="Return to the main workspace and infrastructure overview."
            >
              <SidebarMenuButton
                size="lg"
                className="cursor-default justify-center md:size-9! md:p-0"
                render={<Link to="/" />}
              >
                <img src="/kamino.svg" alt="Kamino" className="size-6!" />
              </SidebarMenuButton>
            </IconRailHoverCard>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="overflow-visible group-data-[collapsible=icon]:overflow-visible!">
        <SidebarGroup className="overflow-visible">
          <SidebarGroupContent className="overflow-visible">
            <SidebarMenu className="flex flex-col items-center gap-2 overflow-visible">
              {navGroups.map((group, index) => (
                <React.Fragment key={group.key}>
                  {index > 0 && <Separator className="my-2" />}
                  <div
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-full p-1 py-2",
                      navGroupStyles[group.key].rail
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
    </>
  )
}

export function AppSidebarIconRail({
  user,
  className,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
}) {
  return (
    <Sidebar
      collapsible="icon"
      className={cn("overflow-hidden", className)}
      {...props}
    >
      <AppSidebarIconRailContent user={user} />
    </Sidebar>
  )
}

export function AppSidebar({
  user,
  className,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AuthUser
}) {
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
          className="group w-[calc(var(--sidebar-width-icon)+2px)]! bg-transparent"
          data-state="collapsed"
          data-collapsible="icon"
        >
          <AppSidebarIconRailContent user={user} />
        </Sidebar>

        {/* Inventory panel */}
        <Sidebar
          collapsible="none"
          className="ml-3 flex flex-1 border-l group-data-[state=collapsed]:border-l-0"
        >
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
