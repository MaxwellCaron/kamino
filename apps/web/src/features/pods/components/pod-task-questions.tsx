import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import { IconBulb, IconZoomQuestion } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import type {
  PodTaskQuestion,
  PodTaskQuestionAnswer,
  UUID,
} from "@/features/pods/types/pod-types"
import { AppDialogContent } from "@/components/dialogs/app-dialog"

export function PodTaskQuestions({
  questions,
  answersByQuestionId,
  disabled = false,
}: {
  questions: Array<PodTaskQuestion>
  answersByQuestionId: Map<UUID, PodTaskQuestionAnswer> | null
  disabled?: boolean
}) {
  return (
    <Card className="bg-muted/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconZoomQuestion className="size-4.5 text-muted-foreground" />
          Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          {questions.map((question, questionIndex) => {
            const answer = answersByQuestionId?.get(question.id)
            const answerSubmitted = answer != null
            const answerIsCorrect = answer?.is_correct === true
            const hint = question.hint?.trim()

            return (
              <Field key={question.id} data-disabled={disabled || undefined}>
                <FieldLabel htmlFor={question.id}>
                  {questionIndex + 1}. {question.title}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id={question.id}
                    type="text"
                    defaultValue={answer?.answer}
                    placeholder={
                      question.answerOutline
                        ? question.answerOutline.replace(/[a-zA-Z0-9]/g, "*")
                        : "Type your answer here..."
                    }
                    disabled={disabled || answerIsCorrect}
                  />
                  {hint && (
                    <Dialog>
                      <DialogTrigger
                        render={
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            disabled={disabled || answerIsCorrect}
                            className="bg-yellow-600/20 text-yellow-600 hover:bg-yellow-600/15 dark:bg-yellow-400/10 dark:text-yellow-400 dark:hover:bg-yellow-400/5"
                          />
                        }
                      >
                        <IconBulb />
                        <span className="sr-only">Show hint</span>
                      </DialogTrigger>
                      <AppDialogContent
                        icon={IconBulb}
                        title="Hint"
                        description=""
                      >
                        <p className="text-sm leading-6 whitespace-pre-wrap">
                          {hint}
                        </p>
                      </AppDialogContent>
                    </Dialog>
                  )}
                  <Button disabled={disabled || answerIsCorrect}>
                    {answerIsCorrect ? "Correct" : "Submit"}
                  </Button>
                </div>
                {question.description && (
                  <FieldDescription>{question.description}</FieldDescription>
                )}
                {answerSubmitted && !answerIsCorrect && (
                  <FieldDescription>
                    The submitted answer was not correct.
                  </FieldDescription>
                )}
              </Field>
            )
          })}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
