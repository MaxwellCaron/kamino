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
  },
  {
    id: "4",
    title: "Insecure Deserialzation",
    description: "Learn how to keep your save files safe from malicious code.",
    image: "https://i.imgur.com/H9pBcUi.png",
    creators: ["bill"],
    created_at: "2024-04-25T12:00:00Z",
    clones: 231,
  },
  {
    id: "3",
    title: "Capture The Flag",
    description: "Join SWIFT and FAST for a CTF. Top 3 finishers get prizes!",
    image: "https://i.imgur.com/ivoLn2o.png",
    creators: ["eric"],
    created_at: "2024-04-20T12:00:00Z",
    clones: 542,
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
  },
]

export const clonedPods: Array<ClonedPod> = [
  {
    ...pods[0],
    cloned_at: "2024-05-10T08:00:00Z",
    vms: [
      {
        id: "vm-1",
        name: "RE-Workstation",
        status: "running",
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
          description: "Description for task 1",
          completed: true,
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Description for task 2",
          completed: false,
        },
      ],
    },
  },
  {
    ...pods[1],
    cloned_at: "2024-05-11T14:30:00Z",
    vms: [
      {
        id: "vm-3",
        name: "Kali-Linux",
        status: "running",
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
          title: "Task 1",
          description: "Description for task 1",
          completed: true,
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Description for task 2",
          completed: true,
        },
        {
          id: "task-3",
          title: "Task 3",
          description: "Description for task 3",
          completed: false,
        },
        {
          id: "task-4",
          title: "Task 4",
          description: "Description for task 4",
          completed: false,
        },
        {
          id: "task-5",
          title: "Task 5",
          description: "Description for task 5",
          completed: false,
        },
      ],
    },
  },
]

export const tryHackMeTasks = [
  {
    id: "task-1",
    title: "Introduction",
    completed: true,
    description:
      "In this task, we will cover the basics of static analysis. Static analysis is the process of analyzing a program without executing it. This is typically done by examining the code or the binary itself.",
    questions: [
      {
        id: "q1",
        text: "What is static analysis?",
        hint: "Look at the first sentence of the description.",
      },
      {
        id: "q2",
        text: "Does static analysis require code execution?",
        hint: "The word 'without' is a big clue.",
      },
    ],
  },
  {
    id: "task-2",
    title: "Strings :: Challenge 1",
    completed: false,
    description:
      "For this challenge, you need to find a hidden flag within the provided binary using the 'strings' utility. The flag follows the format THM{...}.",
    hasDownload: true,
    questions: [
      {
        id: "q3",
        text: "What is the flag?",
        hint: "Run 'strings binary | grep THM'.",
      },
    ],
  },
  {
    id: "task-3",
    title: "Strings :: Challenge 2",
    completed: false,
    description:
      "This challenge is slightly more difficult. The flag is encoded. You might need to use additional tools like grep or a hex editor to locate it.",
    hasDownload: true,
    questions: [
      { id: "q4", text: "Locate the encoded flag." },
      {
        id: "q5",
        text: "What is the decoded flag?",
        hint: "It looks like Base64 encoding.",
      },
    ],
  },
  {
    id: "task-4",
    title: "Strings 3 :: Challenge 3",
    completed: false,
    description:
      "The final strings challenge. This binary is packed. You will need to identify the packer used and find the flag within the packed sections.",
    hasDownload: true,
    questions: [
      {
        id: "q6",
        text: "Identify the packer.",
        hint: "Try using 'die' or 'pestudio'.",
      },
      { id: "q7", text: "Provide the final flag." },
    ],
  },
]
