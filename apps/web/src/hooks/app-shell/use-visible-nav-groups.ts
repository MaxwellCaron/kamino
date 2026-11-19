import {
  canAccessAdmin,
  canAccessRequestQueue,
} from "@/lib/auth/management-permissions"
import type { AuthUser } from "@/lib/auth/auth-types"
import type { NavGroup } from "@/lib/app-shell/sidebar"
import { useMemo } from "react"
import { visibleApplicationPages } from "@/lib/app-shell/application-pages"

export function useVisibleNavGroups(user: AuthUser): Array<NavGroup> {
  const canManage = canAccessRequestQueue(user.management_permissions)
  const canAdminister = canAccessAdmin(user.management_permissions)

  return useMemo(() => {
    const visible = visibleApplicationPages(canAdminister, canManage)

    return [
      {
        key: "home" as const,
        items: visible.filter((item) => item.group === "home"),
      },
      {
        key: "manager" as const,
        items: visible.filter((item) => item.group === "manager"),
      },
      {
        key: "admin" as const,
        items: visible.filter((item) => item.group === "admin"),
      },
    ].filter((group) => group.items.length > 0)
  }, [canAdminister, canManage])
}
