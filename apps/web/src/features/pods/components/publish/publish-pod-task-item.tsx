import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { Separator } from "@workspace/ui/components/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { IconTrash } from "@tabler/icons-react"
import { PublishPodTaskQuestions } from "./publish-pod-task-questions"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"

type PublishPodFieldPath = Parameters<PublishPodFormApi["getFieldMeta"]>[0]

type PublishPodTaskItemProps = {
  form: PublishPodFormApi
  index: number
  onRequestDelete: (task: { id: string; title: string }) => void
  submissionAttempts: number
  task: PublishPodFormValues["tasks"][number]
}

function getTaskErrorCount(
  form: PublishPodFormApi,
  taskIndex: number,
  questionCount: number,
  submissionAttempts: number
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
    const meta = form.getFieldMeta(path)
    const errors = meta?.errors ?? []
    const showValidation = (meta?.isTouched ?? false) || submissionAttempts > 0

    return showValidation && meta && !meta.isValid && errors.length > 0
      ? count + 1
      : count
  }, 0)
}

export function PublishPodTaskItem({
  form,
  index,
  onRequestDelete,
  submissionAttempts,
  task,
}: PublishPodTaskItemProps) {
  return (
    <AccordionItem key={task.id} value={task.id} className="data-open:bg-card">
      <AccordionTrigger className="px-6 hover:no-underline">
        <div className="flex items-center gap-3">
          <span className="min-w-16 font-bold text-muted-foreground">
            Task {index + 1}
          </span>
          <span className="font-semibold">
            {task.title.trim() || "Untitled Task"}
          </span>
          <form.Subscribe selector={(state) => state.fieldMetaBase}>
            {() => {
              const errorCount = getTaskErrorCount(
                form,
                index,
                task.questions.length,
                submissionAttempts
              )

              if (errorCount === 0) return null

              return <Badge variant="destructive">{errorCount}</Badge>
            }}
          </form.Subscribe>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-2 pt-4 pb-6 md:px-6">
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <form.Field name={`tasks[${index}].title`}>
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                    <FieldContent>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={isInvalid || undefined}
                        placeholder="Task Title"
                      />
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name={`tasks[${index}].content`}>
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={field.name}>Content</FieldLabel>
                    <FieldContent>
                      <Tabs defaultValue="text" className="w-full">
                        <div className="flex items-center justify-between">
                          <TabsList className="w-full">
                            <TabsTrigger value="text">Text</TabsTrigger>
                            <TabsTrigger value="markdown">
                              Markdown Preview
                            </TabsTrigger>
                          </TabsList>
                        </div>
                        <TabsContent value="text" className="mt-2">
                          <InputGroup>
                            <InputGroupTextarea
                              id={field.name}
                              name={field.name}
                              className="min-h-30 p-4"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              aria-invalid={isInvalid || undefined}
                              placeholder="Describe the task instructions..."
                            />
                            <InputGroupAddon align="block-end">
                              <InputGroupText className="ml-auto text-xs">
                                {field.state.value.length} characters
                              </InputGroupText>
                            </InputGroupAddon>
                          </InputGroup>
                        </TabsContent>
                        <TabsContent value="markdown" className="mt-2">
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
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>

          <Separator />

          <PublishPodTaskQuestions
            form={form}
            submissionAttempts={submissionAttempts}
            taskIndex={index}
          />

          <div className="flex justify-center">
            <Button
              type="button"
              variant="destructive"
              onClick={(event) => {
                event.stopPropagation()
                onRequestDelete({
                  id: task.id,
                  title: task.title.trim() || "Untitled Task",
                })
              }}
            >
              <IconTrash data-icon="inline-start" />
              Delete Task
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
