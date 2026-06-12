import { IconNotes, IconRegex, IconUser } from "@tabler/icons-react"
import { FieldGroup } from "@workspace/ui/components/field"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import type React from "react"
import type {
  CreateMode,
  UserFormApi,
} from "@/features/principals/components/users/user-dialog-utils"
import { UserDialogCreateListTab } from "@/features/principals/components/users/user-dialog-create-list-tab"
import { UserDialogCreatePrefixTab } from "@/features/principals/components/users/user-dialog-create-prefix-tab"
import { UserDialogCreateSingleTab } from "@/features/principals/components/users/user-dialog-create-single-tab"
import { UserDialogGroupAssignmentsField } from "@/features/principals/components/users/user-dialog-group-assignments-field"

type UserDialogCreateFormProps = {
  form: UserFormApi
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  mode: CreateMode
  selectedGroupIds: Array<string>
  setMode: React.Dispatch<React.SetStateAction<CreateMode>>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}

export function UserDialogCreateForm({
  form,
  groupItems,
  groupOptionMap,
  mode,
  selectedGroupIds,
  setMode,
  setSelectedGroupIds,
}: UserDialogCreateFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as CreateMode)}
        className="gap-4"
      >
        <TabsList className="w-full border-b" variant="line">
          <TabsTrigger value="single">
            <IconUser />
            Single
          </TabsTrigger>
          <TabsTrigger value="list">
            <IconNotes />
            List
          </TabsTrigger>
          <TabsTrigger value="prefix">
            <IconRegex />
            Prefix
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <UserDialogCreateSingleTab
            form={form}
            groupItems={groupItems}
            groupOptionMap={groupOptionMap}
            selectedGroupIds={selectedGroupIds}
            setSelectedGroupIds={setSelectedGroupIds}
          />
        </TabsContent>

        <TabsContent value="list">
          <UserDialogCreateListTab form={form} />
        </TabsContent>

        <TabsContent value="prefix">
          <UserDialogCreatePrefixTab
            form={form}
            groupItems={groupItems}
            groupOptionMap={groupOptionMap}
            selectedGroupIds={selectedGroupIds}
            setSelectedGroupIds={setSelectedGroupIds}
          />
        </TabsContent>
      </Tabs>

      {mode === "list" && (
        <FieldGroup>
          <UserDialogGroupAssignmentsField
            id="list-group-assignments"
            groupItems={groupItems}
            groupOptionMap={groupOptionMap}
            selectedGroupIds={selectedGroupIds}
            setSelectedGroupIds={setSelectedGroupIds}
          />
        </FieldGroup>
      )}
    </div>
  )
}
