import { createFileRoute } from "@tanstack/react-router"
import { preloadSdnPage } from "@/features/sdn/api/sdn-route-loaders"
import { SdnPage } from "@/features/sdn/components/sdn-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/sdn")({
  staticData: {
    breadcrumb: { label: "SDN" },
  },
  loader: ({ context }) => preloadSdnPage(context.queryClient),
  head: () => pageTitle("SDN"),
  component: SdnPage,
})
