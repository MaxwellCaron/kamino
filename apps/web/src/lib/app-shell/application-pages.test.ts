import { describe, expect, it, vi } from "vitest"
import type { BuildSiteCommandsActions } from "./site-command-index"
import { buildSiteCommands } from "./site-command-index"
import { visibleApplicationPages } from "./application-pages"

function actions() {
  return {
    close: vi.fn(),
    logout: vi.fn(),
    navigateToDocsSection: vi.fn(),
    navigateToInventoryItem: vi.fn(),
    navigateToPage: vi.fn(),
    navigateToPod: vi.fn(),
    navigateToPublishedPod: vi.fn(),
    navigateToRequests: vi.fn(),
    navigateToSdn: vi.fn(),
    navigateToUsers: vi.fn(),
    navigateToGroups: vi.fn(),
    setTheme: vi.fn(),
  } satisfies BuildSiteCommandsActions
}

const publicPaths = ["/", "/pods", "/changelog", "/docs"]
const managerPaths = [
  "/pods/create",
  "/pods/publish",
  "/pods/published",
  "/manager/requests",
  "/manager/docs",
]
const adminPaths = [
  "/admin",
  "/admin/sdn",
  "/admin/principals/users",
  "/admin/principals/groups",
  "/admin/proxmox-sync",
  "/admin/audit",
  "/admin/docs",
]

describe.each([
  { canAdminister: false, canManage: false, expected: publicPaths },
  {
    canAdminister: true,
    canManage: false,
    expected: [...publicPaths, ...adminPaths],
  },
  {
    canAdminister: false,
    canManage: true,
    expected: [...publicPaths, ...managerPaths],
  },
  {
    canAdminister: true,
    canManage: true,
    expected: [...publicPaths, ...managerPaths, ...adminPaths],
  },
])(
  "navigation access admin=$canAdminister manager=$canManage",
  ({ canAdminister, canManage, expected }) => {
    it("offers only authorized destinations in the sidebar and command actions", () => {
      const callbacks = actions()
      expect(
        visibleApplicationPages(canAdminister, canManage).map(
          (page) => page.url
        )
      ).toEqual(expected)
      const commands = buildSiteCommands({
        actions: callbacks,
        canAdminister,
        canManage,
      }).filter((command) => command.group === "pages")

      for (const command of commands) command.onSelect()
      expect(callbacks.navigateToPage.mock.calls.map(([path]) => path)).toEqual(
        expected
      )
      expect(callbacks.close).toHaveBeenCalledTimes(expected.length)
    })
  }
)
