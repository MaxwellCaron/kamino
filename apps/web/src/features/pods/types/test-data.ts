import type { ClonedPod, Pod, PodVM } from "./pod-types"
import type { ApiTreeNodePermissions } from "@/features/inventory/types/inventory-types"
import type { InventoryPermissionKey } from "@/features/inventory/utils/inventory-permissions"
import { InventoryPermissionBits } from "@/features/inventory/utils/inventory-permissions"

function createPermissionMask(keys: Array<InventoryPermissionKey>) {
  return keys.reduce((mask, key) => mask | InventoryPermissionBits[key], 0)
}

function createPermissions({
  allowed = [],
  request = [],
}: {
  allowed?: Array<InventoryPermissionKey>
  request?: Array<InventoryPermissionKey>
}): ApiTreeNodePermissions {
  return {
    allowed_mask: createPermissionMask(allowed),
    denied_mask: 0,
    request_mask: createPermissionMask(request),
  }
}

function createVmInventory({
  itemId,
  vmid,
  pveNode,
  permissions,
  isTemplate = false,
}: {
  itemId: string
  vmid: number
  pveNode: string
  permissions: ApiTreeNodePermissions
  isTemplate?: boolean
}): PodVM["inventory"] {
  return {
    itemId,
    nodeId: itemId,
    permissions,
    vmid,
    pveNode,
    isTemplate,
  }
}

