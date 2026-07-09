import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"

export function UserDialogCreateListTab({
  form,
  requirePassword,
}: {
  form: UserFormApi
  requirePassword: boolean
}) {
  return (
    <FieldGroup>
      <form.Field name="listInput">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="list-input">User List</FieldLabel>
            <FieldContent>
              <Textarea
                className="font-mono"
                id="list-input"
                rows={8}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={
                  requirePassword
                    ? "jdoe,Password123!,Operations\nasmith,Password123!,Support"
                    : "jdoe@ad,Operations\nasmith@ad,Support"
                }
              />
            </FieldContent>
            <FieldDescription>
              One user per line in{" "}
              <span className="font-mono text-xs">
                {requirePassword
                  ? "username,password,description"
                  : "username,description"}
              </span>{" "}
              format. The description is optional.
            </FieldDescription>
          </Field>
        )}
      </form.Field>
    </FieldGroup>
  )
}
