import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PodHeaderActions } from "./pod-header-actions"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { powerClonedPod } from "@/features/pods/api/clone-pod-api"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showSingleMutationToast: vi.fn(),
  showUnitMutationToast: vi.fn(),
}))

vi.mock("@/features/pods/api/clone-pod-api", () => ({
  powerClonedPod: vi.fn(),
  deleteClonedPod: vi.fn(),
}))

const clonedPod = {
  id: "clone-1",
  pod_id: "pod-1",
  owner: { id: "user-1", type: "user" as const, label: "Owner", description: "" },
  cloned_at: "2026-01-01T00:00:00Z",
  status: "stopped" as const,
  network: {
    number: 1,
    vnet: "pod1",
    external_subnet: "10.0.0.0/24",
    internal_subnet: "192.168.1.0/24",
    profile_key: "lan-router-v1" as const,
  },
  vms: [
    {
      id: "vm-visible-alpha",
      name: "Distinctive Router Alpha",
      status: "stopped",
      resources: {
        cpu: 0,
        maxcpu: 1,
        mem: 0,
        maxmem: 1,
        disk: 0,
        maxdisk: 1,
        netin: 0,
        netout: 0,
        diskread: 0,
        diskwrite: 0,
        uptime: 0,
      },
      inventory: { itemId: "item-visible-alpha" },
    },
    {
      id: "vm-visible-beta",
      name: "Distinctive Workstation Beta",
      status: "stopped",
      resources: {
        cpu: 0,
        maxcpu: 1,
        mem: 0,
        maxmem: 1,
        disk: 0,
        maxdisk: 1,
        netin: 0,
        netout: 0,
        diskread: 0,
        diskwrite: 0,
        uptime: 0,
      },
      inventory: { itemId: "item-visible-beta" },
    },
  ],
  task_summary: { total: 0, completed: 0, progress: 0 },
  task_states: [],
  question_answers: [],
}

describe("PodHeaderActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows one pod-named toast without VM identifiers for start", async () => {
    vi.mocked(powerClonedPod)
      .mockResolvedValueOnce({
        ...clonedPod,
        status: "partial",
        power_result: { action: "start", status: "partial" },
      })
      .mockResolvedValueOnce({
        ...clonedPod,
        status: "running",
        power_result: { action: "start", status: "succeeded" },
      })

    render(
      <QueryClientProvider client={new QueryClient()}>
        <PodHeaderActions podTitle="Lab Pod" clonedPod={clonedPod} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    fireEvent.click(screen.getByRole("button", { name: "Start" }))

    expect(showSingleMutationToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Starting",
        name: "Lab Pod",
      })
    )

    const params = vi.mocked(showSingleMutationToast).mock.calls[0][0]
    const serialized = JSON.stringify(params)
    expect(serialized).not.toContain("Distinctive Router Alpha")
    expect(serialized).not.toContain("Distinctive Workstation Beta")
    expect(serialized).not.toContain("item-visible-alpha")
    expect(serialized).not.toContain("item-visible-beta")

    const runPodPower = params.promise as () => Promise<unknown>
    await expect(runPodPower()).rejects.toThrow("Pod did not fully start.")
    expect(powerClonedPod).toHaveBeenCalledWith({
      clonedPodId: "clone-1",
      action: "start",
    })

    await expect(runPodPower()).resolves.toBeUndefined()
    expect(powerClonedPod).toHaveBeenCalledTimes(2)
  })
})
