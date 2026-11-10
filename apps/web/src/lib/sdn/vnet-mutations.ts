import type {
  MutationItemUpdate,
  MutationUnit,
} from "@/lib/mutation-progress-toast"
import { applySDN } from "@/lib/sdn/sdn-api"

export const SDN_APPLY_ITEM_ID = "sdn-apply"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed"
}

export function getSDNApplyProgressItem() {
  return {
    id: SDN_APPLY_ITEM_ID,
    name: "SDN Apply",
    successDescription: "Applied",
    retry: applySDN,
  }
}

export async function reportSDNApply(
  report: (update: MutationItemUpdate) => void
) {
  try {
    await applySDN()
    report({ id: SDN_APPLY_ITEM_ID, status: "done" })
  } catch (error) {
    report({
      id: SDN_APPLY_ITEM_ID,
      status: "error",
      error: getErrorMessage(error),
    })
  }
}

export function getVNetUpdateUnit(
  vnet: string,
  saveConfiguration: () => Promise<unknown>
): MutationUnit {
  let saved = false
  const save = async () => {
    await saveConfiguration()
    saved = true
  }
  const apply = async () => {
    if (!saved) throw new Error("Save VNet configuration before applying SDN.")
    await applySDN()
  }

  return {
    items: [
      { id: vnet, name: vnet, successDescription: "Saved", retry: save },
      { ...getSDNApplyProgressItem(), retry: apply },
    ],
    run: async (report) => {
      try {
        await save()
        report({ id: vnet, status: "done" })
      } catch (error) {
        return {
          failed: [
            { id: vnet, error: getErrorMessage(error) },
            {
              id: SDN_APPLY_ITEM_ID,
              error: "Skipped because VNet update failed",
            },
          ],
        }
      }
      try {
        await apply()
      } catch (error) {
        return {
          failed: [{ id: SDN_APPLY_ITEM_ID, error: getErrorMessage(error) }],
        }
      }
    },
  }
}
