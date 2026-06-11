import * as React from "react"
import {
  IconDeviceDesktopPlus,
  IconNetwork,
  IconUserPlus,
  IconUsersPlus,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { GroupDialog } from "@/features/principals/components/groups/group-dialog"
import { UserDialog } from "@/features/principals/components/users/user-dialog"
import { VNetDialog } from "@/features/sdn/components/vnet-dialog"

export function AdminDashboardActionButtons() {
  const [userDialogOpen, setUserDialogOpen] = React.useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = React.useState(false)
  const [vnetDialogOpen, setVnetDialogOpen] = React.useState(false)

  return (
    <>
      <Card className="h-full">
        <CardContent className="grid h-full grid-cols-2 grid-rows-2 gap-2 [&_button]:h-full [&_button]:min-h-14">
          <Button variant="outline" onClick={() => setUserDialogOpen(true)}>
            <IconUserPlus data-icon="inline-start" />
            Create Users
          </Button>
          <Button variant="outline" onClick={() => setGroupDialogOpen(true)}>
            <IconUsersPlus data-icon="inline-start" />
            Create Groups
          </Button>
          <Button variant="outline" onClick={() => setVnetDialogOpen(true)}>
            <IconNetwork data-icon="inline-start" />
            Create VNets
          </Button>
          <Button variant="outline" disabled>
            <IconDeviceDesktopPlus data-icon="inline-start" />
            Clone VM
          </Button>
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
