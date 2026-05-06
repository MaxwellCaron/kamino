import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Progress } from "@workspace/ui/components/progress"
import {
  IconCircle,
  IconCircleCheckFilled,
  IconLoader2,
} from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { Loader } from "@dot-loaders/react"
import type { Pod } from "../../types/pod-types"

const tasks = [
  {
    id: 1,
    name: "Fetch virtual machines in pod",
    status: "completed",
  },
  {
    id: 2,
    name: "Identify router",
    status: "completed",
  },
  { id: 3, name: "Allocate VMIDs", status: "completed" },
  {
    id: 4,
    name: "Clone virtual machines",
    status: "in-progress",
  },
  { id: 5, name: "Wait for virtual machines to be ready", status: "pending" },
  { id: 6, name: "Configure router", status: "pending" },
]

export function ClonePodDialog({
  open,
  onOpenChange,
  pod,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pod: Pod | null
}) {
  const completedTasks = tasks.filter((t) => t.status === "completed").length
  const totalTasks = tasks.length
  const progress = (completedTasks / totalTasks) * 100
  const podTitle = pod?.title ?? "Pod"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3">
            <span className="border-primary text-primary">
              <Loader
                loader="pulse"
                renderer="svg-grid"
                speed={0.85}
                rendererOptions={{ shape: "square", cellSize: 6, gap: 2 }}
              />
            </span>
            <span className="text-2xl font-semibold tracking-tight">
              Clone Pod
            </span>
          </AlertDialogTitle>
        </AlertDialogHeader>

        <Progress
          value={progress}
          className="**:h-1.5"
          indicatorClassName="bg-primary dark:bg-primary"
        />

        <Card className="-mx-2 bg-muted">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Clone &apos;{podTitle}&apos; Pod
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {completedTasks} / {totalTasks}
              </span>
            </div>
          </CardHeader>
          <CardContent className="-mt-2">
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 text-sm">
                  <div className="flex-none">
                    {task.status === "completed" ? (
                      <IconCircleCheckFilled className="size-5 text-primary" />
                    ) : task.status === "in-progress" ? (
                      <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : (
                      <IconCircle className="size-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn("truncate", {
                        "font-semibold": task.status === "in-progress",
                        "text-foreground": task.status === "pending",
                        "text-muted-foreground line-through":
                          task.status === "completed",
                      })}
                    >
                      {task.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="default">Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
