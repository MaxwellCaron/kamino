import { IconSettings } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { cn } from "@workspace/ui/lib/utils"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { GrainientBackground } from "@/components/grainient-background"

export function DashboardProfileCard({
  className,
  onSettingsClick,
  roleLabel,
  user,
}: {
  className?: string
  onSettingsClick: () => void
  roleLabel: string
  user: AuthUser
}) {
  return (
    <Card className={cn("h-full overflow-hidden rounded-4xl pt-0", className)}>
      <div className="relative h-28 w-full overflow-hidden">
        <GrainientBackground />
      </div>

      <CardHeader className="relative mx-auto -mt-18.5 flex w-full justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-end gap-4">
          <FacehashIcon name={user.username} size={80} />
          <div className="min-w-0 pb-2">
            <CardTitle className="truncate text-2xl tracking-tight">
              {user.username}
            </CardTitle>
            <CardDescription>{roleLabel}</CardDescription>
          </div>
        </div>
        <CardAction className="shrink-0 self-end pb-2">
          <Button type="button" onClick={onSettingsClick}>
            <IconSettings data-icon="inline-start" />
            Settings
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
