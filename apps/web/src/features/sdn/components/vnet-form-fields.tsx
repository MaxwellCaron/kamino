import { HugeiconsIcon } from "@hugeicons/react"
import { Globe02Icon } from "@hugeicons/core-free-icons"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { ComponentType } from "react"
import type { z } from "zod"
import type { ApiSDNZone } from "@/features/sdn/types/sdn-types"
import {
  formatFieldError,
  isTouchedInvalid,
} from "@/components/forms/form-errors"
import {
  aliasSchema,
  getTagRule,
  validateTag,
  vnetIdSchema,
  zoneSchema,
} from "@/features/sdn/components/vnet-dialog-utils"

export type AppFieldComponent = ComponentType<any>
export type AppSubscribeComponent = ComponentType<any>

function getFirstIssueMessage(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? undefined : result.error.issues[0]?.message
}

export function VNetNameField({
  FieldComponent,
  isEdit,
}: {
  FieldComponent: AppFieldComponent
  isEdit: boolean
}) {
  return (
    <FieldComponent
      name="vnet"
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(vnetIdSchema.safeParse(value)),
        onSubmit: ({ value }: { value: string }) =>
          getFirstIssueMessage(vnetIdSchema.safeParse(value)),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="vnet">Name</FieldLabel>
            <FieldContent>
              <Input
                id="vnet"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                disabled={isEdit}
                placeholder="pod245"
                maxLength={8}
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

export function VNetAliasField({
  FieldComponent,
}: {
  FieldComponent: AppFieldComponent
}) {
  return (
    <FieldComponent
      name="alias"
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(aliasSchema.safeParse(value)),
        onSubmit: ({ value }: { value: string }) =>
          getFirstIssueMessage(aliasSchema.safeParse(value)),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="alias">Alias</FieldLabel>
            <FieldContent>
              <Input
                id="alias"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Optional description"
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

export function VNetZonesUnavailableState() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Globe02Icon} className="text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>No SDN zones available</EmptyTitle>
        <EmptyDescription>
          Configure an SDN zone in Proxmox before creating a VNet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function VNetZoneField({
  FieldComponent,
  zones,
  zonesUnavailable,
  onZoneChange,
}: {
  FieldComponent: AppFieldComponent
  zones: Array<ApiSDNZone>
  zonesUnavailable: boolean
  onZoneChange: (nextZone: string) => void
}) {
  return (
    <FieldComponent
      name="zone"
      validators={{
        onBlur: ({ value }: { value: string }) =>
          getFirstIssueMessage(zoneSchema.safeParse(value)),
        onSubmit: ({ value }: { value: string }) =>
          getFirstIssueMessage(zoneSchema.safeParse(value)),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="zone">Zone</FieldLabel>
            <FieldContent>
              <Select
                value={field.state.value}
                onValueChange={(value) => {
                  const next = value ?? ""
                  field.handleChange(next)
                  onZoneChange(next)
                }}
                disabled={zonesUnavailable}
              >
                <SelectTrigger
                  id="zone"
                  aria-invalid={isInvalid}
                  className="w-full"
                >
                  <SelectValue placeholder="Select a zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {zones.map((zone) => (
                      <SelectItem key={zone.zone} value={zone.zone}>
                        {zone.zone}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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

export function VNetTagField({
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
      name="tag"
      validators={{
        onBlur: ({ value }: { value: string }) => validateTag(value, zoneType),
        onSubmit: ({ value }: { value: string }) =>
          validateTag(value, zoneType),
      }}
    >
      {(field: any) => {
        const isInvalid = isTouchedInvalid(field.state.meta)

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor="tag">Tag</FieldLabel>
            <FieldContent>
              <Input
                id="tag"
                type="number"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                disabled={tagDisabled}
                placeholder={tagRule === "required" ? "1245" : "Optional"}
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

export function VNetBooleanFields({
  FieldComponent,
  vlanAwareDisabled,
}: {
  FieldComponent: AppFieldComponent
  vlanAwareDisabled: boolean
}) {
  return (
    <FieldComponent name="isolatePorts">
      {(isolateField: any) => (
        <FieldComponent name="vlanAware">
          {(vlanField: any) => (
            <div className="flex flex-col gap-3">
              <FieldLabel htmlFor={vlanField.name} className="cursor-pointer">
                <Field orientation="horizontal">
                  <Checkbox
                    id={vlanField.name}
                    checked={vlanField.state.value}
                    disabled={vlanAwareDisabled}
                    onCheckedChange={(checked) =>
                      vlanField.handleChange(!!checked)
                    }
                  />
                  <FieldContent>
                    <FieldTitle>VLAN Aware</FieldTitle>
                    <FieldDescription>
                      {vlanAwareDisabled
                        ? "Unavailable when no zone is selected or the zone type is EVPN."
                        : "Allow VLAN-tagged traffic to pass through this VNet to guests."}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>

              <FieldLabel
                htmlFor={isolateField.name}
                className="cursor-pointer"
              >
                <Field orientation="horizontal">
                  <Checkbox
                    id={isolateField.name}
                    checked={isolateField.state.value}
                    onCheckedChange={(checked) =>
                      isolateField.handleChange(!!checked)
                    }
                  />
                  <FieldContent>
                    <FieldTitle>Isolated Ports</FieldTitle>
                    <FieldDescription>
                      Prevent guests on this VNet from communicating with each
                      other directly through the bridge.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </div>
          )}
        </FieldComponent>
      )}
    </FieldComponent>
  )
}
