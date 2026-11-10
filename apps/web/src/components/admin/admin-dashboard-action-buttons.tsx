import * as React from "react"
import {
  AddTeam02Icon,
  Globe02Icon,
  PackageAddIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { GroupDialog } from "@/components/principals/groups/group-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { UserDialog } from "@/components/principals/users/user-dialog"
import { VNetDialog } from "@/components/sdn/vnet-dialog"

export function AdminDashboardActionButtons() {
  const [userDialogOpen, setUserDialogOpen] = React.useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = React.useState(false)
  const [vnetDialogOpen, setVnetDialogOpen] = React.useState(false)

  return (
    <>
      <Card className="h-full">
        <CardContent className="grid h-full grid-cols-2 grid-rows-2 gap-2 [&_button]:h-full [&_button]:min-h-14">
          <Button variant="outline" onClick={() => setUserDialogOpen(true)}>
            <HugeiconsIcon
              icon={UserAdd01Icon}
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            Create Users
          </Button>
          <Button variant="outline" onClick={() => setGroupDialogOpen(true)}>
            <HugeiconsIcon
              icon={AddTeam02Icon}
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            Create Groups
          </Button>
          <Button variant="outline" onClick={() => setVnetDialogOpen(true)}>
            <HugeiconsIcon
              icon={Globe02Icon}
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            Create VNets
          </Button>
          <Link
            to="/pods/create"
            className={`${buttonVariants({ variant: "outline" })} h-full min-h-14`}
          >
            <HugeiconsIcon
              icon={PackageAddIcon}
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            Create Pod
          </Link>
        </CardContent>
      </Card>

      <UserDialog
        key={userDialogOpen ? "user-open" : "user-closed"}
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
      />
      <GroupDialog
        key={groupDialogOpen ? "group-open" : "group-closed"}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
      />
      <VNetDialog open={vnetDialogOpen} onOpenChange={setVnetDialogOpen} />
    </>
  )
}
