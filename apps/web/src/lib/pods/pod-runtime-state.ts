import type {
  ClonedPodQuestionSummary,
  ClonedPodTaskState,
  PodTask,
  PodTaskQuestionAnswer,
  UUID,
} from "@/lib/pods/pod-types"

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

export function createQuestionSummary(
  tasks: Array<PodTask>,
  answers: Array<Pick<PodTaskQuestionAnswer, "question_id" | "is_correct">> | null
): ClonedPodQuestionSummary {
  const correctQuestionIds = new Set<UUID>()
  for (const answer of answers ?? []) {
    if (answer.is_correct) {
      correctQuestionIds.add(answer.question_id)
    }
  }

  const questionIds = new Set<UUID>()

  for (const task of tasks) {
    for (const question of task.questions ?? []) {
      questionIds.add(question.id)
    }
  }

  let answered = 0
  for (const questionId of questionIds) {
    if (correctQuestionIds.has(questionId)) {
      answered++
    }
  }

  const total = questionIds.size

  return {
    total,
    answered,
    progress: total > 0 ? (answered / total) * 100 : 100,
  }
}
