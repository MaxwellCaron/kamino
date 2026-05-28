import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  IconChevronDown,
  IconDeviceDesktop,
  IconFolderOpen,
  IconNetwork,
  IconPackage,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { getReviewVmNames } from "./create-pod-form"
import type { CreatePodFormApi } from "./create-pod-form"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"

const treePreviewRowClass =
  "bg-transparent flex min-h-8 items-center gap-1 rounded-3xl bg-sidebar px-2 py-1.5 text-sm transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0"

type CreatePodReviewSectionProps = {
  form: CreatePodFormApi
}

type ReviewTreePreviewProps = {
  podName: string
  vmNames: Array<string>
}

function ReviewTreePreview({ podName, vmNames }: ReviewTreePreviewProps) {
  return (
    <div>
      <div className="flex flex-col gap-0.5">
        <div className={treePreviewRowClass}>
          <IconChevronDown className="size-4 text-muted-foreground" />
          <IconFolderOpen className="fill-size-4 size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
          <span className="ml-1 flex-1 truncate">{podName || "New pod"}</span>
        </div>

        {vmNames.map((vmName) => (
          <div
            key={vmName}
            className={cn(
              treePreviewRowClass,
              "bg-transparent ps-12 text-muted-foreground"
            )}
          >
            <VmIcon status="running" />
            <span className="ml-1 flex-1 truncate text-foreground">
              {vmName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CreatePodReviewSection({ form }: CreatePodReviewSectionProps) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const vmNames = getReviewVmNames(values)

        return (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-muted/50">
              <CardContent className="flex flex-1">
                <ItemGroup className="flex-1">
                  <Item variant="muted" className="flex-1">
                    <ItemMedia
                      variant="icon"
                      className="translate-y-0! self-center!"
                    >
                      <IconPackage />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Pod Name</ItemTitle>
                      <ItemDescription>
                        {values.name || "New pod"}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  <Item variant="muted" className="flex-1">
                    <ItemMedia
                      variant="icon"
                      className="translate-y-0! self-center!"
                    >
                      <IconNetwork />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Automated Networking</ItemTitle>
                      <ItemDescription>
                        {values.includeRouter ? "Yes" : "No"}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  <Item variant="muted" className="flex-1">
                    <ItemMedia
                      variant="icon"
                      className="translate-y-0! self-center!"
                    >
                      <IconDeviceDesktop />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Virtual Machines</ItemTitle>
                      <ItemDescription>{vmNames.length}</ItemDescription>
                    </ItemContent>
                  </Item>
                </ItemGroup>
              </CardContent>
            </Card>
            <Card className="w-full bg-muted/50">
              <CardHeader>
                <CardTitle>Tree Preview</CardTitle>
                <CardDescription>
                  A visual representation of your pod&apos;s tree structure.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReviewTreePreview podName={values.name} vmNames={vmNames} />
              </CardContent>
            </Card>
          </div>
        )
      }}
    </form.Subscribe>
  )
}
