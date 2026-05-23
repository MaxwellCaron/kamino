import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { MarkdownContent } from "@workspace/ui/components/markdown-content"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@workspace/ui/components/reui/sortable"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  IconChecklist,
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconZoomQuestion,
} from "@tabler/icons-react"
import {
  createEmptyQuestion,
  createEmptyTask,
  toPodDraft,
} from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import { PodHeader } from "@/features/pods/components/pod-header"

type PublishPodTasksStepProps = {
  form: PublishPodFormApi
}

type PublishPodFieldPath = Parameters<PublishPodFormApi["getFieldMeta"]>[0]

function getTaskErrorCount(
  form: PublishPodFormApi,
  taskIndex: number,
  questionCount: number
) {
  const paths: Array<PublishPodFieldPath> = [
    `tasks[${taskIndex}].title` as PublishPodFieldPath,
    `tasks[${taskIndex}].content` as PublishPodFieldPath,
    ...Array.from(
      { length: questionCount },
      (_, questionIndex) =>
        `tasks[${taskIndex}].questions[${questionIndex}].title` as PublishPodFieldPath
    ),
    ...Array.from(
      { length: questionCount },
      (_, questionIndex) =>
        `tasks[${taskIndex}].questions[${questionIndex}].answerOutline` as PublishPodFieldPath
    ),
  ]

  return paths.reduce((count, path) => {
    const errors = form.getFieldMeta(path)?.errors ?? []
    return errors.length > 0 ? count + 1 : count
  }, 0)
}

