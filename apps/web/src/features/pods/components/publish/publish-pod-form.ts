import { useForm } from "@tanstack/react-form"
import { uuid } from "@workspace/ui/lib/utils"
import { z } from "zod"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type {
  Pod,
  PodAudiencePrincipal,
  PodCreator,
  PodStatus,
} from "@/features/pods/types/pod-types"
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

const publishPodAudiencePrincipalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["group", "user"]),
  label: z.string().min(1),
  description: z.string(),
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

const defaultPublishPodTaskContent = `# Markdown rendering guide

This editor uses the platform markdown renderer, including **GitHub Flavored Markdown**, syntax-highlighted code blocks, tables, task lists, images, and blockquotes.

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Text styles

*Italic text* and _alternate italic text_

**Bold text** and __alternate bold text__

_Nested **bold inside italic** text_

You can also use ~~strikethrough~~ and inline code like \`npm run dev\`.

## Lists

### Unordered

* First item
* Second item
  * Nested item
  * Another nested item

### Ordered

1. First step
2. Second step
3. Third step
   1. Nested step
   2. Another nested step

### Task list

- [x] Markdown formatting
- [x] Tables
- [x] Syntax highlighting
- [ ] Your own task content

## Links

[Cheese](https://cheese.com/) is rendered as a styled external link.

## Blockquotes

> Blockquotes are useful for notes, callouts, and quoted material.
>
>> Nested blockquotes are supported too.

## Tables

| Feature | Supported | Notes |
| --- | :---: | --- |
| Headings | Yes | h1 through h6 |
| Tables | Yes | Via GFM |
| Task lists | Yes | Styled checkboxes |
| Code blocks | Yes | Syntax highlighting + filenames |

## Horizontal rule

---

## Images

![Example landscape from Wikimedia Commons](https://www.cheese.com/media/img/cheese/Reggianito.webp)

## Code blocks

Plain fenced blocks render without syntax highlighting:

\`\`\`
Plain text code block
with multiple lines
\`\`\`

Language-aware blocks are syntax highlighted:

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}\`
}
\`\`\`

You can also provide a filename with \`file:\` metadata:

\`\`\`tsx file:src/components/markdown-demo.tsx
type MarkdownDemoProps = {
  title: string
}

export function MarkdownDemo({ title }: MarkdownDemoProps) {
  return <h1>{title}</h1>
}
\`\`\`

\`\`\`bash file:scripts/bootstrap.sh
#!/usr/bin/env bash
set -euo pipefail

echo "Bootstrapping the environment"
bun install
\`\`\`

Quoted filenames are supported too:

\`\`\`json file:"examples/editor state.json"
{
  "status": "listed",
  "audience": [],
  "creators": []
}
\`\`\`

## Suggested use

Use this space for task instructions, lab notes, walkthroughs, code snippets, reference commands, and any rich markdown content you want end users to read.`

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
  image: z.url("Enter a valid image URL."),
  creators: z
    .array(publishPodAudiencePrincipalSchema)
    .min(1, "Add at least one creator.")
    .max(5, "You can add up to 5 creators."),
  created_at: z.string().min(1),
  clone_count: z.number().int().min(0),
  status: z.enum(["listed", "unlisted"] satisfies Array<PodStatus>),
  audience: z.array(publishPodAudiencePrincipalSchema),
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
    content: defaultPublishPodTaskContent,
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

export function toPodAudiencePrincipal(
  principal: PrincipalOption
): PodAudiencePrincipal {
  return {
    id: principal.id,
    type: principal.type,
    label: principal.label,
    description: principal.description,
  }
}

export function toPodCreator(principal: PrincipalOption): PodCreator {
  return toPodAudiencePrincipal(principal)
}

export const initialPublishPodValues: PublishPodFormValues = {
  id: "draft",
  title: "New Learning Pod",
  slug: "new-learning-pod",
  description:
    "A comprehensive environment for learning modern software engineering.",
  image:
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60",
  creators: [],
  created_at: new Date().toISOString(),
  clone_count: 0,
  status: "listed",
  audience: [],
  vms_visible: true,
  virtual_machines: Array.from({ length: 5 }, (_, index) =>
    createDefaultPublishPodVm(index)
  ),
  tasks: [
    {
      id: uuid(),
      title: "Explore the Environment",
      content: defaultPublishPodTaskContent,
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
