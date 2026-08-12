import { createFileRoute, redirect } from "@tanstack/react-router"
import { CreatePodPage } from "@/features/pods/components/create/create-pod-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_pods/pods/create")({
  staticData: {
    breadcrumb: { label: "Create" },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/pods" })
    }
  },
  head: () => pageTitle("Create Pod"),
  component: CreatePodPage,
})
