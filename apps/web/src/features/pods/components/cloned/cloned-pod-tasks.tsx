import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  IconChecklist,
  IconCircleCheckFilled,
  IconCircleXFilled,
} from "@tabler/icons-react"
import { MarkdownContent } from "@workspace/ui/components/markdown-content"
import { cn } from "@workspace/ui/lib/utils"
import { ClonedPodTaskQuestions } from "./cloned-pod-task-questions"
import type { PodTask } from "@/features/pods/types/pod-types"

export function ClonedPodTasks({
  tasks,
  questionsDisabled = false,
}: {
  tasks: Array<PodTask>
  questionsDisabled?: boolean
}) {
  return (
    <Card className="rounded-b-2xl! pb-0">
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Tasks
        </CardTitle>
        <CardDescription>
          Questions that must be answered or objectives that must be reached in
          order to complete the pod.
        </CardDescription>
        <CardAction>
          <IconChecklist className="text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-6 border-t">
        <Accordion
          className="w-full rounded-t-none! border-none"
          defaultValue={[tasks[0]?.id]}
        >
          {tasks.map((task, index) => (
            <AccordionItem
              key={task.id}
              value={task.id}
              className="data-open:bg-card"
            >
              <AccordionTrigger className="px-6 hover:no-underline">
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
              <AccordionContent className="px-2 pt-4 pb-6 md:px-6">
                <div className="flex flex-col gap-6">
                  <MarkdownContent>{task.content}</MarkdownContent>

                  {task.questions && (
                    <ClonedPodTaskQuestions
                      questions={task.questions}
                      disabled={questionsDisabled}
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
