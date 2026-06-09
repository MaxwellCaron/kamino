import { PodTasks } from "../pod-tasks"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PodTask } from "@/features/pods/types/pod-types"

type PublishPodPreviewStepProps = {
  form: PublishPodFormApi
}

function maskTaskAnswers(tasks: Array<PodTask>): Array<PodTask> {
  return tasks.map((task) => ({
    ...task,
    questions: task.questions?.map((question) => ({
      ...question,
      answerOutline: question.answerOutline?.replace(/[a-zA-Z0-9]/g, "*"),
    })),
  }))
}

export function PublishPodPreviewStep({ form }: PublishPodPreviewStepProps) {
  return (
    <PublishPodStepLayout form={form}>
      <form.Subscribe selector={(state) => state.values.tasks}>
        {(tasks) => (
          <PodTasks
            tasks={maskTaskAnswers(tasks)}
            taskStates={null}
            questionAnswers={null}
            questionsDisabled={true}
          />
        )}
      </form.Subscribe>
    </PublishPodStepLayout>
  )
}
