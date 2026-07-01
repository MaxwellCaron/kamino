# User guide

This guide covers how to browse, clone, and operate pods as a standard
Kamino user.

## What is a pod?

A pod is a published, reusable environment made of one or more virtual
machines, their networking, and optional guided tasks. The pod catalog only
shows pods you are allowed to see: a pod with a configured audience is
hidden from anyone outside that audience.

## Clone and start a pod

1. Open [Pods](/pods) and choose a pod from the catalog.
2. Review its description and any tasks before committing. Task questions
   are read-only until you clone the pod.
3. Choose **Clone** to provision your own copy.
4. Wait for cloning to finish; progress is shown while your virtual machines
   and networking are created.
5. Open a virtual machine from your clone to manage it in a new tab.
6. Start your pod when you are ready to use it.

## Work with your clone

- Once cloned, the pod page shows your assigned virtual machines along with
  VNet, external, and internal network details.
- You can start or shut down your entire clone as a unit from the pod page.
- Task and question progress is saved against your clone as you complete it.
- **Re-clone** replaces your clone's virtual machine instances with a fresh
  copy of the pod's current published version. Your clone itself is not
  removed.*
- **Delete** permanently removes your clone, its virtual machines, and all
  saved task progress.*
- You can only have one accessible clone of a given pod at a time. Cloning a
  pod you already have a clone of is blocked until you delete or re-clone
  the existing one.

"*" = Only allowed if you are the one who cloned the pod. 

## Permissions and requests

Inventory actions on your virtual machines depend on the permissions you
have been granted, not just what is visible:

| State | What you see |
|-------|--------------|
| Available | The action runs immediately. |
| Request | The action is sent to a manager for approval before it runs. |
| Unavailable | The action is hidden or disabled. |

By default, only power actions (start, shutdown, reset) and snapshot
actions can be requested; everything else is either directly available or
unavailable. VNC console access is shown only when you have been granted
console access directly. If you cannot start a request for an action, you
either need direct permission or the action is not requestable.
