export const ManagementPermissionKeys = {
  accessManage: "access.manage",
  administrator: "administrator",
  infrastructureManage: "infrastructure.manage",
  infrastructureView: "infrastructure.view",
  principalsManage: "principals.manage",
  principalsView: "principals.view",
} as const

export type ManagementPermissionKey =
  (typeof ManagementPermissionKeys)[keyof typeof ManagementPermissionKeys]

export type ApiManagementPermissionDefinition = {
  bootstrap_only: boolean
  dangerous: boolean
  description: string
  key: ManagementPermissionKey
  label: string
}

export type ApiManagementPermissionSection = {
  key: string
  label: string
  permissions: Array<ApiManagementPermissionDefinition>
}

const directImplications: Partial<
  Record<ManagementPermissionKey, Array<ManagementPermissionKey>>
> = {
  [ManagementPermissionKeys.infrastructureManage]: [
    ManagementPermissionKeys.infrastructureView,
  ],
  [ManagementPermissionKeys.principalsManage]: [
    ManagementPermissionKeys.principalsView,
  ],
}

const permissionOrder = [
  ManagementPermissionKeys.infrastructureView,
  ManagementPermissionKeys.infrastructureManage,
  ManagementPermissionKeys.principalsView,
  ManagementPermissionKeys.principalsManage,
  ManagementPermissionKeys.accessManage,
  ManagementPermissionKeys.administrator,
] as const

function sortManagementPermissionGrants(
  grants: Iterable<ManagementPermissionKey>
) {
  const order = new Map(permissionOrder.map((key, index) => [key, index]))

  return [...new Set(grants)].sort((left, right) => {
    return (
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right) ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export function normalizeManagementPermissionGrants(
  grants: Array<ManagementPermissionKey>
) {
  const directGrants = new Set<ManagementPermissionKey>(grants)

  for (let changed = true; changed; ) {
    changed = false

    for (const grant of [...directGrants]) {
      for (const implied of directImplications[grant] ?? []) {
        if (directGrants.has(implied)) {
          continue
        }
        directGrants.add(implied)
        changed = true
      }
    }
  }

  return sortManagementPermissionGrants(directGrants)
}

export function expandManagementPermissionGrants(
  grants: Array<ManagementPermissionKey>,
  allPermissions: Array<ManagementPermissionKey>
) {
  const directGrants = normalizeManagementPermissionGrants(grants)
  if (!directGrants.includes(ManagementPermissionKeys.administrator)) {
    return directGrants
  }

  return sortManagementPermissionGrants([...directGrants, ...allPermissions])
}

export function hasManagementPermission(
  permissions:
    | {
        grants: Array<ManagementPermissionKey>
      }
    | undefined,
  required: ManagementPermissionKey
) {
  if (!permissions) {
    return false
  }

  return (
    permissions.grants.includes(ManagementPermissionKeys.administrator) ||
    permissions.grants.includes(required)
  )
}
