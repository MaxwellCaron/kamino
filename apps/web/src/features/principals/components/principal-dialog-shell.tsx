import { HugeiconsIcon } from "@hugeicons/react"
import { NotebookIcon, RegexIcon } from "@hugeicons/core-free-icons"
import { Tabs, TabsTrigger } from "@workspace/ui/components/tabs"
import type { IconSvgElement } from "@hugeicons/react"
import type { ComponentProps, ReactNode } from "react"
import { AppDialog, AppDialogHeaderTabs } from "@/components/dialogs/app-dialog"

type PrincipalDialogMode = "single" | "list" | "prefix"

type PrincipalDialogShellProps = {
  dialogProps: ComponentProps<typeof AppDialog>
  formContent: ReactNode
  isEdit: boolean
  mode: PrincipalDialogMode
  onModeChange: (mode: PrincipalDialogMode) => void
  resultSummaryDialog: ReactNode
  singleIcon: IconSvgElement
}

export function PrincipalDialogShell({
  dialogProps,
  formContent,
  isEdit,
  mode,
  onModeChange,
  resultSummaryDialog,
  singleIcon,
}: PrincipalDialogShellProps) {
  if (isEdit) {
    return (
      <>
        <AppDialog {...dialogProps}>{formContent}</AppDialog>
        {resultSummaryDialog}
      </>
    )
  }

  return (
    <>
      <Tabs
        value={mode}
        onValueChange={(value) => onModeChange(value as PrincipalDialogMode)}
        className="gap-0"
      >
        <AppDialog
          {...dialogProps}
          headerAfter={
            <AppDialogHeaderTabs>
              <TabsTrigger value="single">
                <HugeiconsIcon icon={singleIcon} />
                Single
              </TabsTrigger>
              <TabsTrigger value="list">
                <HugeiconsIcon icon={NotebookIcon} />
                List
              </TabsTrigger>
              <TabsTrigger value="prefix">
                <HugeiconsIcon icon={RegexIcon} />
                Prefix
              </TabsTrigger>
            </AppDialogHeaderTabs>
          }
        >
          {formContent}
        </AppDialog>
      </Tabs>
      {resultSummaryDialog}
    </>
  )
}