export function PublishPodTasksStep({ form }: PublishPodTasksStepProps) {
  return (
    <div className="flex flex-col">
      <form.Subscribe selector={(state) => state.values}>
        {(values) => <PodHeader pod={toPodDraft(values)} clonedPod={null} />}
      </form.Subscribe>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <form.Field name="tasks" mode="array">
          {(tasksField) => (
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
                  <Button
                    type="button"
                    onClick={() => tasksField.pushValue(createEmptyTask())}
                  >
                    <IconPlus data-icon="inline-start" />
                    Add Task
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="-mx-6 border-t">
                {tasksField.state.value.length === 0 ? (
                  <Empty className="rounded-none border-0">
                    <EmptyHeader>
                      <EmptyTitle>No tasks added yet.</EmptyTitle>
                      <EmptyDescription>
                        Add at least one task to describe what users should do.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Accordion
                    keepMounted
                    className="w-full rounded-t-none! border-none"
                  >
                    {tasksField.state.value.map((task, index) => (
                      <AccordionItem
                        key={task.id}
                        value={task.id}
                        className="data-open:bg-card"
                      >
                        <AccordionTrigger className="px-6 hover:no-underline">
                          <div className="flex items-center gap-3">
                            <span className="min-w-16 font-bold text-muted-foreground">
                              Task {index + 1}
                            </span>
                            <span className="font-semibold">
                              {task.title.trim() || "Untitled Task"}
                            </span>
                            <form.Subscribe
                              selector={(state) => state.fieldMetaBase}
                            >
                              {() => {
                                const errorCount = getTaskErrorCount(
                                  form,
                                  index,
                                  task.questions.length
                                )

                                if (errorCount === 0) return null

                                return (
                                  <Badge variant="destructive">
                                    {errorCount}
                                  </Badge>
                                )
                              }}
                            </form.Subscribe>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-2 pt-4 pb-6 md:px-6">
                          <div className="flex flex-col gap-6">
                            <FieldGroup>
                              <form.Field name={`tasks[${index}].title`}>
                                {(field) => {
                                  const isInvalid =
                                    field.state.meta.errors.length > 0

                                  return (
                                    <Field
                                      data-invalid={isInvalid || undefined}
                                    >
                                      <FieldLabel htmlFor={field.name}>
                                        Title
                                      </FieldLabel>
                                      <FieldContent>
                                        <Input
                                          id={field.name}
                                          name={field.name}
                                          value={field.state.value}
                                          onBlur={field.handleBlur}
                                          onChange={(event) =>
                                            field.handleChange(
                                              event.target.value
                                            )
                                          }
                                          aria-invalid={isInvalid || undefined}
                                          placeholder="Task Title"
                                        />
                                        <FieldError
                                          errors={field.state.meta.errors}
                                        />
                                      </FieldContent>
                                    </Field>
                                  )
                                }}
                              </form.Field>

                              <form.Field name={`tasks[${index}].content`}>
                                {(field) => {
                                  const isInvalid =
                                    field.state.meta.errors.length > 0

                                  return (
                                    <Field
                                      data-invalid={isInvalid || undefined}
                                    >
                                      <FieldLabel htmlFor={field.name}>
                                        Content
                                      </FieldLabel>
                                      <FieldContent>
                                        <Tabs
                                          defaultValue="text"
                                          className="w-full"
                                        >
                                          <div className="flex items-center justify-between">
                                            <TabsList className="w-full">
                                              <TabsTrigger value="text">
                                                Text
                                              </TabsTrigger>
                                              <TabsTrigger value="markdown">
                                                Markdown Preview
                                              </TabsTrigger>
                                            </TabsList>
                                          </div>
                                          <TabsContent
                                            value="text"
                                            className="mt-2"
                                          >
                                            <InputGroup>
                                              <InputGroupTextarea
                                                id={field.name}
                                                name={field.name}
                                                className="min-h-30 p-4"
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(event) =>
                                                  field.handleChange(
                                                    event.target.value
                                                  )
                                                }
                                                aria-invalid={
                                                  isInvalid || undefined
                                                }
                                                placeholder="Describe the task instructions..."
                                              />
                                              <InputGroupAddon align="block-end">
                                                <InputGroupText className="ml-auto text-xs">
                                                  {field.state.value.length}{" "}
                                                  characters
                                                </InputGroupText>
                                              </InputGroupAddon>
                                            </InputGroup>
                                          </TabsContent>
                                          <TabsContent
                                            value="markdown"
                                            className="mt-2"
                                          >
                                            {field.state.value ? (
                                              <MarkdownContent>
                                                {field.state.value}
                                              </MarkdownContent>
                                            ) : (
                                              <p className="text-muted-foreground italic">
                                                No content to preview.
                                              </p>
                                            )}
                                          </TabsContent>
                                        </Tabs>
                                        <FieldError
                                          errors={field.state.meta.errors}
                                        />
                                      </FieldContent>
                                    </Field>
                                  )
                                }}
                              </form.Field>
                            </FieldGroup>

                            <Separator />

                            <form.Field
                              name={`tasks[${index}].questions`}
                              mode="array"
                            >
                              {(questionsField) => (
                                <Card className="bg-muted/50">
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <IconZoomQuestion className="size-4.5 text-muted-foreground" />
                                      Questions
                                    </CardTitle>
                                    <CardAction>
                                      <Button
                                        type="button"
                                        onClick={() =>
                                          questionsField.pushValue(
                                            createEmptyQuestion()
                                          )
                                        }
                                      >
                                        <IconPlus data-icon="inline-start" />
                                        Add Question
                                      </Button>
                                    </CardAction>
                                  </CardHeader>
                                  <CardContent className="flex flex-col gap-4">
                                    {questionsField.state.value.length === 0 ? (
                                      <p className="text-center text-xs text-muted-foreground italic">
                                        No questions for this task.
                                      </p>
                                    ) : (
                                      <Sortable
                                        value={questionsField.state.value}
                                        onValueChange={(newQuestions) =>
                                          questionsField.handleChange(
                                            newQuestions
                                          )
                                        }
                                        getItemValue={(question) => question.id}
                                        className="flex flex-col gap-4"
                                      >
                                        {questionsField.state.value.map(
                                          (question, questionIndex) => (
                                            <SortableItem
                                              key={question.id}
                                              value={question.id}
                                            >
                                              <Card className="bg-transparent">
                                                <CardHeader>
                                                  <CardTitle className="flex items-center gap-2">
                                                    <SortableItemHandle>
                                                      <IconGripVertical className="size-4 text-muted-foreground" />
                                                    </SortableItemHandle>
                                                    Question {questionIndex + 1}
                                                  </CardTitle>
                                                  <CardAction>
                                                    <Button
                                                      type="button"
                                                      variant="destructive"
                                                      size="icon"
                                                      onClick={() =>
                                                        questionsField.removeValue(
                                                          questionIndex
                                                        )
                                                      }
                                                    >
                                                      <IconTrash />
                                                    </Button>
                                                  </CardAction>
                                                </CardHeader>
                                                <CardContent>
                                                  <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                                    <form.Field
                                                      name={`tasks[${index}].questions[${questionIndex}].title`}
                                                    >
                                                      {(field) => {
                                                        const isInvalid =
                                                          field.state.meta
                                                            .errors.length > 0

                                                        return (
                                                          <Field
                                                            className="md:col-span-2"
                                                            data-invalid={
                                                              isInvalid ||
                                                              undefined
                                                            }
                                                          >
                                                            <FieldLabel
                                                              htmlFor={
                                                                field.name
                                                              }
                                                            >
                                                              Question
                                                            </FieldLabel>
                                                            <FieldContent>
                                                              <Input
                                                                id={field.name}
                                                                name={
                                                                  field.name
                                                                }
                                                                value={
                                                                  field.state
                                                                    .value
                                                                }
                                                                onBlur={
                                                                  field.handleBlur
                                                                }
                                                                onChange={(
                                                                  event
                                                                ) =>
                                                                  field.handleChange(
                                                                    event.target
                                                                      .value
                                                                  )
                                                                }
                                                                aria-invalid={
                                                                  isInvalid ||
                                                                  undefined
                                                                }
                                                                placeholder="e.g. What is the status of the service?"
                                                              />
                                                              <FieldError
                                                                errors={
                                                                  field.state
                                                                    .meta.errors
                                                                }
                                                              />
                                                            </FieldContent>
                                                          </Field>
                                                        )
                                                      }}
                                                    </form.Field>

                                                    <form.Field
                                                      name={`tasks[${index}].questions[${questionIndex}].answerOutline`}
                                                    >
                                                      {(field) => {
                                                        const isInvalid =
                                                          field.state.meta
                                                            .errors.length > 0

                                                        return (
                                                          <Field
                                                            data-invalid={
                                                              isInvalid ||
                                                              undefined
                                                            }
                                                          >
                                                            <FieldLabel
                                                              htmlFor={
                                                                field.name
                                                              }
                                                            >
                                                              Answer
                                                            </FieldLabel>
                                                            <FieldContent>
                                                              <Input
                                                                id={field.name}
                                                                name={
                                                                  field.name
                                                                }
                                                                value={
                                                                  field.state
                                                                    .value
                                                                }
                                                                onBlur={
                                                                  field.handleBlur
                                                                }
                                                                onChange={(
                                                                  event
                                                                ) =>
                                                                  field.handleChange(
                                                                    event.target
                                                                      .value
                                                                  )
                                                                }
                                                                aria-invalid={
                                                                  isInvalid ||
                                                                  undefined
                                                                }
                                                                placeholder="e.g. active (running)"
                                                              />
                                                              <FieldError
                                                                errors={
                                                                  field.state
                                                                    .meta.errors
                                                                }
                                                              />
                                                            </FieldContent>
                                                          </Field>
                                                        )
                                                      }}
                                                    </form.Field>
                                                  </FieldGroup>
                                                </CardContent>
                                              </Card>
                                            </SortableItem>
                                          )
                                        )}
                                      </Sortable>
                                    )}
                                  </CardContent>
                                </Card>
                              )}
                            </form.Field>

                            <div className="flex justify-center">
                              <Button
                                type="button"
                                variant="destructive"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  tasksField.removeValue(index)
                                }}
                              >
                                <IconTrash data-icon="inline-start" />
                                Delete Task
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}
        </form.Field>
      </div>
    </div>
  )
}
