import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@workspace/ui/components/reui/sortable"
import { Button } from "@workspace/ui/components/button"
import {
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconZoomQuestion,
} from "@tabler/icons-react"
import { createEmptyQuestion } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"

type PublishPodTaskQuestionsProps = {
  form: PublishPodFormApi
  submissionAttempts: number
  taskIndex: number
}

export function PublishPodTaskQuestions({
  form,
  submissionAttempts,
  taskIndex,
}: PublishPodTaskQuestionsProps) {
  return (
    <form.Field name={`tasks[${taskIndex}].questions`} mode="array">
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
                onClick={() => questionsField.pushValue(createEmptyQuestion())}
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
                  questionsField.handleChange(newQuestions)
                }
                getItemValue={(question) => question.id}
                className="flex flex-col gap-4"
              >
                {questionsField.state.value.map((question, questionIndex) => (
                  <SortableItem key={question.id} value={question.id}>
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
                              questionsField.removeValue(questionIndex)
                            }
                          >
                            <IconTrash />
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <form.Field
                            name={`tasks[${taskIndex}].questions[${questionIndex}].title`}
                          >
                            {(field) => {
                              const showValidation =
                                field.state.meta.isTouched ||
                                submissionAttempts > 0
                              const isInvalid =
                                showValidation && !field.state.meta.isValid

                              return (
                                <Field
                                  className="md:col-span-2"
                                  data-invalid={isInvalid || undefined}
                                >
                                  <FieldLabel htmlFor={field.name}>
                                    Question
                                  </FieldLabel>
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
                                      placeholder="e.g. What is the status of the service?"
                                    />
                                    <FieldError
                                      errors={
                                        showValidation
                                          ? field.state.meta.errors
                                          : []
                                      }
                                    />
                                  </FieldContent>
                                </Field>
                              )
                            }}
                          </form.Field>

                          <form.Field
                            name={`tasks[${taskIndex}].questions[${questionIndex}].answerOutline`}
                          >
                            {(field) => {
                              const showValidation =
                                field.state.meta.isTouched ||
                                submissionAttempts > 0
                              const isInvalid =
                                showValidation && !field.state.meta.isValid

                              return (
                                <Field data-invalid={isInvalid || undefined}>
                                  <FieldLabel htmlFor={field.name}>
                                    Answer
                                  </FieldLabel>
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
                                      placeholder="e.g. active (running)"
                                    />
                                    <FieldError
                                      errors={
                                        showValidation
                                          ? field.state.meta.errors
                                          : []
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
                ))}
              </Sortable>
            )}
          </CardContent>
        </Card>
      )}
    </form.Field>
  )
}
