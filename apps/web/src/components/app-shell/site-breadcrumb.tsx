import { Fragment } from "react"
import { Link, useMatches } from "@tanstack/react-router"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type {
  AppBreadcrumb,
  AppBreadcrumbLoaderData,
} from "./site-breadcrumb-data"

const COLLAPSE_THRESHOLD = 4

function BreadcrumbLinkContent({
  breadcrumb,
  className,
}: {
  breadcrumb: AppBreadcrumb
  className?: string
}) {
  if (!breadcrumb.link) {
    return (
      <BreadcrumbPage className={className}>{breadcrumb.label}</BreadcrumbPage>
    )
  }

  if (breadcrumb.link.to === "/inventory/items/$itemId") {
    return (
      <BreadcrumbLink
        className={className}
        render={
          <Link to="/inventory/items/$itemId" params={breadcrumb.link.params} />
        }
      >
        {breadcrumb.label}
      </BreadcrumbLink>
    )
  }

  return (
    <BreadcrumbLink
      className={className}
      render={<Link to={breadcrumb.link.to} />}
    >
      {breadcrumb.label}
    </BreadcrumbLink>
  )
}

export function SiteBreadcrumb() {
  const matches = useMatches()

  const breadcrumbs = matches.flatMap((match): Array<AppBreadcrumb> => {
    const entries: Array<AppBreadcrumb> = []

    if (match.staticData.breadcrumb) {
      entries.push(match.staticData.breadcrumb)
    }

    const loaderData = match.loaderData as AppBreadcrumbLoaderData | undefined
    if (loaderData?.breadcrumbs) {
      entries.push(...loaderData.breadcrumbs)
    }

    return entries
  })

  if (!breadcrumbs.length) {
    return null
  }

  const lastIndex = breadcrumbs.length - 1
  const shouldCollapse = breadcrumbs.length > COLLAPSE_THRESHOLD

  const visibleEntries = shouldCollapse
    ? [
        { entry: breadcrumbs[0], index: 0 },
        { entry: breadcrumbs[lastIndex - 1], index: lastIndex - 1 },
        { entry: breadcrumbs[lastIndex], index: lastIndex },
      ]
    : breadcrumbs.map((entry, index) => ({ entry, index }))

  const hiddenEntries = shouldCollapse
    ? breadcrumbs
        .map((entry, index) => ({ entry, index }))
        .slice(1, lastIndex - 1)
    : []

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden whitespace-nowrap">
        {visibleEntries.map(({ entry, index }, position) => {
          const isCurrent = index === lastIndex
          const isFirst = position === 0
          const showEllipsisBefore = shouldCollapse && isFirst

          return (
            <Fragment key={`${index}-${entry.label}`}>
              <BreadcrumbItem className="min-w-0">
                {isCurrent ? (
                  <BreadcrumbPage className="block max-w-48 truncate font-semibold sm:max-w-64 lg:max-w-80">
                    {entry.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLinkContent
                    breadcrumb={entry}
                    className="block max-w-24 truncate sm:max-w-32 lg:max-w-40"
                  />
                )}
              </BreadcrumbItem>
              {!isCurrent ? <BreadcrumbSeparator /> : null}
              {showEllipsisBefore ? (
                <>
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Show hidden breadcrumb items"
                        render={<Button variant="ghost" size="icon-sm" />}
                      >
                        <BreadcrumbEllipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuGroup>
                          {hiddenEntries.map(
                            ({ entry: hiddenEntry, index: hiddenIndex }) => (
                              <DropdownMenuItem
                                key={`${hiddenIndex}-${hiddenEntry.label}`}
                                render={
                                  hiddenEntry.link?.to ===
                                  "/inventory/items/$itemId" ? (
                                    <Link
                                      to="/inventory/items/$itemId"
                                      params={hiddenEntry.link.params}
                                    />
                                  ) : hiddenEntry.link ? (
                                    <Link to={hiddenEntry.link.to} />
                                  ) : (
                                    <span />
                                  )
                                }
                              >
                                {hiddenEntry.label}
                              </DropdownMenuItem>
                            )
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              ) : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
