import { toPodDraft } from "./publish-pod-form"
import type { PublishPodFormApi } from "./publish-pod-form"
import type { PodTask } from "@/features/pods/types/pod-types"
import { PodHeader } from "@/features/pods/components/pod-header"
import { PodTasks } from "@/features/pods/components/pod-tasks"

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
    <div className="flex flex-col">
      <form.Subscribe selector={(state) => state.values}>
        {(values) => <PodHeader pod={toPodDraft(values)} clonedPod={null} />}
      </form.Subscribe>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
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
      </div>
    </div>
  )
}
