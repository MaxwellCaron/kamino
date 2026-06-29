import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import type { CloneStatusTask } from "@/features/pods/types/clone-status"
import type { PendingCloneRow } from "@/features/pods/types/published-pods-types"
import { clonePodProgressQueryOptions } from "@/features/pods/api/clone-pod-api"
import { DEFAULT_CLONE_TASKS } from "@/features/pods/types/clone-status"
import { CloneStatusItem } from "@/features/pods/components/clone/clone-status-item"
import {
  FAILED_PROGRESS_COLORS,
  getProgressStepColors,
} from "@/components/progress-state/progress-state-colors"

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function PendingCloneStatusItem({
  row,
  onDismiss,
}: {
  row: PendingCloneRow
  onDismiss: (progressId: string) => void
}) {
  const { data: progressData } = useQuery(
    clonePodProgressQueryOptions(row.progressId, row.state === "running")
  )

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const currentStep =
    progressData?.step_id ??
    (row.state === "queued" ? 0 : row.state === "running" ? 1 : 0)
  const isFailed = row.state === "error" || progressData?.state === "error"
  const isFinished = row.state === "success" && !isFailed
  const isCloning =
    row.state !== "queued" ||
    progressData?.state === "running" ||
    progressData?.state === "success" ||
    progressData?.state === "error"

  useEffect(() => {
    if (!isCloning || isFinished || isFailed) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isFinished, isFailed])

  const tasks: Array<CloneStatusTask> = DEFAULT_CLONE_TASKS.map((task) => {
    if (!isCloning || row.state === "queued")
      return { ...task, status: "pending" }
    if (isFinished || currentStep > task.id)
      return { ...task, status: "completed" }
    if (currentStep === task.id) return { ...task, status: "in-progress" }
    return { ...task, status: "pending" }
  })
  const activeTask = tasks.find((task) => task.status === "in-progress")
  const colors = isFailed
    ? FAILED_PROGRESS_COLORS
    : getProgressStepColors(activeTask?.id)

  return (
    <div className="relative">
      <CloneStatusItem
        title={
          <>
            {row.principal.label}{" "}
            <Badge variant="outline" className="text-xs">
              {row.principal.type.charAt(0).toUpperCase() +
                row.principal.type.slice(1)}
            </Badge>
          </>
        }
        tasks={tasks}
        isCloning={isCloning}
        isFinished={isFinished}
        isFailed={isFailed}
        colors={colors}
        elapsedTime={formatTime(elapsedSeconds)}
        defaultExpanded={row.state !== "queued"}
      />

      {row.state === "error" && (
        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss failed clone for ${row.principal.label}`}
            onClick={() => onDismiss(row.progressId)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="text-muted-foreground"
            />
          </Button>
        </div>
      )}
    </div>
  )
}