export const pods: Array<Pod> = [
  {
    id: "6",
    title: "Reverse Engineering",
    slug: "reverse-engineering",
    description:
      "Learn how to work backwards and understand programs through their data!",
    image: "https://i.imgur.com/Mlp5on4.png",
    creators: ["mung"],
    created_at: "2024-05-01T12:00:00Z",
    clone_count: 124,
    vms_visible: false,
    tasks: [
      {
        id: "re-task-1",
        title: "Binary Triage",
        content: `## Binary triage

Start by identifying what kind of sample you were given and what it expects at runtime.

### Checklist

1. Inspect the file type and architecture.
2. Record whether the binary is stripped.
3. Note any linked libraries or obvious runtime dependencies.

~~~bash
file mystery-bin
strings -n 8 mystery-bin | head -40
~~~

Keep notes short and factual. This first pass is about building context before deeper analysis.`,
        questions: [
          {
            id: "re-question-1",
            title: "Which command identifies the file type and architecture?",
            answerOutline: "****",
          },
          {
            id: "re-question-2",
            title:
              "What property tells you whether debug symbols were removed?",
            answerOutline: "*******",
          },
        ],
      },
      {
        id: "re-task-2",
        title: "Function Mapping",
        content: `## Function mapping

Open the sample in your preferred analysis tool and identify the main code paths involved in input handling.

- Locate the entry point.
- Trace the first user-controlled branch.
- Mark any function that looks like it validates or transforms data.

If you are unsure what a function does, label it as a hypothesis and move on until you have more evidence.`,
        questions: [
          {
            id: "re-question-3",
            title:
              "What function should you identify before tracing user input?",
            answerOutline: "***** *****",
          },
          {
            id: "re-question-4",
            title: "How should uncertain analysis notes be labeled?",
            answerOutline: "**********",
          },
        ],
      },
    ],
  },
  {
    id: "5",
    title: "Intro to Red Team",
    slug: "intro-to-red-team",
    description: "Ethically hack into an infrastructure with your team!",
    image: "https://i.imgur.com/i349T75.png",
    creators: ["tommy", "mcaron"],
    created_at: "2024-04-28T12:00:00Z",
    clone_count: 89,
    vms_visible: true,
    tasks: [
      {
        id: "task-1",
        title: "Mission Briefing",
        content: `# Intro to Red Team

Welcome to the first engagement. In this room you will work as an **authorized red team operator** inside a contained training environment.

> Red team work starts with permission, scope, and documentation. Tools come after that.

## Rules of engagement

Your team has written permission to test the lab network only. Keep your actions focused on the assets listed below and record anything that changes system state.

| Asset | Role | In scope |
| --- | --- | --- |
| \`kali-operator\` | Attack workstation | Yes |
| \`web-portal\` | Public-facing web app | Yes |
| \`filesrv-01\` | Internal file server | Yes |
| \`dc-01\` | Domain controller | Observe only |

### Before you begin

- Read the engagement notes in \`/home/kali/engagement/scope.md\`.
- Create an evidence folder named \`intro-red-team\`.
- Keep findings concise and reproducible.
- Do **not** attack systems outside the pod network.

[MITRE ATT&CK](https://attack.mitre.org/) is a useful reference for naming tactics and techniques in your notes.`,
        questions: [
          {
            id: "question-1",
            title: "What document defines what you are allowed to test?",
            answerOutline: "*****.**",
            hint: "Look in the engagement directory on the operator VM.",
          },
          {
            id: "question-2",
            title: "Which asset should only be observed?",
            answerOutline: "**-**",
            description:
              "This checks that the table formatting and scope language are clear.",
          },
        ],
      },
      {
        id: "task-2",
        title: "Reconnaissance",
        content: `## Reconnaissance and service mapping

Your goal is to build a small inventory before touching any application logic. Good recon gives the team shared context and prevents noisy guessing.

1. Confirm your operator IP address.
2. Identify live hosts in \`10.10.40.0/24\`.
3. Record open TCP services for each in-scope host.
4. Save raw command output under \`evidence/recon/\`.

~~~bash
mkdir -p evidence/recon
ip addr show
nmap -sV -oN evidence/recon/tcp-services.txt 10.10.40.0/24
~~~

### Recon checklist

- [x] Operator VM booted
- [x] Scope reviewed
- [ ] Host discovery completed
- [ ] Service notes written

---

Use neutral language in your notes. For example, write \`tcp/80 open nginx\` instead of guessing that a web application is vulnerable.`,
        questions: [
          {
            id: "question-3",
            title: "Which directory should contain recon evidence?",
            answerOutline: "********/*****",
          },
          {
            id: "question-4",
            title:
              "Which command option records service versions in the example?",
            answerOutline: "-**",
          },
          {
            id: "question-5",
            title: "What CIDR range is used for the lab network?",
            answerOutline: "**.**.**.*/**",
          },
        ],
      },
      {
        id: "task-3",
        title: "Initial Access Triage",
        content: `## Initial access triage

The recon notes point to a small help desk portal. You are not exploiting it yet. First, inspect the login workflow and identify what evidence would justify deeper testing.

![A simplified red team lab diagram](https://i.imgur.com/i349T75.png)

### What to capture

- Page title and framework clues
- Login request path
- Response codes for valid and invalid attempts
- Any lockout or rate-limit behavior
- Session cookie names and security attributes

~~~http
POST /login HTTP/1.1
Host: web-portal.lab
Content-Type: application/x-www-form-urlencoded

username=student&password=Password123
~~~

#### Notes

Inline details like \`HttpOnly\`, \`SameSite=Lax\`, and \`Secure\` should be copied exactly. Mark anything uncertain as _needs validation_ instead of presenting it as fact.

~~Do not brute force credentials.~~ Use the provided test account and focus on observation.`,
        questions: [
          {
            id: "question-6",
            title: "Which HTTP path handles the sample login request?",
            answerOutline: "/*****",
          },
          {
            id: "question-7",
            title: "Name one cookie attribute you should record exactly.",
            answerOutline: "********",
          },
          {
            id: "question-8",
            title: "What testing activity is explicitly out of bounds here?",
            answerOutline: "***** *****",
          },
        ],
      },
      {
        id: "task-4",
        title: "Internal Discovery",
        content: `## Internal discovery

After the portal review, assume the team has received a low-privilege shell for training purposes. Your job is to understand the host without changing it.

### Commands to run

~~~bash
whoami
hostname
ip route
find /opt -maxdepth 2 -type f -name "*.conf" 2>/dev/null
~~~

### Evidence format

| Finding | Evidence | Risk |
| --- | --- | --- |
| Local user context | \`whoami\` output | Low |
| Network route | \`ip route\` output | Medium |
| Readable config file | File path only | Needs review |

> If a command requires elevated privileges, stop and record the blocker. Do not force it.

##### Operator reminder

Keep terminal output short in the report. A useful finding explains **what was observed**, **why it matters**, and **what should happen next**.`,
        questions: [
          {
            id: "question-9",
            title: "Which command shows the current user context?",
            answerOutline: "******",
          },
          {
            id: "question-10",
            title: "What should you do if a command needs elevated privileges?",
            answerOutline: "**** *** ****** *** *******",
          },
          {
            id: "question-11",
            title: "Which table column captures business or technical impact?",
            answerOutline: "****",
          },
        ],
      },
      {
        id: "task-5",
        title: "Debrief and Reporting",
        content: `## Debrief and reporting

The final step is to turn raw notes into a readable operator report. The audience is mixed: instructors need reproduction steps, while defenders need clear remediation.

### Report outline

1. Executive summary
2. Scope and assumptions
3. Timeline
4. Findings
5. Remediation recommendations
6. Appendix with evidence

###### Sample finding title

\`RT-001: Help desk portal exposes verbose login errors\`

Use this small scoring guide while drafting:

| Severity | Use when |
| --- | --- |
| Low | The issue is informational or requires many assumptions |
| Medium | The issue helps an attacker progress |
| High | The issue enables direct compromise in scope |

Final readiness checklist:

- [ ] Every finding has evidence
- [ ] Every recommendation is actionable
- [ ] Commands are wrapped in code formatting
- [ ] Out-of-scope systems are excluded

For a polished report, link tactics back to [MITRE ATT&CK Enterprise](https://attack.mitre.org/matrices/enterprise/) when it helps the reader.`,
        questions: [
          {
            id: "question-12",
            title:
              "Which report section should contain raw screenshots and logs?",
            answerOutline: "********",
          },
          {
            id: "question-13",
            title:
              "What severity fits an issue that helps an attacker progress?",
            answerOutline: "******",
          },
          {
            id: "question-14",
            title: "What should every recommendation be?",
            answerOutline: "**********",
          },
        ],
      },
    ],
  },
  {
    id: "4",
    title: "Insecure Deserialzation",
    slug: "insecure-deserialization",
    description: "Learn how to keep your save files safe from malicious code.",
    image: "https://i.imgur.com/H9pBcUi.png",
    creators: ["bill"],
    created_at: "2024-04-25T12:00:00Z",
    clone_count: 231,
    vms_visible: false,
    tasks: [
      {
        id: "deserialize-task-1",
        title: "Payload Inspection",
        content: `## Payload inspection

Review the sample save file and identify which parts appear to be structured data versus opaque binary content.

### What to capture

- File extension
- Serialization format clues
- Any user-controlled fields

Do not assume the format from the filename alone. Confirm it with what you can observe.`,
        questions: [
          {
            id: "deserialize-question-1",
            title:
              "What should you confirm before trusting the file extension?",
            answerOutline: "******",
          },
          {
            id: "deserialize-question-2",
            title: "Name one thing you should capture during inspection.",
            answerOutline: "**** *****",
          },
        ],
      },
      {
        id: "deserialize-task-2",
        title: "Unsafe Object Review",
        content: `## Unsafe object review

Trace how the application restores objects from the save file and look for types that should never be instantiated from untrusted input.

Focus on constructors, magic methods, or hooks that execute automatically during object restoration.`,
        questions: [
          {
            id: "deserialize-question-3",
            title:
              "Which class behavior is especially risky during object restoration?",
            answerOutline: "***** *******",
          },
          {
            id: "deserialize-question-4",
            title:
              "What kind of input should never fully control object creation?",
            answerOutline: "********* *****",
          },
        ],
      },
    ],
  },
  {
    id: "3",
    title: "Capture The Flag",
    slug: "capture-the-flag",
    description: "Join SWIFT and FAST for a CTF. Top 3 finishers get prizes!",
    image: "https://i.imgur.com/ivoLn2o.png",
    creators: ["eric"],
    created_at: "2024-04-20T12:00:00Z",
    clone_count: 542,
    vms_visible: true,
    tasks: [
      {
        id: "ctf-task-1",
        title: "Event Brief",
        content: `## Event brief

Read the challenge overview before touching the targets. Each flag is tied to a specific service in the pod.

### Team rules

- Keep a shared note for solved flags.
- Record the command or request used to retrieve each flag.
- Avoid changing services unless the challenge explicitly requires it.`,
        questions: [
          {
            id: "ctf-question-1",
            title: "What should the team keep for solved flags?",
            answerOutline: "****** ****",
          },
          {
            id: "ctf-question-2",
            title: "What should you record alongside each captured flag?",
            answerOutline: "*** ******* ** *******",
          },
        ],
      },
      {
        id: "ctf-task-2",
        title: "Web Challenge Enumeration",
        content: `## Web challenge enumeration

Start with the exposed web service and collect enough context to decide whether the flag is in content, source, or application behavior.

~~~bash
curl -I http://target.lab
curl http://target.lab/robots.txt
~~~

Look for comments, hidden paths, and default content before trying anything noisy.`,
        questions: [
          {
            id: "ctf-question-3",
            title: "Which file commonly reveals hidden paths?",
            answerOutline: "******.***",
          },
          {
            id: "ctf-question-4",
            title: "What kind of activity should you avoid at this stage?",
            answerOutline: "*****",
          },
        ],
      },
      {
        id: "ctf-task-3",
        title: "Flag Submission Hygiene",
        content: `## Flag submission hygiene

Before submitting, verify that the string matches the expected format and that another teammate has not already claimed it.

Use clean evidence so disputes are easy to resolve after the event.`,
        questions: [
          {
            id: "ctf-question-5",
            title: "What should you verify before submitting a flag?",
            answerOutline: "****** ******",
          },
          {
            id: "ctf-question-6",
            title: "Why should evidence stay clean and reproducible?",
            answerOutline: "****** ** *** ** ***** ** ******",
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Linux Securing & Hardening",
    slug: "linux-securing-hardening",
    description:
      "Learn to secure different Linux vulnerabilities through tools and configurations.",
    image: "https://i.imgur.com/E4EQHZS.png",
    creators: ["roman"],
    created_at: "2024-04-15T12:00:00Z",
    clone_count: 167,
    vms_visible: true,
    tasks: [
      {
        id: "linux-task-1",
        title: "Baseline Review",
        content: `## Baseline review

Confirm the system version, enabled services, and current user privileges before making any hardening changes.

~~~bash
uname -a
systemctl list-units --type=service --state=running
id
~~~

You are building a before-state so later changes can be justified.`,
        questions: [
          {
            id: "linux-question-1",
            title:
              "Which command shows the current user and group memberships?",
            answerOutline: "**",
          },
          {
            id: "linux-question-2",
            title: "Why do you capture a baseline before hardening?",
            answerOutline: "****** ******",
          },
        ],
      },
      {
        id: "linux-task-2",
        title: "SSH Tightening",
        content: `## SSH tightening

Inspect the SSH daemon configuration and identify settings that reduce unnecessary exposure.

Focus on root login, password authentication, and any broad listen settings.`,
        questions: [
          {
            id: "linux-question-3",
            title: "Name one SSH setting that should be reviewed first.",
            answerOutline: "**** *****",
          },
          {
            id: "linux-question-4",
            title: "What kind of network setting can broaden SSH exposure?",
            answerOutline: "****** ******",
          },
        ],
      },
      {
        id: "linux-task-3",
        title: "Patch and Verify",
        content: `## Patch and verify

Once changes are proposed, verify that the service still starts cleanly and that access is not accidentally broken for approved users.

Good hardening reduces risk without creating an outage.`,
        questions: [
          {
            id: "linux-question-5",
            title: "What should you confirm after making a hardening change?",
            answerOutline: "******* ************",
          },
          {
            id: "linux-question-6",
            title: "What should hardening avoid creating?",
            answerOutline: "** ******",
          },
        ],
      },
    ],
  },
  {
    id: "1",
    title: "Web Application Firewalls",
    slug: "web-application-firewalls",
    description:
      "Utilize web app firewalls to protect yourself against application layer attacks.",
    image: "https://i.imgur.com/FpwbsE5.png",
    creators: ["nich"],
    created_at: "2024-04-10T12:00:00Z",
    clone_count: 95,
    vms_visible: true,
    tasks: [
      {
        id: "waf-task-1",
        title: "Rule Inventory",
        content: `## Rule inventory

Start by reviewing which protections are enabled and which traffic patterns they are meant to cover.

Document:

- Core rule set version
- Custom allow or deny rules
- Paths or hosts with exceptions

You need the policy shape before you can judge whether it is effective.`,
        questions: [
          {
            id: "waf-question-1",
            title:
              "What should you identify before judging rule effectiveness?",
            answerOutline: "****** *****",
          },
          {
            id: "waf-question-2",
            title: "Name one kind of exception you should document.",
            answerOutline: "***** ** *****",
          },
        ],
      },
      {
        id: "waf-task-2",
        title: "Traffic Validation",
        content: `## Traffic validation

Send a few known-safe requests and a few intentionally suspicious ones to confirm the policy behaves the way you expect.

Look for false positives, missing blocks, and whether useful logs are generated for defenders.`,
        questions: [
          {
            id: "waf-question-3",
            title:
              "What should a safe validation exercise look for besides blocks?",
            answerOutline: "***** *********",
          },
          {
            id: "waf-question-4",
            title: "Who benefits from useful WAF logs?",
            answerOutline: "*********",
          },
        ],
      },
    ],
  },
]

const podVmPermissions = {
  adminLike: createPermissions({
    allowed: [
      "powerVm",
      "cloneVm",
      "snapshotVm",
      "renameVm",
      "editVmHardware",
      "managePermissions",
      "deleteVm",
      "templateVm",
    ],
  }),
  operator: createPermissions({
    allowed: ["powerVm", "cloneVm", "renameVm", "editVmHardware"],
    request: ["snapshotVm"],
  }),
  reviewer: createPermissions({
    allowed: ["cloneVm", "managePermissions"],
    request: ["powerVm", "snapshotVm"],
  }),
  limited: createPermissions({
    allowed: ["cloneVm"],
    request: ["powerVm"],
  }),
  destructiveOnly: createPermissions({
    allowed: ["deleteVm", "managePermissions"],
  }),
} as const

export const clonedPods: Array<ClonedPod> = [
  {
    id: "clone-reverse-engineering",
    pod_id: "6",
    cloned_at: "2024-05-10T08:00:00Z",
    status: "running",
    vms: [
      {
        id: "vm-1",
        name: "RE-Workstation",
        status: "running",
        uptime: 45324,
        inventory: createVmInventory({
          itemId: "inventory-vm-1",
          vmid: 301,
          pveNode: "pve-lab-01",
          permissions: podVmPermissions.adminLike,
        }),
        resources: {
          cpu: 0.15,
          maxcpu: 4,
          mem: 2147483648,
          maxmem: 8589934592,
          disk: 42949672960,
          maxdisk: 107374182400,
          netin: 1024,
          netout: 512,
          diskread: 0,
          diskwrite: 0,
          uptime: 3600,
        },
      },
      {
        id: "vm-2",
        name: "Target-Binary-Host",
        status: "stopped",
        uptime: 6234,
        inventory: createVmInventory({
          itemId: "inventory-vm-2",
          vmid: 302,
          pveNode: "pve-lab-01",
          permissions: podVmPermissions.reviewer,
        }),
        resources: {
          cpu: 0,
          maxcpu: 2,
          mem: 1073741824,
          maxmem: 2147483648,
          disk: 10737418240,
          maxdisk: 21474836480,
          netin: 0,
          netout: 0,
          diskread: 0,
          diskwrite: 0,
          uptime: 0,
        },
      },
    ],
    task_summary: {
      total: 2,
      completed: 1,
      progress: 50,
    },
    task_states: [
      {
        task_id: "re-task-1",
        completed: true,
        completed_at: "2024-05-10T08:14:00Z",
      },
      {
        task_id: "re-task-2",
        completed: false,
      },
    ],
    question_answers: [
      {
        question_id: "re-question-1",
        answer: "file",
        is_correct: true,
        answered_at: "2024-05-10T08:12:00Z",
      },
      {
        question_id: "re-question-2",
        answer: "stripped",
        is_correct: true,
        answered_at: "2024-05-10T08:14:00Z",
      },
    ],
  },
  {
    id: "clone-intro-to-red-team",
    pod_id: "5",
    cloned_at: "2024-05-11T14:30:00Z",
    status: "running",
    vms: [
      {
        id: "vm-3",
        name: "Kali-Linux",
        status: "running",
        uptime: 18745,
        inventory: createVmInventory({
          itemId: "inventory-vm-3",
          vmid: 401,
          pveNode: "pve-red-01",
          permissions: podVmPermissions.operator,
        }),
        resources: {
          cpu: 0.45,
          maxcpu: 4,
          mem: 4294967296,
          maxmem: 8589934592,
          disk: 64424509440,
          maxdisk: 107374182400,
          netin: 4096,
          netout: 2048,
          diskread: 1048576,
          diskwrite: 524288,
          uptime: 7200,
        },
      },
      {
        id: "vm-4",
        name: "Web-Portal",
        status: "running",
        uptime: 817333,
        inventory: createVmInventory({
          itemId: "inventory-vm-4",
          vmid: 402,
          pveNode: "pve-red-01",
          permissions: podVmPermissions.reviewer,
        }),
        resources: {
          cpu: 0.45,
          maxcpu: 4,
          mem: 4294967296,
          maxmem: 8589934592,
          disk: 64424509440,
          maxdisk: 107374182400,
          netin: 4096,
          netout: 2048,
          diskread: 1048576,
          diskwrite: 524288,
          uptime: 7200,
        },
      },
      {
        id: "vm-5",
        name: "FileSrv-01",
        status: "running",
        uptime: 1234,
        inventory: createVmInventory({
          itemId: "inventory-vm-5",
          vmid: 403,
          pveNode: "pve-red-02",
          permissions: podVmPermissions.destructiveOnly,
        }),
        resources: {
          cpu: 0.45,
          maxcpu: 4,
          mem: 4294967296,
          maxmem: 8589934592,
          disk: 64424509440,
          maxdisk: 107374182400,
          netin: 4096,
          netout: 2048,
          diskread: 1048576,
          diskwrite: 524288,
          uptime: 7200,
        },
      },
      {
        id: "vm-6",
        name: "DC-01",
        status: "running",
        uptime: 12,
        inventory: createVmInventory({
          itemId: "inventory-vm-6",
          vmid: 404,
          pveNode: "pve-red-02",
          permissions: podVmPermissions.limited,
        }),
        resources: {
          cpu: 0.45,
          maxcpu: 4,
          mem: 4294967296,
          maxmem: 8589934592,
          disk: 64424509440,
          maxdisk: 107374182400,
          netin: 4096,
          netout: 2048,
          diskread: 1048576,
          diskwrite: 524288,
          uptime: 7200,
        },
      },
      {
        id: "vm-7",
        name: "Jump-Box",
        status: "running",
        uptime: 6712,
        inventory: createVmInventory({
          itemId: "inventory-vm-7",
          vmid: 405,
          pveNode: "pve-red-03",
          permissions: podVmPermissions.adminLike,
        }),
        resources: {
          cpu: 0.45,
          maxcpu: 4,
          mem: 4294967296,
          maxmem: 8589934592,
          disk: 64424509440,
          maxdisk: 107374182400,
          netin: 4096,
          netout: 2048,
          diskread: 1048576,
          diskwrite: 524288,
          uptime: 7200,
        },
      },
    ],
    task_summary: {
      total: 5,
      completed: 1,
      progress: 20,
    },
    task_states: [
      {
        task_id: "task-1",
        completed: true,
        completed_at: "2024-05-11T14:46:00Z",
      },
      {
        task_id: "task-2",
        completed: false,
      },
      {
        task_id: "task-3",
        completed: false,
      },
      {
        task_id: "task-4",
        completed: false,
      },
      {
        task_id: "task-5",
        completed: false,
      },
    ],
    question_answers: [
      {
        question_id: "question-1",
        answer: "scope.md",
        is_correct: true,
        answered_at: "2024-05-11T14:45:00Z",
      },
      {
        question_id: "question-2",
        answer: "dc-01",
        is_correct: true,
        answered_at: "2024-05-11T14:46:00Z",
      },
      {
        question_id: "question-3",
        answer: "evidence/recon",
        is_correct: true,
        answered_at: "2024-05-11T15:03:00Z",
      },
      {
        question_id: "question-4",
        answer: "-sV",
        is_correct: true,
        answered_at: "2024-05-11T15:04:00Z",
      },
      {
        question_id: "question-5",
        answer: "10.10.4.0/24",
        is_correct: false,
        answered_at: "2024-05-11T15:06:00Z",
      },
    ],
  },
]
