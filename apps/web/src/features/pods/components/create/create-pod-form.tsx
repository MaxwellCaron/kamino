import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconPlus,
  IconTemplate,
  IconTopologyBus,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]

function CreatePodFormSection({
  number,
  title,
  children,
  isLast = false,
}: {
  number: number
  title: ReactNode
  children: ReactNode
  isLast?: boolean
}) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      <div className="relative flex justify-center">
        <div
          className={cn(
            "absolute top-8 w-px bg-border",
            isLast ? "bottom-0" : "-bottom-8"
          )}
        />
        <div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-4 ring-background">
          {number}
        </div>
      </div>
      <div className={cn("min-w-0", isLast ? "pb-6" : "pb-10")}>
        <h2 className="mb-4 text-lg font-semibold tracking-normal">{title}</h2>
        {children}
      </div>
    </section>
  )
}

export function CreatePodForm() {
  return (
    <form
      className="flex w-full max-w-5xl flex-col"
      onSubmit={(event) => event.preventDefault()}
    >
      <CreatePodFormSection number={1} title="Personalize">
        <FieldSet className="w-full">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" type="text" placeholder="cis3670-01-lab" />
              <FieldDescription>
                Choose a unique name for your new pod. The name can only contain
                ASCII letters, digits, and the characters -, and _.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
      </CreatePodFormSection>

      <CreatePodFormSection number={2} title="Virtual Machines">
        <FieldSet className="w-full">
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox id="router" defaultChecked />
              <FieldContent>
                <FieldLabel htmlFor="router">
                  Include Router
                  <span className="text-muted-foreground">(Recommended)</span>
                </FieldLabel>
                <FieldDescription>
                  Automatically add a router VM to provide networking for this
                  template via 1-1 NATing.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="template">Templates</FieldLabel>
              <Combobox items={frameworks}>
                <ComboboxInput placeholder="Select a template" />
                <ComboboxContent>
                  <ComboboxEmpty>No items found.</ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>
                Choose from available Proxmox templates and set quantities (max
                3 per template), or skip to continue without VMs.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
        <div className="space-y-4 pt-6">
          {Array.from({ length: 3 }).map((_, x) => (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconTemplate className="text-muted-foreground" />
                  <span>Template {x + 1}</span>
                </CardTitle>
                <CardAction>
                  <Button size="xs">
                    <IconPlus data-icon="inline-start" />
                    Add VM
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ItemGroup>
                  {Array.from({ length: x + 1 }).map((__, y) => (
                    <Item key={y} variant="muted">
                      <ItemMedia variant="icon">
                        <IconDeviceDesktop />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="p-1">
                          <Input
                            placeholder={`virtual-machine-${y + 1}`}
                            defaultValue={`virtual-machine-${y + 1}`}
                            className="w-full"
                          />
                        </ItemTitle>
                        <div className="flex items-center gap-2 pt-2 pl-1 sm:gap-4">
                          <InputGroup className="max-w-30">
                            <InputGroupInput
                              placeholder="2"
                              value={2}
                              min={1}
                              max={8}
                            />
                            <InputGroupAddon>
                              <IconCpu />
                            </InputGroupAddon>
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              vCPU
                            </InputGroupAddon>
                          </InputGroup>
                          <InputGroup className="max-w-30">
                            <InputGroupInput
                              placeholder="4"
                              value={4}
                              min={1}
                              max={32}
                            />
                            <InputGroupAddon>
                              <IconTopologyBus className="rotate-180" />
                            </InputGroupAddon>
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              GB
                            </InputGroupAddon>
                          </InputGroup>
                          <InputGroup className="max-w-30">
                            <InputGroupInput
                              placeholder="50"
                              value={50}
                              min={10}
                              max={100}
                            />
                            <InputGroupAddon>
                              <IconDatabase />
                            </InputGroupAddon>
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              GB
                            </InputGroupAddon>
                          </InputGroup>
                        </div>
                      </ItemContent>
                      <ItemActions>
                        <Button variant="destructive" size="icon-xs">
                          <IconX />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
              <CardFooter className="justify-center">
                <Button variant="link" size="xs" className="text-destructive">
                  Remove
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </CreatePodFormSection>

      <CreatePodFormSection number={3} title="Review" isLast>
        temp
      </CreatePodFormSection>

      <div className="flex justify-end pl-12">
        <Button type="submit">
          <IconPlus data-icon="inline-start" />
          Create
        </Button>
      </div>
    </form>
  )
}
