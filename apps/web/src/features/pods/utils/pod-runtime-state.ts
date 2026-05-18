import type {
  ClonedPodTaskState,
  PodTaskQuestionAnswer,
  UUID,
} from "@/features/pods/types/pod-types"

export function createQuestionAnswerMap(answers: Array<PodTaskQuestionAnswer>) {
  return new Map<UUID, PodTaskQuestionAnswer>(
    answers.map((answer) => [answer.question_id, answer])
  )
}

export function createTaskStateMap(taskStates: Array<ClonedPodTaskState>) {
  return new Map<UUID, ClonedPodTaskState>(
    taskStates.map((taskState) => [taskState.task_id, taskState])
  )
}
