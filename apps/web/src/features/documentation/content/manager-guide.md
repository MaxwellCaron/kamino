# Manager guide

This guide covers pod development, publishing, catalog management, and
request review for managers. Administrators have these capabilities too,
in addition to administrator-only surfaces covered in the Administrator
guide.

## Manager capabilities

As a manager you can build and publish pods, manage published pods and
their clones, and review the request queue. Administrators inherit every
manager capability, so anything below also applies to them.

## Pod lifecycle

### Create a development pod

Open [Create Pod](/pods/create) to start a new pod. The flow has four
stages:

1. **Personalize** — title, description, image, and creators.
2. **Networking** — choose a network profile and optional router template.
   When no router template is configured, networking is limited to none.
3. **Virtual Machines** — pick the template virtual machines the pod should
   include.
4. **Review** — confirm before creating.

This creates the pod's inventory folder, assigns permissions on it, and begins
preparing the router and selected template virtual machines in the background.
Provisioning continues asynchronously after you leave the page.

### Publish a pod

Open [Publish Pod](/pods/publish) to take a development pod live. The flow
has five stages:

| Stage       | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| Personalize | Title, description, image, and creators for the catalog listing. |
| Access      | Listed or unlisted status, and an optional user/group audience.  |
| VMs         | Source folder and virtual machine defaults clones will use.      |
| Tasks       | Optional guided tasks and questions shown to users.              |
| Preview     | Final review before publishing.                                  |

An empty audience makes the pod public to every user; a configured audience
restricts catalog visibility to those users and groups. **Unlisted** hides
the pod from the browse catalog and from the inventory tree, while still
allowing existing clones to function. Publishing uses the source pod folder
and virtual machine defaults you configured, and can optionally update the
virtual machines of existing clones when that option is selected.

### Manage published pods and clones

Open [Published Pods](/pods/published) to see every published pod with
listing status, audience, content counts, and clone totals. Header actions
include **Create**, **Publish**, and **Clone Router**.

From each pod row you can:

- **Open** — open the pod folder in a new browser tab.
- **Edit** — open [Publish Pod](/pods/publish) for that pod.
- **Clone** — open the manager clone dialog to provision the pod for
  selected principals (see below).
- **Start**, **Shutdown**, **Re-clone**, or **Delete** — run the action
  across every clone of that pod when at least one clone exists.
- **Listed** / **Unlisted** — change catalog visibility without deleting
  the pod.
- **Delete Pod** — remove the catalog entry only; it does not delete the
  pod folder or its virtual machines.

Expand a row to inspect individual clones. The table shows each clone's
owner, creation time, status, network, virtual machine count, and task
progress. Per-clone actions mirror the bulk set: **Start**, **Shutdown**,
**Re-clone**, and **Delete**, gated by clone status where applicable.

**Clone on behalf of principals** — Search principals and filter to
**Users** or **Groups**. Principals who already have a clone or a pending
clone are excluded. Select one or more rows, then confirm with **Clone (n)**.

**Clone router** — Manually clone a pod router. Pick a destination folder (you need create-VM permission
there), a pod VNet number, and a network profile (LAN or LAN + DMZ). Submit
**Clone router** to provision and start the router in that folder.

## Review requests

Open [Requests](/manager/requests) to review what users have asked to do.
The overview chart summarizes counts by status. The queue has **Pending**
and **Completed** tabs with search and pagination.

Before deciding, inspect the requester, the requested action, the
inventory target, and the request's history and status. Approve or deny
requests individually from the detail dialog or in bulk from the selection
action bar.

After a request is approved, check whether it executed successfully. Approval
does not guarantee completion — an approved request can still end in
execution failure, which the detail dialog surfaces as **Execution Failed**.
