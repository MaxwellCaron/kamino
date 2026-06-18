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
import { Badge } from "@workspace/ui/components/badge"
import {
  IconChecklist,
  IconCircleCheckFilled,
  IconCircleXFilled,
} from "@tabler/icons-react"
import { MarkdownContent } from "@workspace/ui/components/markdown-content"
import { cn } from "@workspace/ui/lib/utils"
import { PodTaskQuestions } from "./pod-task-questions"
import type {
  ClonedPod,
  ClonedPodTaskState,
  PodTask,
  PodTaskQuestionAnswer,
} from "@/features/pods/types/pod-types"
import {
  createQuestionAnswerMap,
  createTaskStateMap,
  createTaskSummary,
} from "@/features/pods/utils/pod-runtime-state"

export function PodTasks({
  tasks,
  clonedPodId,
  taskStates,
  questionAnswers,
  questionsDisabled = false,
  onClonedPodChange,
}: {
  tasks: Array<PodTask>
  clonedPodId?: string
  taskStates: Array<ClonedPodTaskState> | null
  questionAnswers: Array<PodTaskQuestionAnswer> | null
  questionsDisabled?: boolean
  onClonedPodChange?: (clonedPod: ClonedPod) => void
}) {
  const defaultValue = tasks[0] ? [tasks[0].id] : []
  const taskStatesByTaskId = taskStates ? createTaskStateMap(taskStates) : null
  const answersByQuestionId = questionAnswers
    ? createQuestionAnswerMap(questionAnswers)
    : null
  const taskSummary = createTaskSummary(tasks, taskStates)
  const isFullyComplete =
    taskSummary.total === 0 || taskSummary.completed === taskSummary.total

  return (
    <Card className="rounded-b-2xl! pb-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconChecklist className="text-muted-foreground" />
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Tasks
          </span>
        </CardTitle>
        <CardDescription>
          Questions that must be answered or objectives that must be reached in
          order to complete the pod.
        </CardDescription>
        <CardAction>
          <Badge variant={isFullyComplete ? "default" : "destructive"}>
            {taskSummary.completed} / {taskSummary.total}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-6 border-t">
        <Accordion
          className="w-full rounded-t-none! border-none"
          defaultValue={defaultValue}
        >
          {tasks.map((task, index) => {
            const isCompleted =
              taskStatesByTaskId?.get(task.id)?.completed ?? null

            return (
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
                          isCompleted == null
                            ? "text-muted-foreground"
                            : isCompleted
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                        )}
                      >
                        Task {index + 1}
                      </span>
                      {isCompleted === true && (
                        <IconCircleCheckFilled className="size-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                      {isCompleted === false && (
                        <IconCircleXFilled className="size-4 text-red-600 dark:text-red-400" />
                      )}
                      <span className="font-semibold">{task.title}</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pt-4 pb-6 md:px-6">
                  <div className="flex flex-col gap-6">
                    <MarkdownContent>{task.content}</MarkdownContent>

                    {task.questions && task.questions.length > 0 && (
                      <PodTaskQuestions
                        questions={task.questions}
                        clonedPodId={clonedPodId}
                        answersByQuestionId={answersByQuestionId}
                        disabled={questionsDisabled}
                        onAnswered={onClonedPodChange}
                      />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </CardContent>
    </Card>
  )
}
