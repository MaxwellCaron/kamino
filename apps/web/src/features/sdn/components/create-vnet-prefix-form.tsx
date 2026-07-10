import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { ApiSDNZone } from "@/features/sdn/types/sdn-types"
import type {
  AppFieldComponent,
  AppSubscribeComponent,
} from "@/features/sdn/components/vnet-form-fields"
import {
  formatFieldError,
  isTouchedInvalid,
} from "@/components/forms/form-errors"
import {
  VNetBooleanFields,
  VNetZoneField,
  VNetZonesUnavailableState,
} from "@/features/sdn/components/vnet-form-fields"
import {
  aliasSchema,
  getPrefixCreatePreview,
  getTagRule,
  getZoneType,
  isVlanAwareDisabled,
  namePrefixSchema,
  quantitySchema,
  validateBaseTag,
} from "@/features/sdn/components/vnet-dialog-utils"

function PrefixTextField({
  FieldComponent,
  name,
  label,
  placeholder,
  required,
}: {
  FieldComponent: AppFieldComponent
  name: "vnetPrefix" | "aliasPrefix"
  label: string
  placeholder: string
  required?: boolean
}) {
  return (
    <FieldComponent
      name={name}
      validators={{
        onSubmit: ({ value }: { value: string }) => {
          if (required) {
            const result = namePrefixSchema.safeParse(value)
            return result.success ? undefined : result.error.issues[0]?.message
          }

          const result = aliasSchema.safeParse(value)
          return result.success ? undefined : result.error.issues[0]?.message
        },
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <FieldContent>
              <Input
                id={name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder={placeholder}
                aria-invalid={isInvalid}
              />
            </FieldContent>
            {isInvalid && (
              <FieldError>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            )}
          </Field>
        )
      }}
    </FieldComponent>
  )
}

function BaseTagField({
  FieldComponent,
  zoneType,
}: {
  FieldComponent: AppFieldComponent
  zoneType: string | undefined
}) {
  const tagRule = getTagRule(zoneType)
  const tagDisabled = tagRule === "disabled"

  return (
    <FieldComponent
      name="baseTag"
      validators={{
        onBlur: ({ value }: { value: string }) =>
          validateBaseTag(value, zoneType),
        onSubmit: ({ value }: { value: string }) =>
          validateBaseTag(value, zoneType),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="baseTag">Base Tag</FieldLabel>
            <FieldContent>
              <Input
                id="baseTag"
                type="number"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                disabled={tagDisabled}
                placeholder={tagRule === "required" ? "1000" : "Optional"}
                aria-invalid={isInvalid}
              />
            </FieldContent>
            {isInvalid && (
              <FieldError>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            )}
          </Field>
        )
      }}
    </FieldComponent>
  )
}

function QuantityField({
  FieldComponent,
}: {
  FieldComponent: AppFieldComponent
}) {
  return (
    <FieldComponent
      name="quantity"
      validators={{
        onSubmit: ({ value }: { value: string }) => {
          const result = quantitySchema.safeParse(value)
          return result.success ? undefined : result.error.issues[0]?.message
        },
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
            <FieldContent>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={50}
                step={1}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="10"
                aria-invalid={isInvalid}
              />
            </FieldContent>
            {isInvalid && (
              <FieldError>
                {formatFieldError(field.state.meta.errors[0])}
              </FieldError>
            )}
          </Field>
        )
      }}
    </FieldComponent>
  )
}

export function CreateVNetsPrefixForm({
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
        <FieldLegend>Prefix & Quantity</FieldLegend>
        <FieldDescription>
          Define the prefixes and the starting Tag with the quantity of VNets to
          create.
        </FieldDescription>
        <FieldGroup>
          <PrefixTextField
            FieldComponent={FieldComponent}
            name="vnetPrefix"
            label="Name Prefix"
            placeholder="pod"
            required
          />
          <PrefixTextField
            FieldComponent={FieldComponent}
            name="aliasPrefix"
            label="Alias Prefix"
            placeholder="Pod "
          />
          <SubscribeComponent selector={(state: any) => state.values.zone}>
            {(zoneValue: string) => {
              const zoneType = getZoneType(zonesByName, zoneValue)
              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <BaseTagField
                    FieldComponent={FieldComponent}
                    zoneType={zoneType}
                  />
                  <QuantityField FieldComponent={FieldComponent} />
                </div>
              )
            }}
          </SubscribeComponent>
        </FieldGroup>
        <SubscribeComponent
          selector={(state: any) => ({
            vnetPrefix: state.values.vnetPrefix,
            baseTag: state.values.baseTag,
            quantity: state.values.quantity,
            zone: state.values.zone,
          })}
        >
          {(values: {
            vnetPrefix: string
            baseTag: string
            quantity: string
            zone: string
          }) => {
            const preview = getPrefixCreatePreview(
              values,
              getZoneType(zonesByName, values.zone)
            )
            return preview ? (
              <p className="text-sm text-muted-foreground">{preview}</p>
            ) : null
          }}
        </SubscribeComponent>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Advanced</FieldLegend>
        <FieldDescription>
          In depth configuration options for the VNets to be created.
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
