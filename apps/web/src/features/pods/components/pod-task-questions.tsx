import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { HugeiconsIcon } from "@hugeicons/react"
import { BulbIcon, SearchVisualIcon } from "@hugeicons/core-free-icons"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import type {
  ClonedPod,
  PodTaskQuestion,
  PodTaskQuestionAnswer,
  UUID,
} from "@/features/pods/types/pod-types"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppDialogContent } from "@/components/dialogs/app-dialog"
import { answerClonedPodQuestion } from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"

export function PodTaskQuestions({
  questions,
  clonedPodId,
  answersByQuestionId,
  disabled = false,
  onAnswered,
}: {
  questions: Array<PodTaskQuestion>
  clonedPodId?: string
  answersByQuestionId: Map<UUID, PodTaskQuestionAnswer> | null
  disabled?: boolean
  onAnswered?: (clonedPod: ClonedPod) => void
}) {
  return (
    <Card className="bg-muted/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={SearchVisualIcon}
            className="size-4.5 text-muted-foreground"
          />
          Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          {questions.map((question, questionIndex) => {
            const answer = answersByQuestionId?.get(question.id)

            return (
              <PodTaskQuestionField
                key={question.id}
                question={question}
                questionNumber={questionIndex + 1}
                clonedPodId={clonedPodId}
                answer={answer}
                disabled={disabled}
                onAnswered={onAnswered}
              />
            )
          })}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function PodTaskQuestionField({
  question,
  questionNumber,
  clonedPodId,
  answer,
  disabled,
  onAnswered,
}: {
  question: PodTaskQuestion
  questionNumber: number
  clonedPodId?: string
  answer?: PodTaskQuestionAnswer
  disabled: boolean
  onAnswered?: (clonedPod: ClonedPod) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{
    answer: string | undefined
    value: string
  } | null>(null)
  const value =
    draft !== null && draft.answer === answer?.answer
      ? draft.value
      : (answer?.answer ?? "")
  const mutation = useMutation({
    mutationFn: answerClonedPodQuestion,
    onSuccess: async (clonedPod) => {
      onAnswered?.(clonedPod)
      await queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
    },
  })
  const answerSubmitted = answer != null
  const answerIsCorrect = answer?.is_correct === true
  const answerIsIncorrect = answerSubmitted && !answerIsCorrect
  const hint = question.hint?.trim()
  const controlsDisabled = disabled || answerIsCorrect || mutation.isPending
  const canSubmit =
    !disabled && !answerIsCorrect && !!clonedPodId && value.trim().length > 0

  return (
    <Field
      data-disabled={disabled || undefined}
      data-invalid={answerIsIncorrect || undefined}
    >
      <FieldLabel htmlFor={question.id}>
        {questionNumber}. {question.title}
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id={question.id}
          type="text"
          value={value}
          placeholder={
            question.answerOutline
              ? question.answerOutline.replace(/[a-zA-Z0-9]/g, "*")
              : "Type your answer here..."
          }
          disabled={controlsDisabled}
          aria-invalid={answerIsIncorrect || undefined}
          onChange={(event) =>
            setDraft({ answer: answer?.answer, value: event.target.value })
          }
        />
        {hint && (
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  disabled={controlsDisabled}
                  className="bg-amber-600/20 text-amber-600 hover:bg-amber-600/15 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/5"
                />
              }
            >
              <HugeiconsIcon icon={BulbIcon} />
              <span className="sr-only">Show hint</span>
            </DialogTrigger>
            <AppDialogContent icon={BulbIcon} title="Hint" description="">
              <p className="text-sm leading-6 whitespace-pre-wrap">{hint}</p>
            </AppDialogContent>
          </Dialog>
        )}
        <AppActionButton
          type="button"
          disabled={!canSubmit}
          pending={mutation.isPending}
          pendingLabel="Submitting..."
          onClick={() => {
            if (!clonedPodId) return
            mutation.mutate({
              clonedPodId,
              questionId: question.id,
              answer: value.trim(),
            })
          }}
        >
          {answerIsCorrect ? "Correct" : "Submit"}
        </AppActionButton>
      </div>
      {question.description && (
        <FieldDescription>{question.description}</FieldDescription>
      )}
      {mutation.isError && (
        <FieldDescription>{mutation.error.message}</FieldDescription>
      )}
    </Field>
  )
}
