import { Link, createFileRoute } from "@tanstack/react-router"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  IconArrowUpRight,
  IconCalendarWeekFilled,
  IconDeviceDesktop,
  IconSettings,
} from "@tabler/icons-react"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import type { ComponentType } from "react"
import { GrainientBackground } from "@/components/grainient-background"

const TABS = ["Overview", "Activity", "Pods"]
const STATS = [
  { label: "Groups", value: "4" },
  { label: "Folders", value: "5" },
  { label: "Pods", value: "3" },
  { label: "Virtual Machines", value: "22" },
]

const FAVORITES = [
  {
    id: "",
    name: "pocket",
    status: "running",
  },
  {
    id: "",
    name: "debian-13",
    status: "stopped",
  },
  {
    id: "",
    name: "kali",
    status: "stopped",
  },
]

const ACTIVITY = [
  { what: "Started", target: "viscous", time: "2h" },
  { what: "Created", target: "Valheim", time: "1d" },
  { what: "Shutdown", target: "mirage", time: "3d" },
  { what: "Templatized", target: "Server-2025", time: "1w" },
]

export const Route = createFileRoute("/_dashboard/")({
  component: ProfileHeroShowcasePage,
})

function ProfileHeroShowcasePage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="min-h-[90vh] rounded-4xl bg-card">
          {/* Cover banner */}
          <div className="relative h-48 w-full overflow-hidden rounded-t-4xl">
            <GrainientBackground />
          </div>

          <div className="relative mx-auto max-w-5xl">
            <div className="-mt-12 flex items-end justify-between">
              <div className="flex items-end gap-4">
                <FacehashIcon name="mcaron" size={80} />
                <div className="pb-2">
                  <h1 className="font-heading text-2xl tracking-tight">
                    mcaron
                  </h1>
                  <div className="text-sm text-muted-foreground">
                    @mcaron · User
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Button type="button">
                  <IconSettings data-icon="inline-start" />
                  Settings
                </Button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <Meta Icon={IconCalendarWeekFilled}>Joined Apr 2021</Meta>
              </div>
            </div>

            <Tabs defaultValue="Overview" className="mt-5 w-full">
              <div className="flex items-center justify-between border-b border-border/60">
                <TabsList variant="line">
                  {TABS.map((t) => (
                    <TabsTrigger key={t} value={t}>
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {STATS.map((s) => (
                    <span key={s.label}>
                      <span className="font-mono text-foreground">
                        {s.value}
                      </span>{" "}
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>

              <TabsContent value="Overview" className="mt-6">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
                  <section>
                    <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                      Favorites
                    </div>
                    <div className="mt-3 space-y-4">
                      {FAVORITES.map((f) => (
                        <Item
                          key={f.name}
                          variant="muted"
                          size="sm"
                          className="cursor-default"
                          render={
                            <Link to="/">
                              <ItemMedia>
                                <IconDeviceDesktop className="size-5" />
                              </ItemMedia>
                              <ItemContent>
                                <ItemTitle>{f.name}</ItemTitle>
                                <ItemDescription>
                                  Virtual Machine
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions>
                                <IconArrowUpRight className="size-4" />
                              </ItemActions>
                            </Link>
                          }
                        />
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                      Recent activity
                    </div>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {ACTIVITY.map((a, i) => (
                        <li
                          key={i}
                          className="flex items-baseline gap-2 text-sm text-foreground/85"
                        >
                          <span className="size-1.5 rounded-full bg-foreground/40" />
                          <span className="text-muted-foreground">
                            {a.what}
                          </span>
                          <Badge
                            render={
                              <Link to="/">
                                <IconDeviceDesktop data-icon="inline-start" />
                                {a.target}{" "}
                                <IconArrowUpRight data-icon="inline-end" />
                              </Link>
                            }
                          />
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">
                            {a.time}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </TabsContent>
              <TabsContent value="Activity" className="mt-6">
                Activity content here.
              </TabsContent>
              <TabsContent value="Projects" className="mt-6">
                Projects content here.
              </TabsContent>
              <TabsContent value="Posts" className="mt-6">
                Posts content here.
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({
  Icon,
  children,
}: {
  Icon: ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}
