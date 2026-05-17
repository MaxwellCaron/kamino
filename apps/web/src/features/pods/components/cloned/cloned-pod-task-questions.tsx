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
import { IconZoomQuestion } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import type { PodTaskQuestion } from "@/features/pods/types/pod-types"

export function ClonedPodTaskQuestions({
  questions,
}: {
  questions: Array<PodTaskQuestion>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconZoomQuestion className="size-4.5 text-muted-foreground" />
          Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGroup>
          {questions.map((question, questionIndex) => (
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
                <FieldDescription>{question.description}</FieldDescription>
              )}
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
