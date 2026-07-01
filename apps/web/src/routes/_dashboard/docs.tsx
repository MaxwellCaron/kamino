import { createFileRoute } from "@tanstack/react-router"
import { DocumentationPage } from "@/features/documentation/components/documentation-page"
import { pageTitle } from "@/features/shared/utils/page-title"
import userGuideContent from "@/features/documentation/content/user-guide.md?raw"

export const Route = createFileRoute("/_dashboard/docs")({
  staticData: {
    breadcrumb: { label: "User Guide" },
  },
  head: () => pageTitle("User Guide"),
  component: UserGuidePage,
})

function UserGuidePage() {
  return <DocumentationPage content={userGuideContent} />
}
