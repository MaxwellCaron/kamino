import { createFileRoute, redirect } from "@tanstack/react-router"
import { DocumentationPage } from "@/components/documentation/documentation-page"
import { canAccessRequestQueue } from "@/lib/auth/management-permissions"
import managerGuideContent from "@/lib/documentation/content/manager-guide.md?raw"
import { pageTitle } from "@/lib/app-shell/page-title"

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
