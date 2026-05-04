import { BrowsePodsCard } from "./browse-pods-card"

export function BrowsePodsPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="mx-1 mt-6 text-center text-5xl font-extrabold tracking-tighter md:text-7xl">
            Pods
          </h1>
          <p className="text-xl text-muted-foreground">
            Curated virtual machine environments meant for hands-on learning.
            Browse through a selection of ready-to-use pods to get started.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-4 grid-rows-2 gap-6">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="col-span-1 row-span-1">
              <BrowsePodsCard />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
