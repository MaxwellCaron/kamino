import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PodHeaderActions } from "./pod-header-actions"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import { powerClonedPod } from "@/features/pods/api/clone-pod-api"

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
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
  },
  vms: [
    {
      id: "vm-1",
      name: "Router",
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
      inventory: { itemId: "item-1" },
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

  it("uses one pod request with per-VM progress items for start", () => {
    vi.mocked(powerClonedPod).mockResolvedValue({
      ...clonedPod,
      status: "running",
      power_result: { action: "start", succeeded: ["item-1"], failed: [] },
    })

    render(
      <QueryClientProvider client={new QueryClient()}>
        <PodHeaderActions podTitle="Lab Pod" clonedPod={clonedPod} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    fireEvent.click(screen.getByRole("button", { name: "Start" }))

    expect(showUnitMutationToast).toHaveBeenCalled()
    const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
    expect(config.units[0].items).toHaveLength(1)
    expect(config.units[0].items[0].id).toBe("item-1")
  })
})
