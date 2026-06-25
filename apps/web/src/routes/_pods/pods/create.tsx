import { createFileRoute } from "@tanstack/react-router"
import { CreatePodPage } from "@/features/pods/components/create/create-pod-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/create")({
  staticData: {
    breadcrumb: { label: "Create" },
  },
  head: () => pageTitle("Create Pod"),
  component: CreatePodPage,
})
