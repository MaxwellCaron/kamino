import { describe, expect, it } from "vitest"
import { buildCreatePodRequestBody } from "./create-pod-api"
import type { CreatePodFormValues } from "@/features/pods/components/create/create-pod-form"

function createValues(
  overrides: Partial<CreatePodFormValues> = {}
): CreatePodFormValues {
  return {
    name: "network-lab",
    networkingMode: "lan-router-v1",
    cloneTargetKey: "lab-west",
    templates: [],
    ...overrides,
  }
}

describe("buildCreatePodRequestBody", () => {
  it("sends the selected target for managed networking", () => {
    expect(buildCreatePodRequestBody(createValues())).toMatchObject({
      name: "network-lab",
      network_profile_key: "lan-router-v1",
      clone_target_key: "lab-west",
    })
  })

  it("omits network settings when automated networking is disabled", () => {
    expect(
      buildCreatePodRequestBody(
        createValues({ networkingMode: "none", cloneTargetKey: "" })
      )
    ).toEqual({ name: "network-lab", templates: [] })
  })
})
