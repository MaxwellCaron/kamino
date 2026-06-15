import { Link } from "@tanstack/react-router"
import { IconCubeOff, IconCubePlus, IconCubeSend } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export function PublishedPodsEmptyState() {
  return (
    <div className="px-6">
      <Empty className="min-h-[55vh] border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconCubeOff />
          </EmptyMedia>
          <EmptyTitle>No published pods yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t published any pods yet. Get started by creating and
            publishing your first pod.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Link
            to="/pods/create"
            className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
          >
            <IconCubePlus data-icon="inline-start" />
            Create
          </Link>
          <Link
            to="/pods/publish"
            className={`${buttonVariants()} cursor-pointer`}
          >
            <IconCubeSend data-icon="inline-start" />
            Publish
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
