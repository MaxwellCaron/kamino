import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { IconCircleCheckFilled, IconCircleXFilled } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { Button } from "@workspace/ui/components/button"
import type { PodTask } from "../../types/pod-types"

export function ClonedPodTasks({ tasks }: { tasks: Array<PodTask> }) {
  return (
    <Card className="rounded-b-2xl! pb-0">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>
          Questions that must be answered or objectives that must be completed
          in order to complete the pod.
        </CardDescription>
      </CardHeader>
      <CardContent className="-mx-6">
        <Accordion
          className="w-full rounded-t-none!"
          defaultValue={[tasks[0]?.id]}
        >
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
                    {task.content}
                  </div>

                  {task.questions && (
                    <div className="space-y-4">
                      <Separator />
                      <span className="text-xl font-semibold tracking-tight">
                        Questions
                      </span>
                      <FieldGroup className="mt-4">
                        {task.questions.map((question, questionIndex) => (
                          <Field key={question.id}>
                            <FieldLabel htmlFor={question.id}>
                              {questionIndex + 1}. {question.title}
                            </FieldLabel>
                            <div className="flex gap-2">
                              <Input
                                id={question.id}
                                type="text"
                                placeholder={
                                  question.answerOutline
                                    ? question.answerOutline
                                    : "Type your answer here..."
                                }
                              />
                              <Button>Submit</Button>
                            </div>
                            {question.description && (
                              <FieldDescription>
                                {question.description}
                              </FieldDescription>
                            )}
                          </Field>
                        ))}
                      </FieldGroup>
                    </div>
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
