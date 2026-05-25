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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { IconChecklist, IconPlus, IconTrash } from "@tabler/icons-react"
import { createEmptyTask } from "./publish-pod-form"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { PublishPodTaskItem } from "./publish-pod-task-item"
import type { PublishPodFormApi } from "./publish-pod-form"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

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
  const taskDeleteDescription = pendingTaskDelete?.title
    ? `This will permanently remove "${pendingTaskDelete.title}" and all of its questions.`
    : "This will permanently remove the selected task and all of its questions."

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
      <AlertDialog
        open={pendingTaskDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingTaskDelete(null)
          }
        }}
      >
        <AppAlertDialogContent
          open={pendingTaskDelete !== null}
          icon={IconTrash}
          title="Delete Task?"
          description={taskDeleteDescription}
        >
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTaskDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmTaskDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  )
}
