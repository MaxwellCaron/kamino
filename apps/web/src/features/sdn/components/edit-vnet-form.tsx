import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import type { ApiSDNZone } from "@/features/sdn/types/sdn-types"
import type {
  AppFieldComponent,
  AppSubscribeComponent,
} from "@/features/sdn/components/vnet-form-fields"
import {
  VNetAliasField,
  VNetBooleanFields,
  VNetNameField,
  VNetTagField,
  VNetZoneField,
  VNetZonesUnavailableState,
} from "@/features/sdn/components/vnet-form-fields"
import {
  getZoneType,
  isVlanAwareDisabled,
} from "@/features/sdn/components/vnet-dialog-utils"

export function EditVNetForm({
  FieldComponent,
  SubscribeComponent,
  zones,
  zonesByName,
  zonesUnavailable,
  onZoneChange,
}: {
  FieldComponent: AppFieldComponent
  SubscribeComponent: AppSubscribeComponent
  zones: Array<ApiSDNZone>
  zonesByName: Map<string, ApiSDNZone>
  zonesUnavailable: boolean
  onZoneChange: (nextZone: string) => void
}) {
  return (
    <FieldGroup>
      <VNetZoneField
        FieldComponent={FieldComponent}
        zones={zones}
        zonesUnavailable={zonesUnavailable}
        onZoneChange={onZoneChange}
      />
      {zonesUnavailable && <VNetZonesUnavailableState />}

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>VNet</FieldLegend>
        <FieldDescription>
          Update the Name, Alias, and Tag for this VNet.
        </FieldDescription>
        <FieldGroup>
          <VNetNameField FieldComponent={FieldComponent} isEdit />
          <VNetAliasField FieldComponent={FieldComponent} />
          <SubscribeComponent selector={(state: any) => state.values.zone}>
            {(zoneValue: string) => (
              <VNetTagField
                FieldComponent={FieldComponent}
                zoneType={getZoneType(zonesByName, zoneValue)}
              />
            )}
          </SubscribeComponent>
        </FieldGroup>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Advanced</FieldLegend>
        <FieldDescription>
          In depth configuration options for this VNet.
        </FieldDescription>
        <SubscribeComponent selector={(state: any) => state.values.zone}>
          {(zoneValue: string) => {
            const zoneType = getZoneType(zonesByName, zoneValue)
            return (
              <VNetBooleanFields
                FieldComponent={FieldComponent}
                vlanAwareDisabled={isVlanAwareDisabled(zoneType)}
              />
            )
          }}
        </SubscribeComponent>
      </FieldSet>
    </FieldGroup>
  )
}
