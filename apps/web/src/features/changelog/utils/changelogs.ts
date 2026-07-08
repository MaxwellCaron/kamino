interface Release {
  date: string
  highlight: boolean
  groups: Array<{
    tag: "New" | "Improved" | "Fixed" | "Removed"
    tone: "emerald" | "indigo" | "rose" | "amber"
    items: Array<string>
  }>
}

export const RELEASES: Array<Release> = [
  {
    date: "Jul 7, 2026",
    highlight: true,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added configurable startup syncs for Proxmox inventory and Active Directory principals.",
          "Added separate full-name fields and columns while preserving principal logon names.",
          "Added an action dropdown to inventory folder pages.",
          "Added a development deployment build and Kubernetes overlay.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: [
          "Rebuilt the inventory tree with virtualization, lazy mounting, native scrolling, search, and horizontal resizing.",
          "Improved inventory routing, selection, and automatic scrolling to the active item.",
          "Improved VMID allocation with configurable ranges, centralized reservations, and concurrency protection.",
          "Improved mutation toasts for bulk inventory, pod, request, principal, SDN, and Proxmox sync actions.",
          "Migrated Kubernetes ingress from Traefik to Istio.",
          "Standardized fixed changelog entries on the amber status tone.",
          "Improved personal pod component visuals",
        ],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed initial inventory and principal sync failures caused by schema, pool, and disk edge cases.",
          "Fixed Active Directory users syncing display names instead of logon names.",
          "Fixed generated pod clone names when a user's name begins with a number.",
          "Fixed pagination across data tables.",
          "Fixed inventory tree double-click jumps, bounce, folder visuals, virtualized content sizing, and scrollbar sizing.",
          "Fixed VMID reservation 595 errors and polling through the wrong Proxmox node.",
          "Fixed overly restrictive pod VNet prefix validation.",
          "Fixed the create-pod form resetting after selecting Try Again.",
          "Fixed asynchronous bulk mutation toast updates.",
          "Updated quic-go to address GO-2026-5676.",
        ],
      },
    ],
  },
  {
    date: "Jul 2, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added personal pods.",
          "Added personal pod permission scoping.",
          "Added templates and pod folder lookup by item ID.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: [
          "Improved audit log coverage and preserved item information after deletion.",
          "Improved mutation toast visuals.",
          "Removed animations from main data tables.",
          "Moved personal pod to its own cutout card.",
          "Improved vnet scoping.",
        ],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed array index used as a React key.",
          "Fixed imagePullPolicy configuration.",
          "Fixed site command folders routing directly to inventory pages.",
          "Fixed default internal pod subnet to 192.168.1.0/24.",
          "Fixed independent awaits running sequentially.",
          "Fixed missing Item component.",
          "Fixed personal pod overlay colors.",
        ],
      },
    ],
  },
  {
    date: "Jun 30, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added Changelog.",
          "Added role-specific documentation and docs search in the command palette.",
          "Added actions audit log and redesigned the requests table with pagination.",
          "Added executing state to requests and checks before VM mutations.",
          "Added pod preload overlay for pod routes.",
          "Added appearance and logout options to the site command.",
          "Enforced pod ownership: only owners can delete or re-clone; admins and managers bypass.",
          "Migrated to Hugeicons.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: [
          "Converted progress state displays to toasts.",
          "Improved all page skeletons and standardized button and submit states.",
          "Redesigned user-group bulk dialog and made published pod dashboard card horizontally scrollable.",
          "Centralized inventory tree functionality with scroll-fade visuals.",
          "Improved VNC console reliability.",
        ],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed permanently stranded requests and managers approving their own requests.",
          "Fixed routers using incorrect configurations and clone-of-clone.",
          "Fixed create pod 404 and 404 page buttons.",
          "Fixed frontend error states and bulk deny flow.",
          "Fixed mutation toast titles and toast conversion errors.",
          "Fixed chart colors, border cutoff, mismatched pod status badges, and missing font-heading.",
        ],
      },
    ],
  },
  {
    date: "Jun 19, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added footer with contribution heatmap.",
          "Added create pod action to the admin dashboard.",
          "Added descriptions and styling to cloned pod status.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: [
          "Switched to emerald and amber as primary and secondary colors.",
          "Replaced contribution graph with heatmap.",
          "Improved cloned pod user dashboard component and reorganized pod folder structure.",
          "Updated to latest area chart with general visual improvements.",
        ],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed pods cloned for groups not displaying for users.",
          "Fixed broken search bar in published pod catalog.",
          "Fixed visual bug when expanding pod task and questions card showing when task has no questions.",
          "Fixed progress pill dark/light mode colors and admin dashboard resource usage skeleton.",
          "Fixed page title order and codeblock formatting.",
        ],
      },
    ],
  },
  {
    date: "Jun 15, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added published pod clone management with bulk actions.",
          "Added manager principal pod cloning.",
          "Added Proxmox sync admin option.",
          "Added cloned pod instances display in catalog.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: ["Reordered pod actions."],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed inventory permission edits visibility.",
          "Fixed incorrect sidebar width on pods endpoints.",
          "Fixed dialog background colors and ASCII art rendering on Firefox.",
          "Fixed cloned pod instance formatting and terminology.",
        ],
      },
    ],
  },
  {
    date: "Jun 13, 2026",
    highlight: false,
    groups: [
      {
        tag: "Improved",
        tone: "indigo",
        items: ["Migrated VNC console from noVNC to react-vnc."],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: ["Fixed VNC console hang."],
      },
    ],
  },
  {
    date: "Jun 12, 2026",
    highlight: false,
    groups: [
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Hardened login with rate limiting and post-login redirect validation.",
          "Fixed membership dialog infinite loop and duplicate-key bugs.",
          "Fixed dialog spacings.",
        ],
      },
    ],
  },
  {
    date: "Jun 9, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Added pods: publishing, cloning, catalog, and task questions.",
          "Added admin dashboard with stats, action buttons, and historical charts.",
          "Added user dashboard with favorites and recent activity.",
          "Added bulk inventory drag-and-drop.",
          "Added folder limits and 3-request limit.",
          "Added 404 page.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: [
          "Redesigned login and standardized loading skeletons.",
          "Improved VM dashboard skeleton and console search.",
          "Made favorites collapsible in the header.",
          "Added informative browser tab titles.",
        ],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed scrollbar margin and pod/inventory tree VM mismatch.",
          "Fixed 404 on misconfiguration.",
          "Fixed cloned pod content overflowing on user dashboard.",
          "Fixed drag-and-drop target highlight and refetching on bad requests.",
        ],
      },
    ],
  },
  {
    date: "Apr 24, 2026",
    highlight: false,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: [
          "Initial Kamino release: VM inventory, Proxmox integration, and authentication.",
          "Added inventory permissions system.",
          "Added request queue with live status updates and multi-select.",
          "Added VM snapshots, notes, breadcrumbs, and resource charts.",
          "Added VM/template favorites and multi-select inventory operations.",
          "Added VNC console with power-status awareness and connection timer.",
          "Added create-VM wizard with bridges and vnets.",
          "Added management permissions and group permissions dialog.",
          "Added admin tables for users, groups, and vnets.",
          "Added nested navbar and command popup in site header.",
        ],
      },
      {
        tag: "Improved",
        tone: "indigo",
        items: ["Rebuilt inventory tree with drag-and-drop."],
      },
      {
        tag: "Fixed",
        tone: "amber",
        items: [
          "Fixed redundant descriptions.",
          "Fixed dialog flashing.",
          "Fixed various permission issues.",
        ],
      },
    ],
  },
]
