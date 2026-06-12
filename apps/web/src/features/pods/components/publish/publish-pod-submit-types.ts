export const PUBLISH_POD_STEP_IDS = [1, 2, 3, 4] as const

export type PublishPodStepId = (typeof PUBLISH_POD_STEP_IDS)[number]
export type PublishPodSubmitStatus =
  | "publishing"
  | "updating"
  | "success"
  | "error"
export type PublishPodUpdateVirtualMachine = {
  id: string
  name: string
}
