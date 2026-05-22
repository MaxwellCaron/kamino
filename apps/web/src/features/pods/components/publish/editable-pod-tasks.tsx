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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  IconChecklist,
  IconPlus,
  IconTrash,
  IconZoomQuestion,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel, FieldGroup } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { uuid } from "@workspace/ui/lib/utils"
import type { PodTask, PodTaskQuestion } from "@/features/pods/types/pod-types"
import { Separator } from "@workspace/ui/components/separator"

export function EditablePodTasks({
  tasks,
  onChange,
}: {
  tasks: Array<PodTask>
  onChange: (tasks: Array<PodTask>) => void
}) {
  const addTask = () => {
    const newTask: PodTask = {
      id: uuid(),
      title: "",
      content: "",
      questions: [],
    }
    onChange([...tasks, newTask])
  }

  const removeTask = (id: string) => {
    onChange(tasks.filter((t) => t.id !== id))
  }

  const updateTask = (id: string, updates: Partial<PodTask>) => {
    onChange(tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const addQuestion = (taskId: string) => {
    const newQuestion: PodTaskQuestion = {
      id: uuid(),
      title: "",
      answerOutline: "",
    }
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      updateTask(taskId, {
        questions: [...(task.questions ?? []), newQuestion],
      })
    }
  }

  const removeQuestion = (taskId: string, questionId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      updateTask(taskId, {
        questions: (task.questions ?? []).filter((q) => q.id !== questionId),
      })
    }
  }

  const updateQuestion = (
    taskId: string,
    questionId: string,
    updates: Partial<PodTaskQuestion>
  ) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      updateTask(taskId, {
        questions: (task.questions ?? []).map((q) =>
          q.id === questionId ? { ...q, ...updates } : q
        ),
      })
    }
  }

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
          Add the objectives and questions for this pod.
        </CardDescription>
        <CardAction>
          <Button onClick={addTask}>
            <IconPlus data-icon="inline-start" />
            Add Task
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-6 border-t">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No tasks added yet.</p>
            <Button variant="ghost" className="mt-2" onClick={addTask}>
              Create your first task
            </Button>
          </div>
        ) : (
          <Accordion className="w-full rounded-t-none! border-none">
            {tasks.map((task, index) => (
              <AccordionItem
                key={task.id}
                value={task.id}
                className="data-open:bg-card"
              >
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="min-w-16 font-bold text-muted-foreground">
                        Task {index + 1}
                      </span>
                      <Input
                        className="w-100 font-semibold"
                        value={task.title}
                        onChange={(e) =>
                          updateTask(task.id, { title: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Task Title"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTask(task.id)
                      }}
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pt-4 pb-6 md:px-6">
                  <div className="flex flex-col gap-6">
                    <FieldGroup>
                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel>Content</FieldLabel>
                          <Tabs defaultValue="overview">
                            <TabsList>
                              <TabsTrigger value="text">Text</TabsTrigger>
                              <TabsTrigger value="markdown">
                                Markdown
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                        <InputGroup>
                          <InputGroupTextarea
                            className="min-h-[120px]"
                            value={task.content}
                            onChange={(e) =>
                              updateTask(task.id, { content: e.target.value })
                            }
                            placeholder="Describe the task instructions..."
                          />
                          <InputGroupAddon align="block-end">
                            <InputGroupText className="ml-auto text-xs">
                              {task.content.length} characters
                            </InputGroupText>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    </FieldGroup>

                    <Separator />

                    <Card className="bg-muted/50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <IconZoomQuestion className="size-4.5 text-muted-foreground" />
                          Questions
                        </CardTitle>
                        <CardAction>
                          <Button onClick={() => addQuestion(task.id)}>
                            <IconPlus data-icon="inline-start" />
                            Add Question
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        {(task.questions ?? []).length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground italic">
                            No questions for this task.
                          </p>
                        ) : (
                          task.questions?.map((q, qIndex) => (
                            <Card key={q.id} className="bg-transparent">
                              <CardHeader>
                                <CardTitle>Question {qIndex + 1}</CardTitle>
                                <CardAction>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() =>
                                      removeQuestion(task.id, q.id)
                                    }
                                  >
                                    <IconTrash />
                                  </Button>
                                </CardAction>
                              </CardHeader>
                              <CardContent>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeQuestion(task.id, q.id)}
                                >
                                  <IconTrash className="size-3.5" />
                                </Button>
                                <FieldGroup>
                                  <Field>
                                    <FieldLabel>Question</FieldLabel>
                                    <Input
                                      value={q.title}
                                      onChange={(e) =>
                                        updateQuestion(task.id, q.id, {
                                          title: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. What is the status of the service?"
                                    />
                                  </Field>
                                  <Field>
                                    <FieldLabel>Answer</FieldLabel>
                                    <Input
                                      value={q.answerOutline}
                                      onChange={(e) =>
                                        updateQuestion(task.id, q.id, {
                                          answerOutline: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. active (running)"
                                    />
                                  </Field>
                                </FieldGroup>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  )
}
