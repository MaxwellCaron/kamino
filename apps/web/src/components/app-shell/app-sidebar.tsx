import * as React from "react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Link, useRouterState } from "@tanstack/react-router"
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
import { isActivePath, navGroupStyles } from "@/lib/app-shell/sidebar"
import type { AuthUser } from "@/lib/auth/auth-types"
import { HugeiconsIcon } from "@hugeicons/react"
import { Image } from "@unpic/react"
import { InventoryTreeBody } from "@/components/inventory/tree/inventory-tree-body"
import { InventoryTreeHeader } from "@/components/inventory/tree/inventory-tree-header"
import type { NavItem } from "@/lib/app-shell/sidebar"
import { NavUser } from "./nav-user"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import { useVisibleNavGroups } from "@/hooks/app-shell/use-visible-nav-groups"

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
          render={<Link to={item.url} aria-label={item.title} />}
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

export function AppSidebarIconRailContent({ user }: { user: AuthUser }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navGroups = useVisibleNavGroups(user)

  return (
    <>
      <SidebarHeader className="shrink-0">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <IconRailHoverCard
              title="Kamino"
              description="Return to the main workspace and infrastructure overview."
            >
              <SidebarMenuButton
                size="lg"
                className="cursor-pointer justify-center md:size-9! md:p-0"
                render={<Link to="/" aria-label="Kamino home" />}
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
      <SidebarContent className="overflow-x-hidden overscroll-y-contain group-data-[collapsible=icon]:overflow-y-auto!">
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
      <SidebarFooter className="shrink-0">
        <NavUser user={user} />
      </SidebarFooter>
    </>
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
        <Sidebar
          collapsible="none"
          className="group w-[calc(var(--sidebar-width-icon)+2px)]! bg-transparent"
          data-state="collapsed"
          data-collapsible="icon"
        >
          <AppSidebarIconRailContent user={user} />
        </Sidebar>

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
              className="min-h-0 flex-1 overflow-y-auto px-3 [overflow-anchor:none]"
            >
              <InventoryTreeBody />
            </div>
          </SidebarContent>
        </Sidebar>
      </div>
    </Sidebar>
  )
}
