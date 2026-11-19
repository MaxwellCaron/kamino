import { SdnPage } from "@/components/sdn/sdn-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { preloadSdnPage } from "@/lib/sdn/sdn-route-loaders"

export const Route = createFileRoute("/_dashboard/admin/sdn")({
  staticData: {
    breadcrumb: { label: "SDN" },
  },
  loader: ({ context }) => preloadSdnPage(context.queryClient),
  head: () => pageTitle("SDN"),
  component: SdnPage,
})
