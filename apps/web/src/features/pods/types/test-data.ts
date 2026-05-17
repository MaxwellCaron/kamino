import type { ClonedPod, Pod } from "./pod-types"

export const pods: Array<Pod> = [
  {
    id: "6",
    title: "Reverse Engineering",
    description:
      "Learn how to work backwards and understand programs through their data!",
    image: "https://i.imgur.com/Mlp5on4.png",
    creators: ["mung"],
    created_at: "2024-05-01T12:00:00Z",
    clones: 124,
    isNew: true,
    vmsVisible: false,
  },
  {
    id: "5",
    title: "Intro to Red Team",
    description: "Ethically hack into an infrastructure with your team!",
    image: "https://i.imgur.com/i349T75.png",
    creators: ["tommy", "mcaron"],
    created_at: "2024-04-28T12:00:00Z",
    clones: 89,
    isNew: true,
    vmsVisible: true,
  },
  {
    id: "4",
    title: "Insecure Deserialzation",
    description: "Learn how to keep your save files safe from malicious code.",
    image: "https://i.imgur.com/H9pBcUi.png",
    creators: ["bill"],
    created_at: "2024-04-25T12:00:00Z",
    clones: 231,
    vmsVisible: false,
  },
  {
    id: "3",
    title: "Capture The Flag",
    description: "Join SWIFT and FAST for a CTF. Top 3 finishers get prizes!",
    image: "https://i.imgur.com/ivoLn2o.png",
    creators: ["eric"],
    created_at: "2024-04-20T12:00:00Z",
    clones: 542,
    vmsVisible: true,
  },
  {
    id: "2",
    title: "Linux Securing & Hardening",
    description:
      "Learn to secure different Linux vulnerabilities through tools and configurations.",
    image: "https://i.imgur.com/E4EQHZS.png",
    creators: ["roman"],
    created_at: "2024-04-15T12:00:00Z",
    clones: 167,
    vmsVisible: true,
  },
  {
    id: "1",
    title: "Web Application Firewalls",
    description:
      "Utilize web app firewalls to protect yourself against application layer attacks.",
    image: "https://i.imgur.com/FpwbsE5.png",
    creators: ["nich"],
    created_at: "2024-04-10T12:00:00Z",
    clones: 95,
    vmsVisible: true,
  },
]

export const clonedPods: Array<ClonedPod> = [
  {
    ...pods[0],
    cloned_at: "2024-05-10T08:00:00Z",
    status: "running",
    vms: [
      {
        id: "vm-1",
        name: "RE-Workstation",
        status: "running",
        uptime: 45324,
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
    tasks: {
      total: 2,
      completed: 1,
      progress: 50,
      items: [
        {
          id: "task-1",
          title: "Task 1",
          content: "Description for task 1",
          completed: true,
        },
        {
          id: "task-2",
          title: "Task 2",
          content: "Description for task 2",
          completed: false,
        },
      ],
    },
  },
  {
    ...pods[1],
    cloned_at: "2024-05-11T14:30:00Z",
    status: "running",
    vms: [
      {
        id: "vm-3",
        name: "Kali-Linux",
        status: "running",
        uptime: 18745,
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
        name: "Kali-Linux",
        status: "running",
        uptime: 817333,
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
        name: "Kali-Linux",
        status: "running",
        uptime: 1234,
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
        name: "Kali-Linux",
        status: "running",
        uptime: 12,
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
        name: "Kali-Linux",
        status: "running",
        uptime: 6712,
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
    tasks: {
      total: 5,
      completed: 2,
      progress: 40,
      items: [
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
          completed: true,
          questions: [
            {
              id: "question-1",
              title: "What document defines what you are allowed to test?",
              completed: true,
              answerOutline: "*****.**",
              hint: "Look in the engagement directory on the operator VM.",
            },
            {
              id: "question-2",
              title: "Which asset should only be observed?",
              completed: true,
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
          completed: true,
          questions: [
            {
              id: "question-3",
              title: "Which directory should contain recon evidence?",
              completed: true,
              answerOutline: "********/*****",
            },
            {
              id: "question-4",
              title:
                "Which command option records service versions in the example?",
              completed: true,
              answerOutline: "-**",
            },
            {
              id: "question-5",
              title: "What CIDR range is used for the lab network?",
              completed: false,
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
          completed: false,
          questions: [
            {
              id: "question-6",
              title: "Which HTTP path handles the sample login request?",
              completed: false,
              answerOutline: "/*****",
            },
            {
              id: "question-7",
              title: "Name one cookie attribute you should record exactly.",
              completed: false,
              answerOutline: "********",
            },
            {
              id: "question-8",
              title: "What testing activity is explicitly out of bounds here?",
              completed: false,
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
          completed: false,
          questions: [
            {
              id: "question-9",
              title: "Which command shows the current user context?",
              completed: false,
              answerOutline: "******",
            },
            {
              id: "question-10",
              title:
                "What should you do if a command needs elevated privileges?",
              completed: false,
              answerOutline: "**** *** ****** *** *******",
            },
            {
              id: "question-11",
              title:
                "Which table column captures business or technical impact?",
              completed: false,
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
          completed: false,
          questions: [
            {
              id: "question-12",
              title:
                "Which report section should contain raw screenshots and logs?",
              completed: false,
              answerOutline: "********",
            },
            {
              id: "question-13",
              title:
                "What severity fits an issue that helps an attacker progress?",
              completed: false,
              answerOutline: "******",
            },
            {
              id: "question-14",
              title: "What should every recommendation be?",
              completed: false,
              answerOutline: "**********",
            },
          ],
        },
      ],
    },
  },
]
