export type AppBreadcrumbLink =
  | { to: "/" | "/admin" | "/pods" }
  | {
      to: "/inventory/items/$itemId"
      params: { itemId: string }
    }

export type AppBreadcrumb = {
  label: string
  link?: AppBreadcrumbLink
}

export type AppBreadcrumbLoaderData = {
  breadcrumbs?: Array<AppBreadcrumb>
}
