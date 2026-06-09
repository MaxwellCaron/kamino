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
import { FieldError } from "@workspace/ui/components/field"
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
  submissionAttempts: number
}

type PendingTaskDelete = {
  id: string
  title: string
}

export function PublishPodTasksStep({
  form,
  submissionAttempts,
}: PublishPodTasksStepProps) {
  const [pendingTaskDelete, setPendingTaskDelete] =
    useState<PendingTaskDelete | null>(null)
  const defaultExpandedTask = form.getFieldValue("tasks")[0]?.id
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
          {(tasksField) => {
            const showValidation =
              tasksField.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !tasksField.state.meta.isValid

            return (
              <Card
                className="rounded-b-2xl! pb-0"
                data-invalid={isInvalid || undefined}
              >
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
                          Add at least one task to describe what users should
                          do.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Accordion
                      keepMounted
                      className="w-full rounded-t-none! border-none"
                      defaultValue={
                        defaultExpandedTask ? [defaultExpandedTask] : undefined
                      }
                    >
                      {tasksField.state.value.map((task, index) => (
                        <PublishPodTaskItem
                          key={task.id}
                          form={form}
                          index={index}
                          onRequestDelete={setPendingTaskDelete}
                          submissionAttempts={submissionAttempts}
                          task={task}
                        />
                      ))}
                    </Accordion>
                  )}
                  <div className="px-6">
                    <FieldError
                      errors={
                        showValidation ? tasksField.state.meta.errors : []
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            )
          }}
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
