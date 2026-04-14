import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@workspace/ui/components/item"
import { getPermissionState } from "./acl-transformers"
import { PermissionStateControl } from "./permission-state-control"
import type { DraftPrincipal, PermissionState } from "./types"
import type { getInventoryPermissionDefinitionsByGroup } from "@/lib/inventory-permissions"

type PermissionScopeSectionProps = {
  onPermissionChange: (bit: number, state: PermissionState) => void
  permissionGroups: ReturnType<typeof getInventoryPermissionDefinitionsByGroup>
  principal: DraftPrincipal
}

export function PermissionScopeSection({
  onPermissionChange,
  permissionGroups,
  principal,
}: PermissionScopeSectionProps) {
  return (
    <div className="space-y-6">
      {permissionGroups.map((group) => (
        <div key={group.group} className="space-y-3">
          <div className="px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </div>
          <ItemGroup className="gap-3 px-4">
            {group.permissions.map((permission) => (
              <Item key={permission.key} size="sm">
                <ItemContent>
                  <ItemTitle>{permission.label}</ItemTitle>
                  <ItemDescription>{permission.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <PermissionStateControl
                    value={getPermissionState(principal.self, permission.bit)}
                    onChange={(state) =>
                      onPermissionChange(permission.bit, state)
                    }
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </div>
      ))}
    </div>
  )
}
