import { createFileRoute } from "@tanstack/react-router"
import { SdnPage } from "@/features/sdn/components/sdn-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/sdn")({
  head: () => pageTitle("SDN"),
  component: SdnPage,
})
