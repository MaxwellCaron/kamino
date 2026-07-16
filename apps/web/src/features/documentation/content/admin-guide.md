# Administrator guide

This guide covers the surfaces only administrators can reach: principal
management, provider sync, management roles, inventory permissions,
software-defined networking, Proxmox sync, and audit history.
Administrators also have every manager capability described in the Manager
guide.

## Administrator capabilities

As an administrator you have full management access: every manager
workflow, plus principals, VNets, Proxmox sync, audit logs, and inventory
permissions across the cluster.

## Principals and provider sync

Open [Users](/admin/principals/users) and [Groups](/admin/principals/groups)
to browse the people and groups known to your configured principal
provider. These pages support syncing against that provider, managing group
memberships, and creating, editing, or removing principals where the
provider allows it.

- **Sync** — pull the latest users and groups from the provider when
  supported.
- **Create** — add a user or group when the provider allows local creation.
- Row actions include edit, membership management, enable/disable (when
  supported), and delete.
- Bulk actions can add or remove group memberships, enable or disable
  accounts, or delete selected principals.

After running a sync, check the users and groups pages to confirm the
result matches what you expected — sync behavior depends on how your
provider is configured and is not necessarily identical across
environments.

## Management roles

Management roles are assigned to groups, not individual users; a user's
effective role comes from their group memberships.

| Role | Grants |
|------|--------|
| None | No management workflows. Standard pod cloning and inventory access only. |
| Manager | Pod development, publishing, catalog management, and the request queue. |
| Administrator | Everything Manager grants, plus principals, sync, audit, and inventory permissions cluster-wide. |

Administrator implies Manager. Granting or changing an Administrator role
is restricted to actors who themselves have protected bootstrap access —
an ordinary Administrator grant does not by itself carry the authority to
change other groups' management roles. The protected bootstrap
administrator group itself cannot be edited through the UI. Holding
Administrator is also distinct from holding protected bootstrap access:
protected bootstrap access additionally bypasses inventory permission
checks entirely, which a normal Administrator grant does not.

## Inventory permissions

Open **Permissions** from a folder or virtual machine to manage its access
control list. Add a user or group, edit the permissions you want to grant
or block, then submit:

| Setting | Effect |
|---------|--------|
| Deny | Creates a direct block. Deny always wins over Allow for the same permission. |
| Inherit | Removes any direct override so ancestor folder rules decide instead. |
| Allow | Creates a direct grant for that permission. |

Permissions set on a folder flow down to its descendants. User and group
rules combine for the same principal, and Deny wins per permission even
when it comes from a different rule than the Allow. A user only sees
power and snapshot actions as requestable when they have View access to
the item and have not been explicitly denied that action; everything else
either runs directly, based on an Allow, or stays unavailable. Destructive
actions such as deleting a virtual machine require an explicit Allow —
they are never offered as a request.

## SDN

Open [VNets](/admin/sdn) to review and manage Proxmox VNets known to
Kamino. The page lists each VNet with edit and delete actions.

1. Review the current VNet table after opening the page.
2. Use **Create** to add a VNet, or edit an existing row to change its
   settings.
3. Choose **Apply SDN** when you are ready to push pending SDN changes to
   Proxmox. A confirmation dialog appears before apply runs.
4. Bulk **Delete** removes selected VNets and applies SDN afterward.

Deleting a VNet applies SDN immediately as part of the removal workflow.

## Proxmox sync

Open [Proxmox Sync](/admin/proxmox-sync) to import out-of-band Proxmox
changes into Kamino's inventory. Kamino reconciles its Proxmox mirror at
API startup and when you run sync from this page — not after every
inventory mutation elsewhere in the app.

1. Open the page to load current drift, classified as additions, removals,
   or updates. Unsafe removals are marked blocked.
2. Review each row and read any warning banner the API returns.
3. Select only the changes you have confirmed are expected.
4. Choose **Sync n change(s)** or **Sync All** (which skips non-removable
   removals) to apply your selection.
5. Review the per-item outcome after applying.

Do not select drift you cannot explain. Resolve any blocked removals before
applying related changes. Sync imports only the changes you select — it does
not force Kamino to match Proxmox wholesale.

## Audit logs

Open [Audit Logs](/admin/audit) to review direct virtual machine and pod
actions taken outside the request workflow. The log is searchable and
paginated, and each entry shows time, actor, action, target, item or path,
status, and any error.

Audit Logs does not contain request approvals or execution history. For
those, see [Requests](/manager/requests).
