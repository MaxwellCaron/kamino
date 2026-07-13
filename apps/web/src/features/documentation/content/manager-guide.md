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

### 1. Create a development pod

Open [Create Pod](/pods/create) to start a new pod. The flow has three
stages:

1. **Personalize** — title, description, image, and creators.
2. **Virtual Machines** — pick an optional router and the template virtual
   machines the pod should include.
3. **Review** — confirm before creating.

Confirming creates the pod's inventory folder, assigns permissions on it,
and begins preparing the optional router and selected template virtual
machines in the background. Provisioning continues asynchronously after you
leave the page.

### 2. Publish a pod

Open [Publish Pod](/pods/publish) to take a development pod live. The flow
has five stages:

| Stage | Purpose |
|-------|---------|
| Personalize | Title, description, image, and creators for the catalog listing. |
| Access | Listed or unlisted status, and an optional user/group audience. |
| VMs | Source folder and virtual machine defaults clones will use. |
| Tasks | Optional guided tasks and questions shown to users. |
| Preview | Final review before publishing. |

An empty audience makes the pod public to every user; a configured audience
restricts catalog visibility to those users and groups. **Unlisted** hides
the pod from the browse catalog and from the inventory tree, while still
allowing existing clones to function. Publishing uses the source pod
folder and virtual machine defaults you configured, and can optionally
update the virtual machines of existing clones when that option is
selected.

### 3. Manage published pods and clones

Open [Published Pods](/pods/published), from here you can see all published pods and can do the following:
- Clone and configure a LAN or LAN + DMZ router into a permitted inventory folder.
- Edit
- Bulk clone on behalf of other principals
- Start, shut down, re-clone, or delete all clones
- Change its listed/unlisted status
- Delete
- Expand a row to see each clone's owner, creation time, status, VNet, virtual machine count, and task progress.


## Review requests

Open [Requests](/manager/requests) to review what users have asked to do.
The queue has **Pending** and **Completed** views with search and
pagination. Before deciding, inspect the requester, the requested action,
the inventory target, and the request's history and status. Approve or
deny requests individually or in bulk. After a request is approved, check
whether it executed successfully, an approved request can still end in
execution failure, so approval alone does not guarantee the action
completed.
