import { createFileRoute } from "@tanstack/react-router"
import { actionEventsQueryOptions } from "@/features/audit/api/audit-api"
import { AuditPage } from "@/features/audit/components/audit-page"
import { pageTitle } from "@/features/shared/utils/page-title"

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
