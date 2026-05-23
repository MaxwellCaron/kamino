import { useForm } from "@tanstack/react-form"
import { uuid } from "@workspace/ui/lib/utils"
import { z } from "zod"
import type { Pod } from "@/features/pods/types/pod-types"
import { InventoryPermissionBits } from "@/features/inventory/utils/inventory-permissions"

const defaultPublishPodVmPermissionAllowMask =
  InventoryPermissionBits.view |
  InventoryPermissionBits.consoleVm |
  InventoryPermissionBits.powerVm |
  InventoryPermissionBits.viewSnapshots |
  InventoryPermissionBits.snapshotVm

const publishPodVmPermissionSchema = z.object({
  allowMask: z.number().int().min(0),
  denyMask: z.number().int().min(0),
})

const publishPodVmSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cpuCount: z.number().int().min(1),
  memoryGb: z.number().int().min(1),
  storageGb: z.number().int().min(1),
  permissions: publishPodVmPermissionSchema,
})

const publishPodQuestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Question is required."),
  answerOutline: z.string().trim().min(1, "Answer is required."),
  description: z.string().optional(),
  hint: z.string().optional(),
})

const publishPodTaskSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, "Task title is required.")
    .max(64, "Task title must be at most 64 characters."),
  content: z.string().trim().min(1, "Task content is required."),
  questions: z.array(publishPodQuestionSchema),
})

export const publishPodFormSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .min(1, "Pod title is required.")
    .max(32, "Pod title must be at most 32 characters."),
  slug: z.string().min(1),
  description: z
    .string()
    .min(1, "Description is required.")
    .max(128, "Description must be at most 128 characters."),
  image: z.string().url("Enter a valid image URL."),
  creators: z
    .array(z.string().min(1))
    .min(1, "Add at least one creator.")
    .max(5, "You can add up to 5 creators."),
  created_at: z.string().min(1),
  clone_count: z.number().int().min(0),
  vms_visible: z.boolean(),
  virtual_machines: z.array(publishPodVmSchema).min(1),
  tasks: z
    .array(publishPodTaskSchema)
    .min(1, "Add at least one task.")
    .max(20, "You can add up to 20 tasks."),
  source_folder: z.string().min(1, "Select a base folder."),
})

export type PublishPodFormValues = z.infer<typeof publishPodFormSchema>

export function createEmptyQuestion() {
  return {
    id: uuid(),
    title: "",
    answerOutline: "",
  } satisfies PublishPodFormValues["tasks"][number]["questions"][number]
}

export function createEmptyTask() {
  return {
    id: uuid(),
    title: "",
    content: "",
    questions: [],
  } satisfies PublishPodFormValues["tasks"][number]
}

export function createDefaultPublishPodVm(index: number) {
  return {
    id: uuid(),
    name: `Virtual Machine ${index + 1}`,
    cpuCount: 2,
    memoryGb: 4,
    storageGb: 100,
    permissions: {
      allowMask: defaultPublishPodVmPermissionAllowMask,
      denyMask: 0,
    },
  } satisfies PublishPodFormValues["virtual_machines"][number]
}

export const initialPublishPodValues: PublishPodFormValues = {
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
  virtual_machines: Array.from({ length: 5 }, (_, index) =>
    createDefaultPublishPodVm(index)
  ),
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
  source_folder: "",
}

export function usePublishPodForm() {
  return useForm({
    defaultValues: initialPublishPodValues,
    validators: {
      onSubmit: publishPodFormSchema,
    },
    onSubmit: async () => {},
  })
}

export type PublishPodFormApi = ReturnType<typeof usePublishPodForm>

export function toPodDraft(values: PublishPodFormValues): Pod {
  const {
    source_folder: _sourceFolder,
    virtual_machines: _virtualMachines,
    ...podDraft
  } = values
  return podDraft
}
