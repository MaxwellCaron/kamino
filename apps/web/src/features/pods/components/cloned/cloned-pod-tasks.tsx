import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import {
  IconCircle,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconDownload,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { tryHackMeTasks } from "../../types/test-data"

export function ClonedPodTasks() {
  return (
    <div className="pp-4 space-y-4">
      <Accordion className="w-full" defaultValue={["task-1"]}>
        {tryHackMeTasks.map((task, index) => (
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

                {task.questions.length > 0 && (
                  <div className="space-y-6 border-t pt-4">
                    <h3 className="text-lg font-semibold">Questions</h3>
                    {task.questions.map((q) => (
                      <div key={q.id} className="space-y-3">
                        <p className="text-sm font-medium">{q.text}</p>
                        <div className="flex gap-2">
                          <Input placeholder="Enter your answer..." />
                          <Button size="sm">Submit</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
