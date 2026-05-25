import { useState } from "react"
import { Accordion } from "@workspace/ui/components/accordion"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { IconChecklist, IconPlus } from "@tabler/icons-react"
import { createEmptyTask } from "./publish-pod-form"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { PublishPodTaskDeleteDialog } from "./publish-pod-task-delete-dialog"
import { PublishPodTaskItem } from "./publish-pod-task-item"
import type { PublishPodFormApi } from "./publish-pod-form"

type PublishPodTasksStepProps = {
  form: PublishPodFormApi
}

type PendingTaskDelete = {
  id: string
  title: string
}

export function PublishPodTasksStep({ form }: PublishPodTasksStepProps) {
  const [pendingTaskDelete, setPendingTaskDelete] =
    useState<PendingTaskDelete | null>(null)

  const confirmTaskDelete = async () => {
    if (!pendingTaskDelete) return

    const taskIndex = form
      .getFieldValue("tasks")
      .findIndex((task) => task.id === pendingTaskDelete.id)

    if (taskIndex >= 0) {
      await form.removeFieldValue("tasks", taskIndex)
    }

    setPendingTaskDelete(null)
  }

  return (
    <>
      <PublishPodStepLayout form={form}>
        <form.Field name="tasks" mode="array">
          {(tasksField) => (
            <Card className="rounded-b-2xl! pb-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconChecklist className="text-muted-foreground" />
                  <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
                    Tasks
                  </span>
                </CardTitle>
                <CardDescription>
                  Add the objectives and questions for this pod.
                </CardDescription>
                <CardAction>
                  <Button
                    type="button"
                    onClick={() => tasksField.pushValue(createEmptyTask())}
                  >
                    <IconPlus data-icon="inline-start" />
                    Add Task
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="-mx-6 border-t">
                {tasksField.state.value.length === 0 ? (
                  <Empty className="rounded-none border-0">
                    <EmptyHeader>
                      <EmptyTitle>No tasks added yet.</EmptyTitle>
                      <EmptyDescription>
                        Add at least one task to describe what users should do.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Accordion
                    keepMounted
                    className="w-full rounded-t-none! border-none"
                  >
                    {tasksField.state.value.map((task, index) => (
                      <PublishPodTaskItem
                        key={task.id}
                        form={form}
                        index={index}
                        onRequestDelete={setPendingTaskDelete}
                        task={task}
                      />
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}
        </form.Field>
      </PublishPodStepLayout>
      <PublishPodTaskDeleteDialog
        open={pendingTaskDelete !== null}
        taskTitle={pendingTaskDelete?.title ?? null}
        onConfirm={confirmTaskDelete}
        onOpenChange={(open) => {
          if (!open) {
            setPendingTaskDelete(null)
          }
        }}
      />
    </>
  )
}
