import type {
  ClonedPodTaskState,
  ClonedPodTaskSummary,
  PodTask,
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

export function createTaskSummary(
  tasks: Array<PodTask>,
  taskStates: Array<ClonedPodTaskState> | null
): ClonedPodTaskSummary {
  const taskStatesByTaskId = taskStates ? createTaskStateMap(taskStates) : null
  const total = tasks.length
  const completed = tasks.reduce(
    (count, task) =>
      count + (taskStatesByTaskId?.get(task.id)?.completed ? 1 : 0),
    0
  )

  return {
    total,
    completed,
    progress: total > 0 ? (completed / total) * 100 : 0,
  }
}
