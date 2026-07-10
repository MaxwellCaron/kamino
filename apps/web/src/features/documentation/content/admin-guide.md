# Administrator guide

This guide covers the surfaces only administrators can reach: principal
management, provider sync, management roles, inventory permissions,
Proxmox sync, and audit history. Administrators also have every manager
capability described in the Manager guide.

## Administrator capabilities

As an administrator you have full management access: every manager
workflow, plus principals, software-defined networking (SDN), Proxmox
sync, audit logs, and inventory permissions across the cluster.

## Principals and provider sync

Open [Users](/admin/principals/users) and [Groups](/admin/principals/groups)
to browse the people and groups known to your configured principal
provider. These pages support syncing against that provider, managing group
memberships, and creating, editing, or removing principals where the
provider allows it. After running a sync, check the users and groups pages
to confirm the result matches what you expected — sync behavior depends on
how your provider is configured and is not necessarily identical across
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

## Proxmox sync

Open [Proxmox Sync](/admin/proxmox-sync) to import out-of-band Proxmox
changes into Kamino's inventory. The page loads current drift on open,
which is classified as additions, removals, or updates; any removal that
is unsafe to apply is marked blocked. Select only the changes you have
confirmed are expected, then **Apply**. Review the per-item outcome after
applying. Do not select drift you cannot explain, and resolve any blocked
removals before they can be applied, this is an import of selected
changes, not a blanket action that makes Kamino match Proxmox.

## Audit logs

Open [Audit Logs](/admin/audit) to review direct virtual machine and pod
actions taken outside the request workflow. The log is searchable and
paginated, and each entry shows time, actor, action, target, item or path,
status, and any error. Audit Logs does not contain request approvals or
execution history, for those, see [Requests](/manager/requests).
