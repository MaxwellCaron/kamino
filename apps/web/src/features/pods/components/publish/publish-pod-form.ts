import { useForm } from "@tanstack/react-form"
import { uuid } from "@workspace/ui/lib/utils"
import { z } from "zod"
import type { Pod } from "@/features/pods/types/pod-types"

const publishPodQuestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Question is required."),
  answerOutline: z.string().optional(),
  description: z.string().optional(),
  hint: z.string().optional(),
})

const publishPodTaskSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .min(1, "Task title is required.")
    .max(64, "Task title must be at most 64 characters."),
  content: z.string().min(1, "Task content is required."),
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
      onChange: publishPodFormSchema,
      onSubmit: publishPodFormSchema,
    },
    onSubmit: async () => {},
  })
}

export type PublishPodFormApi = ReturnType<typeof usePublishPodForm>

export function toPodDraft(values: PublishPodFormValues): Pod {
  const { source_folder: _sourceFolder, ...podDraft } = values
  return podDraft
}
