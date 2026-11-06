import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { InventoryPermissionSection } from "@/features/inventory/utils/inventory-permissions"
import { PermissionStateControl } from "./permission-state-control"
import { getPermissionState } from "@/features/inventory/utils/acl-transformers"

type PermissionScopeSectionProps = {
  onPermissionChange: (bit: number, state: PermissionState) => void
  permissionGroups: Array<InventoryPermissionSection>
  principal: DraftPrincipal
}

export function PermissionScopeSection({
  onPermissionChange,
  permissionGroups,
  principal,
}: PermissionScopeSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      {permissionGroups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
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
