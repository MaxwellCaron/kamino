import { createFileRoute, redirect } from "@tanstack/react-router"
import { DocumentationPage } from "@/features/documentation/components/documentation-page"
import { canAccessRequestQueue } from "@/features/auth/utils/management-permissions"
import { pageTitle } from "@/features/shared/utils/page-title"
import managerGuideContent from "@/features/documentation/content/manager-guide.md?raw"

export const Route = createFileRoute("/_dashboard/manager/docs")({
  staticData: {
    breadcrumb: { label: "Manager Guide" },
  },
  beforeLoad: ({ context }) => {
    if (!canAccessRequestQueue(context.user.management_permissions)) {
      throw redirect({ to: "/" })
    }
  },
  head: () => pageTitle("Manager Guide"),
  component: ManagerGuidePage,
})

function ManagerGuidePage() {
  return <DocumentationPage content={managerGuideContent} />
}
