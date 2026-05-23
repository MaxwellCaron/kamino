import * as React from "react"
import { uuid } from "@workspace/ui/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { IconDeviceDesktop, IconSettings } from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import { Stepper, StepperContent } from "@workspace/ui/components/stepper"
import { EditablePodTasks } from "./editable-pod-tasks"
import { PublishPodStepper, defaultPublishPodStep } from "./publish-pod-stepper"
import type { Pod } from "@/features/pods/types/pod-types"
import { PodHeader } from "@/features/pods/components/pod-header"
import { PodTasks } from "@/features/pods/components/pod-tasks"

const frameworks = [
  "Next.js",
  "SvelteKit",
  "Nuxt.js",
  "Remix",
  "Astro",
] as const

const initialPodDraft: Pod = {
  id: "draft",
  title: "New Learning Pod",
  slug: "new-learning-pod",
  description:
    "A comprehensive environment for learning modern software engineering.",
  image:
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60",
  creators: ["Admin User"],
  created_at: new Date().toISOString(),
  clone_count: 0,
  vms_visible: true,
  tasks: [
    {
      id: uuid(),
      title: "Explore the Environment",
      content:
        "First, take a look around the environment and identify the main components.",
      questions: [
        {
          id: uuid(),
          title: "What is the operating system of the main VM?",
          answerOutline: "Ubuntu 22.04",
        },
      ],
    },
  ],
}

export function PublishPodPage() {
  const [step, setStep] = React.useState(defaultPublishPodStep)
  const [podDraft, setPodDraft] = React.useState<Pod>(initialPodDraft)

  const handleDraftChange = (field: keyof Pod, value: any) => {
    setPodDraft({ ...podDraft, [field]: value })
  }

  const anchor = useComboboxAnchor()

  return (
    <div className="@container/main relative flex flex-1 flex-col">
      <Stepper
        value={step}
        onValueChange={(value) => setStep(value as any)}
        className="w-full flex-1"
      >
        <StepperContent value="personalize" className="w-full">
          <div className="flex flex-col">
            <PodHeader pod={podDraft} clonedPod={null} />
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconSettings className="size-5 text-muted-foreground" />
                    General
                  </CardTitle>
                  <CardDescription>
                    Configure the basic details and appearance of your pod.
                  </CardDescription>
                </CardHeader>
                <CardContent className="border-t pt-6">
                  <FieldGroup>
                    <div className="space-y-6">
                      <Field>
                        <FieldLabel>Pod Title</FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            value={podDraft.title}
                            onChange={(e) =>
                              handleDraftChange("title", e.target.value)
                            }
                            maxLength={32}
                            placeholder="e.g. Modern Web Development"
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupText className="text-xs">
                              {podDraft.title.length}/32
                            </InputGroupText>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                      <Field>
                        <FieldLabel>Description</FieldLabel>
                        <InputGroup>
                          <InputGroupTextarea
                            value={podDraft.description}
                            onChange={(e) =>
                              handleDraftChange("description", e.target.value)
                            }
                            maxLength={128}
                            placeholder="What will users learn in this pod?"
                          />
                          <InputGroupAddon align="block-end">
                            <InputGroupText className="ml-auto text-xs">
                              {podDraft.description.length}/128
                            </InputGroupText>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel>Image URL</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          value={podDraft.image}
                          onChange={(e) =>
                            handleDraftChange("image", e.target.value)
                          }
                          placeholder="https://images.unsplash.com/..."
                        />
                      </InputGroup>
                    </Field>

                    <Field>
                      <FieldLabel>Creators</FieldLabel>
                      <Combobox
                        multiple
                        autoHighlight
                        items={frameworks}
                        defaultValue={[frameworks[0]]}
                      >
                        <ComboboxChips ref={anchor}>
                          <ComboboxValue>
                            {(values) => (
                              <React.Fragment>
                                {values.map((value: string) => (
                                  <ComboboxChip key={value}>
                                    {value}
                                  </ComboboxChip>
                                ))}
                                <ComboboxChipsInput />
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
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconDeviceDesktop className="size-5 text-muted-foreground" />
                    Virtual Machines
                  </CardTitle>
                  <CardDescription>
                    Select the folder that you want to create a new pod from and
                    assign them individual permissions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="border-t pt-6">
                  <div className="space-y-6">
                    <Field>
                      <FieldLabel>Folder</FieldLabel>
                      <Combobox items={frameworks}>
                        <ComboboxInput placeholder="Select base folder" />
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
                        This folder will be used as the source of truth for the
                        pod. Creating a pod will NOT touch or modify the
                        contents of this folder.
                      </FieldDescription>
                    </Field>
                    <div className="space-y-3">
                      <p className="font-medium">Virutal Machines</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Item key={i} variant="muted">
                            <ItemMedia variant="icon">
                              <IconDeviceDesktop />
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>Virtual Machine {i + 1}</ItemTitle>
                              <ItemDescription className="flex items-center justify-between">
                                <span>2 CPUs</span>
                                <span>4GB RAM</span>
                                <span>100GB Storage</span>
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button variant="ghost" size="icon">
                                <IconSettings />
                              </Button>
                            </ItemActions>
                          </Item>
                        ))}
                      </div>
                      <span className="text-muted-foreground">
                        By default, users will be able to view VMs, manage power
                        status, and snapshots.
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </StepperContent>

        <StepperContent value="tasks" className="w-full">
          <div className="flex flex-col">
            <PodHeader pod={podDraft} clonedPod={null} />
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
              <EditablePodTasks
                tasks={podDraft.tasks ?? []}
                onChange={(tasks) => setPodDraft({ ...podDraft, tasks })}
              />
            </div>
          </div>
        </StepperContent>

        <StepperContent value="preview" className="w-full">
          <div className="flex flex-col">
            <PodHeader pod={podDraft} clonedPod={null} />
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
              <PodTasks
                tasks={
                  podDraft.tasks?.map((task) => ({
                    ...task,
                    questions: task.questions?.map((q) => ({
                      ...q,
                      answerOutline: q.answerOutline?.replace(
                        /[a-zA-Z0-9]/g,
                        "*"
                      ),
                    })),
                  })) ?? []
                }
                taskStates={null}
                questionAnswers={null}
                questionsDisabled={true}
              />
            </div>
          </div>
        </StepperContent>

        <PublishPodStepper step={step} />
      </Stepper>
    </div>
  )
}
