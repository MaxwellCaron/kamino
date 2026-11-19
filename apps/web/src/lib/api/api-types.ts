export type ApiBulkOperationFailure = {
  id: string
  error: string
}

export type ApiBulkDeleteResponse = {
  deleted: Array<string>
  failed: Array<ApiBulkOperationFailure>
}
