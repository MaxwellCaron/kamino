import { PodTasks } from "../pod-tasks"
import { PodVms } from "../pod-vms"
import { createPublishPodPreview } from "./publish-pod-preview"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PodTask } from "@/features/pods/types/pod-types"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"

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
            <PodVms network={preview.network} vms={preview.vms} readOnly />
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
