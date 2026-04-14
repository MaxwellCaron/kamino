export const principalTypeLabels = {
  group: "Group",
  user: "User",
} as const

export const nestedDialogAnimationClassName =
  "top-[calc(50%+1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[nested-dialog-open]:after:absolute data-[nested-dialog-open]:after:inset-0 data-[nested-dialog-open]:after:rounded-[inherit] data-[nested-dialog-open]:after:bg-black/5 data-[starting-style]:scale-90 data-[starting-style]:opacity-0"
