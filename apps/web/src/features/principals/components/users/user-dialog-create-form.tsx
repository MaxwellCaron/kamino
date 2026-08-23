import { FieldGroup } from "@workspace/ui/components/field"
import { TabsContent } from "@workspace/ui/components/tabs"
import type { Dispatch, SetStateAction } from "react"
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
  requirePassword: boolean
  selectedGroupIds: Array<string>
  setSelectedGroupIds: Dispatch<SetStateAction<Array<string>>>
}

export function UserDialogCreateForm({
  form,
  groupItems,
  groupOptionMap,
  mode,
  requirePassword,
  selectedGroupIds,
  setSelectedGroupIds,
}: UserDialogCreateFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <TabsContent value="single">
        <UserDialogCreateSingleTab
          form={form}
          groupItems={groupItems}
          groupOptionMap={groupOptionMap}
          requirePassword={requirePassword}
          selectedGroupIds={selectedGroupIds}
          setSelectedGroupIds={setSelectedGroupIds}
        />
      </TabsContent>

      <TabsContent value="list">
        <UserDialogCreateListTab form={form} requirePassword={requirePassword} />
      </TabsContent>

      <TabsContent value="prefix">
        <UserDialogCreatePrefixTab
          form={form}
          groupItems={groupItems}
          groupOptionMap={groupOptionMap}
          requirePassword={requirePassword}
          selectedGroupIds={selectedGroupIds}
          setSelectedGroupIds={setSelectedGroupIds}
        />
      </TabsContent>

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
