import React from "react"
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
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Item,
  ItemContent,
  ItemDescription,
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  IconChevronDown,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconFolderOpen,
  IconNetwork,
  IconPackage,
  IconPlus,
  IconTemplate,
  IconTopologyBus,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"

const frameworks = [
  "kali",
  "1-1NAT-pfsense",
  "debian-13",
  "Server-2025",
  "ubuntu-server-24",
]
const reviewPreviewVms = [
  "router",
  "virtual-machine-1",
  "virtual-machine-2",
  "virtual-machine-3",
  "virtual-machine-4",
  "virtual-machine-5",
  "virtual-machine-6",
]

const treePreviewRowClass =
  "bg-transparent flex min-h-8 items-center gap-1 rounded-3xl bg-sidebar px-2 py-1.5 text-sm transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0"

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

function ReviewTreePreview() {
  return (
    <div>
      <div className="flex flex-col gap-0.5">
        <div className={treePreviewRowClass}>
          <IconChevronDown className="size-4 text-muted-foreground" />
          <IconFolderOpen className="size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
          <span className="ml-1 flex-1 truncate">cis3670-01-lab</span>
        </div>

        {reviewPreviewVms.map((vmName) => (
          <div
            key={vmName}
            className={cn(
              treePreviewRowClass,
              "bg-transparent ps-12 text-muted-foreground"
            )}
          >
            <VmIcon status="running" />
            <span className="ml-1 flex-1 truncate text-foreground">
              {vmName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CreatePodForm() {
  const anchor = useComboboxAnchor()

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
              <Combobox multiple autoHighlight items={frameworks}>
                <ComboboxChips ref={anchor} className="w-full">
                  <ComboboxValue>
                    {(values) => (
                      <React.Fragment>
                        {values.map((value: string) => (
                          <ComboboxChip key={value}>{value}</ComboboxChip>
                        ))}
                        <ComboboxChipsInput placeholder="Search templates" />
                      </React.Fragment>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={anchor}>
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
        <div className="flex flex-col gap-4 pt-6">
          {Array.from({ length: 3 }).map((_, x) => (
            <Card key={x}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconTemplate className="text-muted-foreground" />
                  <span>Template {x + 1}</span>
                </CardTitle>
                <CardDescription>
                  Add up to 3 VMs for this template and configure their
                  settings.
                </CardDescription>
                <CardAction>
                  <Button>
                    <IconPlus data-icon="inline-start" />
                    Add VM
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ItemGroup>
                  {Array.from({ length: x + 1 }).map((__, y) => (
                    <Item
                      key={y}
                      variant="muted"
                      className="flex-col items-stretch p-3 sm:p-4"
                    >
                      <div className="flex justify-between">
                        <InputGroup className="max-w-xs">
                          <InputGroupAddon>
                            <IconDeviceDesktop className="text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput
                            placeholder={`virtual-machine-${y + 1}`}
                            defaultValue={`virtual-machine-${y + 1}`}
                          />
                        </InputGroup>
                        <Button variant="destructive" size="icon-xs">
                          <IconX />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <div>
                          <Label className="pb-2 text-xs text-muted-foreground">
                            CPU
                          </Label>
                          <InputGroup>
                            <InputGroupAddon>
                              <IconCpu />
                            </InputGroupAddon>
                            <InputGroupInput
                              type="number"
                              placeholder="2"
                              defaultValue={2}
                              min={1}
                              max={8}
                            />
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              vCPU
                            </InputGroupAddon>
                          </InputGroup>
                        </div>

                        <div>
                          <Label className="pb-2 text-xs text-muted-foreground">
                            Memory
                          </Label>
                          <InputGroup>
                            <InputGroupAddon>
                              <IconTopologyBus className="rotate-180" />
                            </InputGroupAddon>
                            <InputGroupInput
                              type="number"
                              placeholder="4"
                              defaultValue={4}
                              min={1}
                              max={32}
                            />
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              GB
                            </InputGroupAddon>
                          </InputGroup>
                        </div>

                        <div>
                          <Label className="pb-2 text-xs text-muted-foreground">
                            Storage
                          </Label>
                          <InputGroup>
                            <InputGroupAddon>
                              <IconDatabase />
                            </InputGroupAddon>
                            <InputGroupInput
                              type="number"
                              placeholder="50"
                              defaultValue={50}
                              min={10}
                              max={100}
                            />
                            <InputGroupAddon
                              align="inline-end"
                              className="hidden sm:block"
                            >
                              GB
                            </InputGroupAddon>
                          </InputGroup>
                        </div>
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      </CreatePodFormSection>

      <CreatePodFormSection number={3} title="Review" isLast>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-muted/50">
            <CardContent className="flex flex-1">
              <ItemGroup className="flex-1">
                <Item variant="muted" className="flex-1">
                  <ItemMedia
                    variant="icon"
                    className="translate-y-0! self-center!"
                  >
                    <IconPackage />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Pod Name</ItemTitle>
                    <ItemDescription>cis3670-01-lab</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="muted" className="flex-1">
                  <ItemMedia
                    variant="icon"
                    className="translate-y-0! self-center!"
                  >
                    <IconNetwork />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Automated Networking</ItemTitle>
                    <ItemDescription>Yes</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="muted" className="flex-1">
                  <ItemMedia
                    variant="icon"
                    className="translate-y-0! self-center!"
                  >
                    <IconDeviceDesktop />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Virtual Machines</ItemTitle>
                    <ItemDescription>7</ItemDescription>
                  </ItemContent>
                </Item>
              </ItemGroup>
            </CardContent>
          </Card>
          <Card className="w-full bg-muted/50">
            <CardHeader>
              <CardTitle>Tree Preview</CardTitle>
              <CardDescription>
                A visual representation of your pod's tree structure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewTreePreview />
            </CardContent>
          </Card>
        </div>
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
