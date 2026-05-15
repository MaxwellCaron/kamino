import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { ClonedPodTasks } from "./cloned-pod-tasks"
import { ClonedPodHeader } from "./cloned-pod-header"
import type { ClonedPod } from "@/features/pods/types/pod-types"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"

export function ClonedPodPage({ pod }: { pod: ClonedPod }) {
  return (
    <>
      <div className="@container/main flex flex-1 flex-col">
        <ClonedPodHeader pod={pod} />

        <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
          <div className="mt-8">
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Virtual Machines
            </h3>
            <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pod.vms.map((vm) => (
                <Item
                  key={vm.id}
                  className="bg-background/50"
                  variant="outline"
                >
                  <ItemMedia variant="icon">
                    <VmIcon status={vm.status} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="text-sm font-medium">
                      {vm.name}
                    </ItemTitle>
                    <ItemDescription className="text-xs tracking-tight uppercase">
                      {vm.status}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </div>

          <ClonedPodTasks tasks={pod.tasks?.items ?? []} />
        </div>
      </div>
    </>
  )
}
