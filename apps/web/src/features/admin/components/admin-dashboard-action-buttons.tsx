import {
  IconDeviceDesktopPlus,
  IconNetwork,
  IconUserPlus,
  IconUsersPlus,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

export function AdminDashboardActionButtons() {
  return (
    <Card className="h-full">
      <CardContent className="grid h-full grid-cols-2 grid-rows-2 gap-2 [&_button]:h-full [&_button]:min-h-14">
        <Button variant="outline">
          <IconUserPlus data-icon="inline-start" />
          Create Users
        </Button>
        <Button variant="outline">
          <IconUsersPlus data-icon="inline-start" />
          Create Groups
        </Button>
        <Button variant="outline">
          <IconNetwork data-icon="inline-start" />
          Create VNets
        </Button>
        <Button variant="outline">
          <IconDeviceDesktopPlus data-icon="inline-start" />
          Clone VM
        </Button>
      </CardContent>
    </Card>
  )
}
