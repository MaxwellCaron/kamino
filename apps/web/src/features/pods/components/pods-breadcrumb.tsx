import { Link, useParams } from "@tanstack/react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { pods } from "@/features/pods/types/test-data"

export function PodsBreadcrumb() {
  const { podSlug } = useParams({ strict: false })
  const currentPod = podSlug
    ? pods.find((pod) => pod.slug === podSlug)
    : undefined

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden whitespace-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink className="cursor-default" render={<Link to="/" />}>
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          {podSlug ? (
            <BreadcrumbLink
              className="block max-w-24 cursor-default truncate sm:max-w-32"
              render={<Link to="/pods/browse" />}
            >
              Pods
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="block max-w-24 truncate sm:max-w-32">
              Pods
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {podSlug ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="block max-w-48 truncate sm:max-w-64 lg:max-w-80">
                {currentPod?.title ?? podSlug}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
