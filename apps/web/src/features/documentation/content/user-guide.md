# User guide

This guide covers how to browse, clone, and operate pods as a standard
Kamino user.

## Finding things

Open the site command palette (Ctrl + k) to search pods, inventory, and documentation
from anywhere in the app.

- Search for a VM or folder directly in the inventory search bar.
- Type a pod name or keyword to jump to a catalog entry.
- Search guide headings and body text

## Cloning pods

### Published pods

A published pod is a reusable environment made of one or more virtual
machines, their networking, and optional guided tasks.

#### Clone

1. Open [Pods](/pods) and choose a pod from the catalog.
2. Review its description and any tasks before committing. Task questions
   are read-only until you clone the pod.
3. Choose **Clone** to provision your own copy.
4. Wait for cloning to finish; progress is shown while your virtual machines
   and networking are created.
5. Start your pod when you are ready to use it.

You can only have one accessible clone of a given pod at a time. Cloning a
pod you already have a clone of is blocked until you delete or re-clone the
existing one.

#### Start and stop

After cloning, the pod page shows your assigned virtual machines along with
VNet, external, and internal network details. DMZ details appear when the
pod uses a LAN + DMZ router profile.

From the pod header you can:

- **Start** — power on every virtual machine in your clone.
- **Shutdown** — shut down every virtual machine in your clone.
- **Re-clone** — replace your clone's virtual machine instances with a
  fresh copy of the pod's current published version. Your clone record is
  kept; only the VMs are refreshed. You must own the clone to use this
  action.
- **Delete** — permanently remove your clone, its virtual machines, and all
  saved task progress. You must own the clone to use this action.

When some VMs are running and others are stopped, both **Start** and
**Shutdown** may appear until the clone reaches a uniform state.

#### Open a VM

The **Virtual Machines** card lists VMs you can view in your clone. Each
entry links to that VM's inventory dashboard in a new browser tab. The list
may not include every VM in the environment.

#### Open a VM console

From a VM's inventory dashboard, open the **Console** card when the VM is
running and you have console permission.

- **Connect** opens an embedded VNC session in Kamino. The session stays
  available as you navigate between VMs. Use **Disconnect** to end it.
  Sessions close automatically after 30 minutes away from the tab while
  connected.
- **Download SPICE config** generates a short-lived `.vv` file for a locally
  installed remote-viewer or virt-viewer client. Your workstation must be able
  to reach the configured Proxmox SPICE proxy on TCP 3128.

#### Tasks and progress

The **Tasks** card on a cloned pod page lists guided objectives. Expand a
task to read its instructions and answer any **Questions** when enabled.

- Answers are saved against your clone as you submit them.
- Hints are available when a question provides one.
- Questions stay disabled until you clone the pod.

The completion badge on the card shows how many tasks or questions you have
finished.

### Personal pods

Personal pods are personalized environments that you can use to create and run VMs.

When your environment provides one, a **Personal Pod** card appears at the
top of [Pods](/pods). Depending on your permissions and current state, you
can:

- **Open** — jump to your existing personal pod folder in inventory.
- **Create** — provision a personal folder with a router and reserved
  network when direct creation is allowed.
- **Request** — submit a personal pod request for manager approval when
  creation requires approval.

While a personal pod request is pending, the card shows **Request
submitted** and **Open** stays disabled until the request is resolved.

## Permissions and requests

Inventory actions on your virtual machines depend on the permissions you
have been granted, not just what is visible:

| State       | What you see                                                 |
| ----------- | ------------------------------------------------------------ |
| Available   | The action runs immediately.                                 |
| Request     | The action is sent to a manager for approval before it runs. |
| Unavailable | The action is hidden or disabled.                            |

By default, only power actions (start, shutdown, reset) and snapshot
actions can be requested; everything else is either directly available or
unavailable. Console access is shown only when you have been granted
console access directly. If you cannot start a request for an action, you
either need direct permission or the action is not requestable.

Track your own requests on the home dashboard. The **Activity** card lists
pending and completed requests for your account. Open a row to read the
request detail, including its final status when a manager has reviewed it.
