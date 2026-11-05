import { SdnPage } from "@/features/sdn/components/sdn-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { preloadSdnPage } from "@/features/sdn/api/sdn-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/sdn")({
  staticData: {
    breadcrumb: { label: "SDN" },
  },
  loader: ({ context }) => preloadSdnPage(context.queryClient),
  head: () => pageTitle("SDN"),
  component: SdnPage,
})
