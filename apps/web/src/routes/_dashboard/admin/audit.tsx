import { AuditPage } from "@/components/audit/audit-page"
import { actionEventsQueryOptions } from "@/lib/audit/audit-api"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"

export const Route = createFileRoute("/_dashboard/admin/audit")({
  staticData: {
    breadcrumb: { label: "Audit Logs" },
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(
        actionEventsQueryOptions({ pageIndex: 0, pageSize: 25, search: "" })
      ),
    ])
  },
  head: () => pageTitle("Audit Logs"),
  component: AuditPage,
})
