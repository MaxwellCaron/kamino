import { BrowsePodsCard } from "./browse-pods-card"
import type { Pod } from "../../types/pod-types"
import { GrainientBackground } from "@/components/grainient-background"

const pods: Array<Pod> = [
  {
    id: "6",
    title: "Reverse Engineering",
    description:
      "Learn how to work backwards and understand programs through their data!",
    image: "https://i.imgur.com/Mlp5on4.png",
    creators: ["mung"],
    created_at: "2024-05-01T12:00:00Z",
    deployments: 124,
    isNew: true,
  },
  {
    id: "5",
    title: "Intro to Red Team",
    description: "Ethically hack into an infrastructure with your team!",
    image: "https://i.imgur.com/i349T75.png",
    creators: ["tommy", "mcaron"],
    created_at: "2024-04-28T12:00:00Z",
    deployments: 89,
    isNew: true,
  },
  {
    id: "4",
    title: "Insecure Deserialzation",
    description: "Learn how to keep your save files safe from malicious code.",
    image: "https://i.imgur.com/H9pBcUi.png",
    creators: ["bill"],
    created_at: "2024-04-25T12:00:00Z",
    deployments: 231,
  },
  {
    id: "3",
    title: "Capture The Flag",
    description: "Join SWIFT and FAST for a CTF. Top 3 finishers get prizes!",
    image: "https://i.imgur.com/ivoLn2o.png",
    creators: ["eric"],
    created_at: "2024-04-20T12:00:00Z",
    deployments: 542,
  },
  {
    id: "2",
    title: "Linux Securing & Hardening",
    description:
      "Learn to secure different Linux vulnerabilities through tools and configurations.",
    image: "https://i.imgur.com/E4EQHZS.png",
    creators: ["roman"],
    created_at: "2024-04-15T12:00:00Z",
    deployments: 167,
  },
  {
    id: "1",
    title: "Web Application Firewalls",
    description:
      "Utilize web app firewalls to protect yourself against application layer attacks.",
    image: "https://i.imgur.com/FpwbsE5.png",
    creators: ["nich"],
    created_at: "2024-04-10T12:00:00Z",
    deployments: 95,
  },
]

export function BrowsePodsPage() {
  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="relative overflow-hidden border-b bg-muted/30">
        <GrainientBackground className="opacity-40" />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
              Pods
            </h1>
            <p className="text-lg text-balance text-muted-foreground sm:text-xl">
              Curated virtual machine environments meant for hands-on learning.
              Browse through a selection of ready-to-use pods to get started.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 xl:gap-12">
          {pods.map((pod) => (
            <BrowsePodsCard key={pod.id} pod={pod} />
          ))}
        </div>
      </div>
    </div>
  )
}
