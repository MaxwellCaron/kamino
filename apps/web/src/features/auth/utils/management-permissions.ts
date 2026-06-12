export const ManagementPermissionKeys = {
  administrator: "administrator",
  manager: "manager",
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

const permissionOrder = [
  ManagementPermissionKeys.administrator,
  ManagementPermissionKeys.manager,
] as const

function sortManagementPermissionGrants(
  grants: Iterable<ManagementPermissionKey>
) {
  const order = new Map(permissionOrder.map((key, index) => [key, index]))

  return [...new Set(grants)].toSorted((left, right) => {
    return (
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right) ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export function normalizeManagementPermissionGrants(
  grants: Array<ManagementPermissionKey>
) {
  return sortManagementPermissionGrants(grants)
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

export function canAccessAdmin(
  permissions:
    | {
        grants: Array<ManagementPermissionKey>
      }
    | undefined
) {
  return hasManagementPermission(
    permissions,
    ManagementPermissionKeys.administrator
  )
}

export function canAccessRequestQueue(
  permissions:
    | {
        grants: Array<ManagementPermissionKey>
      }
    | undefined
) {
  return hasManagementPermission(permissions, ManagementPermissionKeys.manager)
}

export function getManagementRoleLabel(
  permissions:
    | {
        grants: Array<ManagementPermissionKey>
      }
    | undefined
) {
  if (permissions?.grants.includes(ManagementPermissionKeys.administrator)) {
    return "Administrator"
  }

  if (permissions?.grants.includes(ManagementPermissionKeys.manager)) {
    return "Manager"
  }

  return "User"
}
