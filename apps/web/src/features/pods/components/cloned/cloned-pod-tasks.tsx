import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { IconCircleCheckFilled, IconCircleXFilled } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import type { PodTaskItem } from "../../types/pod-types"

export function ClonedPodTasks({ tasks }: { tasks: Array<PodTaskItem> }) {
  return (
    <div className="pp-4 space-y-4">
      <Accordion className="w-full" defaultValue={[tasks[0]?.id]}>
        {tasks.map((task, index) => (
          <AccordionItem key={task.id} value={task.id}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "min-w-16 font-bold",
                      task.completed
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    Task {index + 1}
                  </span>
                  {task.completed ? (
                    <IconCircleCheckFilled className="size-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <IconCircleXFilled className="size-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="font-semibold">{task.title}</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-4 pb-6">
              <div className="space-y-6">
                <div className="leading-7 whitespace-pre-wrap">
                  {task.description}
                </div>

                {/* Since the mock data in PodTaskItem doesn't have questions yet, we can keep the UI structure if needed, or hide it */}
                {/* For now, I'll assume if there are no questions, we don't show the section */}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
