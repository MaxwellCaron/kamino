import type { ReactNode } from "react"
import type { ApiNetworkBridge, ApiVNet } from "@/lib/queries"

export type NetworkData = {
  bridges: Array<ApiNetworkBridge>
  vnets: Array<ApiVNet>
}

export function renderError(error: unknown) {
  return typeof error === "string" ? error : undefined
}

export function SummarySection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

export function SummaryRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}
