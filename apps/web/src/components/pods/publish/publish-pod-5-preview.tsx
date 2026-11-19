import type { PodCloneTarget } from "@/lib/pods/clone-targets-api"
import type { PodTask } from "@/lib/pods/pod-types"
import { PodTasks } from "@/components/pods/pod-tasks"
import type { PublishPodFolder } from "@/lib/pods/publish-pod-api"
import type { PublishPodFormApi } from "@/hooks/pods/use-publish-pod-form"
import type { PublishPodFormValues } from "@/lib/pods/publish/publish-pod-form"
import { PublishPodStepLayout } from "@/components/pods/publish/publish-pod-step-layout"
import { createPublishPodPreview } from "@/lib/pods/publish/publish-pod-preview"

type PublishPodPreviewStepProps = {
  cloneTargets: Array<PodCloneTarget>
  form: PublishPodFormApi
  podFolders: Array<PublishPodFolder>
}

function maskTaskAnswers(tasks: PublishPodFormValues["tasks"]): Array<PodTask> {
  return tasks.map((task) => ({
    ...task,
    questions: task.questions.map((question) => ({
      ...question,
      answerMask: question.answerOutline.replace(/[a-zA-Z0-9]/g, "*"),
    })),
  }))
}

export function PublishPodPreviewStep({
  cloneTargets,
  form,
  podFolders,
}: PublishPodPreviewStepProps) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const folder = podFolders.find(
          (option) => option.id === values.source_folder
        )
        const target = cloneTargets.find(
          (option) => option.key === values.clone_target_key
        )

        if (!folder || !target) return null

        const preview = createPublishPodPreview(values, folder, target)

        return (
          <PublishPodStepLayout form={form} clonedPod={preview} actionsDisabled>
            {values.tasks.length > 0 ? (
              <PodTasks
                tasks={maskTaskAnswers(values.tasks)}
                taskStates={null}
                questionAnswers={null}
                questionsDisabled={true}
              />
            ) : null}
          </PublishPodStepLayout>
        )
      }}
    </form.Subscribe>
  )
}
