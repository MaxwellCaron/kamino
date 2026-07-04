import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  Globe02Icon,
  Home03Icon,
  Invoice01Icon,
  NotebookIcon,
  PackageAddIcon,
  PackageCheck,
  PackageIcon,
  PackageMovingIcon,
  ReloadIcon,
  Shield01Icon,
  SparklesIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
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
import { Image } from "@unpic/react"
import { NavUser } from "./nav-user"
import type { AuthUser } from "@/features/auth/types/auth-types"
import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/features/auth/utils/management-permissions"
import { InventoryTreeBody } from "@/features/inventory/components/tree/inventory-tree-body"
import { InventoryTreeHeader } from "@/features/inventory/components/tree/inventory-tree-header"

const navItems = [
  {
    title: "Home",
    description: "Overview of infrastructure, activity, and recent changes.",
    url: "/",
    icon: Home03Icon,
    group: "home",
    visibility: "all",
  },
  {
    title: "Pods",
    description: "Browse and launch published pods.",
    url: "/pods",
    icon: PackageIcon,
    group: "home",
    visibility: "all",
  },
  {
    title: "Changelog",
    description: "View the changelog for the latest updates.",
    url: "/changelog",
    icon: SparklesIcon,
    group: "home",
    visibility: "all",
  },
  {
    title: "User Guide",
    description: "Learn how to browse, clone, and operate pods.",
    url: "/docs",
    icon: NotebookIcon,
    group: "home",
    visibility: "all",
  },
  {
    title: "Create Pod",
    description:
      "Initialize a foundation for your pod by using virutal machine templates and more.",
    url: "/pods/create",
    icon: PackageAddIcon,
    group: "manager",
    visibility: "manager",
  },
  {
    title: "Publish Pod",
    description:
      "Configure and publish a new pod for users to clone and interact with.",
    url: "/pods/publish",
    icon: PackageCheck,
    group: "manager",
    visibility: "manager",
  },
  {
    title: "Published Pods",
    description:
      "Manager-facing catalog for reviewing pod visibility, access, and edit state.",
    url: "/pods/published",
    icon: PackageMovingIcon,
    group: "manager",
    visibility: "manager",
  },
  {
    title: "Requests",
    description: "Review pending and completed user requests.",
    url: "/manager/requests",
    icon: Invoice01Icon,
    group: "manager",
    visibility: "manager",
  },
  {
    title: "Manager Guide",
    description:
      "Learn how to publish pods, manage clones, and review requests.",
    url: "/manager/docs",
    icon: NotebookIcon,
    group: "manager",
    visibility: "manager",
  },
  {
    title: "Admin",
    description:
      "Review cluster health, principal activity, request flow, and capacity.",
    url: "/admin",
    icon: DashboardSquare01Icon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "SDN",
    description: "Inspect networks, topology, and software-defined resources.",
    url: "/admin/sdn",
    icon: Globe02Icon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Users",
    description: "Browse people, identities, and account-level access details.",
    url: "/admin/principals/users",
    icon: UserIcon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Groups",
    description: "Manage shared access, memberships, and management roles.",
    url: "/admin/principals/groups",
    icon: UserGroupIcon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Proxmox Sync",
    description: "Reconcile inventory drift against Proxmox.",
    url: "/admin/proxmox-sync",
    icon: ReloadIcon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Audit Logs",
    description: "Review direct VM and pod action history.",
    url: "/admin/audit",
    icon: Shield01Icon,
    group: "admin",
    visibility: "admin",
  },
  {
    title: "Admin Guide",
    description:
      "Learn how to manage principals, roles, permissions, sync, and audit.",
    url: "/admin/docs",
    icon: NotebookIcon,
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
  home: {
    rail: "",
    button:
      "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground data-active:bg-muted data-active:text-foreground",
    indicator: "bg-foreground",
  },
  manager: {
    rail: "bg-amber-600/5 text-amber-600 dark:bg-amber-400/5 dark:text-amber-400",
    button:
      "text-amber-600 hover:bg-amber-600/10 hover:text-amber-700 active:bg-amber-600/14 active:text-amber-700 data-active:bg-amber-600/14 data-active:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-400/10 dark:hover:text-amber-300 dark:active:bg-amber-400/14 dark:active:text-amber-300 dark:data-active:bg-amber-400/14 dark:data-active:text-amber-300",
    indicator: "bg-amber-600 dark:bg-amber-400",
  },
  admin: {
    rail: "bg-emerald-600/5 text-emerald-600 dark:bg-emerald-400/5 dark:text-emerald-400",
    button:
      "text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-700 active:bg-emerald-600/14 active:text-emerald-700 data-active:bg-emerald-600/14 data-active:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300 dark:active:bg-emerald-400/14 dark:active:text-emerald-300 dark:data-active:bg-emerald-400/14 dark:data-active:text-emerald-300",
    indicator: "bg-emerald-600 dark:bg-emerald-400",
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
        sideOffset={15}
        className="w-sm"
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

function useVisibleNavGroups(user: AuthUser): Array<NavGroup> {
  const canManage = canAccessRequestQueue(user.management_permissions)
  const canAdminister = canAccessAdmin(user.management_permissions)

  return React.useMemo(() => {
    const visible = navItems.filter((item) => {
      if (item.visibility === "admin") {
        return canAdminister
      }
      if (item.visibility === "manager") {
        return canManage
      }
      return true
    })

    return [
      {
        key: "home" as const,
        items: visible.filter((item) => item.group === "home"),
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
  }, [canAdminister, canManage])
}

function IconRailNavItem({
  item,
  pathname,
}: {
  item: NavItem
  pathname: string
}) {
  const isActive = isActivePath(pathname, item.url)
  const styles = navGroupStyles[item.group]

  return (
    <SidebarMenuItem key={item.title} className="overflow-visible">
      <IconRailHoverCard title={item.title} description={item.description}>
        <SidebarMenuButton
          isActive={isActive}
          className={cn(
            "cursor-pointer justify-center transition-[background-color,color,transform] duration-200 active:scale-[0.96]",
            styles.button
          )}
          render={<Link to={item.url} />}
        >
          <HugeiconsIcon icon={item.icon} className="size-5!" />
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
                className="cursor-pointer justify-center md:size-9! md:p-0"
                render={<Link to="/" />}
              >
                <Image
                  src="/kamino.svg"
                  height={64}
                  width={64}
                  loading="eager"
                  alt="Kamino"
                />
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
          className="ml-2 flex min-w-0 flex-1 rounded-2xl border-l group-data-[state=collapsed]:border-l-0"
        >
          <SidebarHeader>
            <InventoryTreeHeader />
          </SidebarHeader>
          <SidebarContent className="overflow-hidden">
            <div
              data-slot="tree-scroll-container"
              className="min-h-0 flex-1 overflow-y-auto px-3"
            >
              <InventoryTreeBody />
            </div>
          </SidebarContent>
        </Sidebar>
      </div>
    </Sidebar>
  )
}
