# Feature Structure Review Plan

## Goal

Review `apps/web/src/features` for clear, scalable organization and apply narrow naming/placement cleanup where the current labels are misleading.

## Review Criteria

- Feature folders should be domain based and match the app concepts: `auth`, `inventory`, `principals`, `requests`, `sdn`, `vms`, and `shared`.
- Subfolders should communicate artifact type: `api`, `components`, `hooks`, `types`, and `utils`.
- File names should describe the exported surface, not only one implementation detail.
- Exported functions, constants, hooks, and types should use consistent domain prefixes where useful.
- Cross-feature imports should stay explicit and easy to follow.

## Planned Edits

1. Rename misleading API files currently named `*-queries.ts` when they also export mutations or API helpers:
   - `auth/api/auth-queries.ts` -> `auth/api/auth-api.ts`
   - `inventory/api/inventory-queries.ts` -> `inventory/api/inventory-api.ts`
   - `principals/api/principals-queries.ts` -> `principals/api/principals-api.ts`
   - `requests/api/request-queries.ts` -> `requests/api/requests-api.ts`
   - `sdn/api/sdn-queries.ts` -> `sdn/api/sdn-api.ts`
   - `vms/api/vm-queries.ts` -> `vms/api/vm-api.ts`
   - `vms/api/proxmox-options-queries.ts` -> `vms/api/proxmox-options-api.ts`
2. Rename `shared/utils/utils.ts` to `shared/utils/format.ts` because its exported surface is formatting helpers.
3. Remove the empty `principals/utils` directory.
4. Remove `vms/utils/vm-power-actions.ts`; it duplicates `vms/hooks/use-vm-power-actions.ts` and places hook logic in `utils`.
5. Move generic bulk API response types from `principals/types` to `shared/types` so `sdn` does not depend on principal-specific types for shared response shapes.
6. Preserve the existing feature/subfolder model; it is a good foundation for future expansion.
7. Avoid unrelated component refactors, including the pre-existing edit in `inventory-actions.tsx`.

## Verification

- Update all imports that reference renamed files.
- Run the web typecheck or lint script available in the workspace.
- Run a final `rg` check for stale renamed paths.
