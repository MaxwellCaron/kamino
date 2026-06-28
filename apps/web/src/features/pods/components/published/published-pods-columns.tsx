import { Image } from "@unpic/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronRightIcon,
  CopyIcon,
  Delete01Icon,
  ExternalLinkIcon,
  GlobeIcon,
  LockedIcon,
  MoreVerticalIcon,
  PencilEdit01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"
import { Link } from "@tanstack/react-router"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { PublishedPodStatusBadge } from "./published-pod-status-badge"
import type { ColumnDef } from "@tanstack/react-table"
import type {
  PodStatus,
  PublishedPodCatalogEntry,
} from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import { FormatPodCreatorsShort } from "@/features/pods/components/pod-creators"
import {
  POD_CLONE_ACTIONS,
  POD_CLONE_ACTION_CONFIG,
} from "@/features/pods/utils/pod-clone-actions"

type PublishedPodColumnsOptions = {
  onDelete: (pod: PublishedPodCatalogEntry) => void
  onEdit: (pod: PublishedPodCatalogEntry) => void
  onStatusChange: (pod: PublishedPodCatalogEntry, status: PodStatus) => void
  onCloneBulkAction: (
    pod: PublishedPodCatalogEntry,
    action: PodCloneAction
  ) => void
  cloneBulkActionPending?: boolean
  onManagerClone: (pod: PublishedPodCatalogEntry) => void
  managerClonePending?: boolean
}

export function getPublishedPodsColumns({
  onDelete,
  onEdit,
  onStatusChange,
  onCloneBulkAction,
  cloneBulkActionPending,
  onManagerClone,
  managerClonePending,
}: PublishedPodColumnsOptions): Array<ColumnDef<PublishedPodCatalogEntry>> {
  return [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => {
        const pod = row.original

        if (!row.getCanExpand()) {
          return <span className="block size-9" aria-hidden="true" />
        }

        return (
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={row.getIsExpanded()}
            aria-label={`${row.getIsExpanded() ? "Hide" : "Show"} cloned instances for ${pod.title}`}
            onClick={() => row.toggleExpanded()}
          >
            <HugeiconsIcon
              icon={ChevronRightIcon}
              data-icon="inline-start"
              className={
                row.getIsExpanded()
                  ? "rotate-90 transition-transform"
                  : "transition-transform"
              }
            />
          </Button>
        )
      },
      enableHiding: false,
      enableSorting: false,
      meta: {
        className: "w-12 pl-4 pr-0",
      },
    },
    {
      id: "pod",
      accessorFn: (pod) =>
        [
          pod.title,
          pod.slug,
          pod.description,
          pod.status,
          ...pod.creators.map((c) => c.label),
        ]
          .filter(Boolean)
          .join(" "),
      header: "Pod",
      cell: ({ row }) => {
        const pod = row.original

        return (
          <div className="flex items-center gap-4 py-1">
            <div className="overflow-hidden rounded-2xl border bg-muted">
              <Image
                src={pod.image}
                alt={pod.title}
                width={80}
                height={80}
                className="size-20 object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{pod.title}</span>
                <PublishedPodStatusBadge status={pod.status} />
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {pod.slug}
              </span>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {pod.description}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      id: "creators",
      header: "Creators",
      cell: ({ row }) => (
        <div className="min-w-48 py-1">
          {FormatPodCreatorsShort(row.original.creators)}
        </div>
      ),
    },
    {
      id: "access",
      accessorFn: (pod) =>
        pod.audience.length > 0
          ? ["Restricted", ...pod.audience.map((p) => p.label)].join(" ")
          : "Public",
      header: "Access",
      cell: ({ row }) => {
        const pod = row.original
        const isRestricted = pod.audience.length > 0

        return (
          <div className="flex min-w-32 flex-col gap-2 py-1">
            <Badge variant={isRestricted ? "outline" : "secondary"}>
              {isRestricted ? (
                <HugeiconsIcon icon={LockedIcon} data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={GlobeIcon} data-icon="inline-start" />
              )}
              {isRestricted ? "Restricted" : "Public"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {isRestricted
                ? `${pod.audience.length} principal${pod.audience.length === 1 ? "" : "s"}`
                : "Open to all users"}
            </span>
          </div>
        )
      },
    },
    {
      id: "content",
      accessorFn: (pod) =>
        [
          ...pod.virtual_machines.map((vm) => vm.name),
          ...(pod.tasks ?? []).map((t) => t.title),
        ].join(" "),
      header: "Content",
      cell: ({ row }) => {
        const pod = row.original

        return (
          <div className="flex min-w-32 flex-col gap-1 py-1 text-sm">
            <span className="font-medium tabular-nums">
              {pod.virtual_machines.length} VM
              {pod.virtual_machines.length === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {(pod.tasks ?? []).length} Task
              {(pod.tasks ?? []).length === 1 ? "" : "s"}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "clone_count",
      header: "Clones",
      cell: ({ row }) => (
        <span className="py-1 font-medium tabular-nums">
          {row.original.clone_count}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="py-1 text-sm text-muted-foreground">
          <RelativeTimeCard date={row.original.created_at} />
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const pod = row.original

        return (
          <div className="flex items-center justify-end pr-4">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Open pod options"
                  />
                }
              >
                <HugeiconsIcon
                  icon={MoreVerticalIcon}
                  className="text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>General</DropdownMenuLabel>
                  <DropdownMenuItem
                    render={
                      <Link
                        to="/pods/$podSlug"
                        params={{ podSlug: pod.slug }}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={ExternalLinkIcon}
                      className="text-muted-foreground"
                    />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(pod)}>
                    <HugeiconsIcon
                      icon={PencilEdit01Icon}
                      className="text-muted-foreground"
                    />
                    Edit
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Clones</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={managerClonePending}
                    onClick={() => {
                      row.toggleExpanded(true)
                      onManagerClone(pod)
                    }}
                  >
                    <HugeiconsIcon
                      icon={CopyIcon}
                      className="text-muted-foreground"
                    />
                    Clone
                  </DropdownMenuItem>
                  {POD_CLONE_ACTIONS.map((action) => {
                    const config = POD_CLONE_ACTION_CONFIG[action]

                    return (
                      <DropdownMenuItem
                        key={action}
                        variant={
                          action === "reclone" || action === "delete"
                            ? "destructive"
                            : undefined
                        }
                        disabled={
                          pod.clone_count === 0 || cloneBulkActionPending
                        }
                        onClick={() => onCloneBulkAction(pod, action)}
                      >
                        <HugeiconsIcon
                          icon={config.icon}
                          className="text-muted-foreground"
                        />
                        {config.label}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={pod.status}
                    onValueChange={(value) =>
                      onStatusChange(pod, value as PodStatus)
                    }
                  >
                    <DropdownMenuRadioItem value="listed">
                      <HugeiconsIcon
                        icon={ViewIcon}
                        className="text-muted-foreground"
                      />
                      Listed
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="unlisted">
                      <HugeiconsIcon
                        icon={ViewOffSlashIcon}
                        className="text-muted-foreground"
                      />
                      Unlisted
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(pod)}
                >
                  <HugeiconsIcon icon={Delete01Icon} />
                  Delete Pod
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
