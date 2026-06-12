export const steps = [
  {
    value: "personalize",
    title: "Personalize",
    fields: ["title", "description", "image", "creators"] as const,
  },
  {
    value: "access",
    title: "Access",
    fields: ["status", "audience"] as const,
  },
  {
    value: "virtual-machines",
    title: "VMs",
    fields: ["source_folder", "virtual_machines"] as const,
  },
  {
    value: "tasks",
    title: "Tasks",
    fields: ["tasks"] as const,
  },
  {
    value: "preview",
    title: "Preview",
    fields: [] as const,
  },
]

export type PublishPodStep = (typeof steps)[number]["value"]

export const defaultPublishPodStep: PublishPodStep = steps[0].value
