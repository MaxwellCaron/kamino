import { createFileRoute } from "@tanstack/react-router"
import { AuditPage } from "@/features/audit/components/audit-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/audit")({
  staticData: {
    breadcrumb: { label: "Audit Logs" },
  },
  head: () => pageTitle("Audit Logs"),
  component: AuditPage,
})
