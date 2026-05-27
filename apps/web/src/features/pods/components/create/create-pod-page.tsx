import { CreatePodForm } from "./create-pod-form"

export function CreatePodPage() {
  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-balance">
            Create Pod
          </h1>
          <p className="text-muted-foreground">
            Initialize a foundation for your pod by using virutal machine
            templates, simplified networking configurations, and more.
          </p>
        </div>
        <CreatePodForm />
      </div>
    </div>
  )
}
