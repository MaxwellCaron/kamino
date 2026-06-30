import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import type { DashboardStat } from "../utils/dashboard-types"
import { animateChild, animateContainer } from "@/components/animate"

export function DashboardStatsGrid({
  className,
  stats,
}: {
  className?: string
  stats: Array<DashboardStat>
}) {
  return (
    <m.div
      className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}
      initial="hidden"
      animate="show"
      variants={animateContainer}
    >
      {stats.map((stat) => {
        return (
          <m.div key={stat.label} variants={animateChild}>
            <Card key={stat.label} className="min-h-36">
              <CardHeader className="pb-2">
                <HugeiconsIcon
                  icon={stat.icon}
                  className="text-muted-foreground"
                />
                <CardDescription className="mt-4">{stat.label}</CardDescription>
                <CardTitle className="text-4xl font-extrabold tracking-tight text-balance">
                  {stat.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </m.div>
        )
      })}
    </m.div>
  )
}
