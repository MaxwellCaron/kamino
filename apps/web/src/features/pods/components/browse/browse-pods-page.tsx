import { BrowsePodsCard } from "./browse-pods-card"
import type { Pod } from "../../types/pod-types"

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
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <h1 className="mx-1 mt-6 text-center text-5xl font-extrabold tracking-tighter md:text-7xl">
            Pods
          </h1>
          <p className="text-xl text-muted-foreground">
            Curated virtual machine environments meant for hands-on learning.
            Browse through a selection of ready-to-use pods to get started.
          </p>
        </div>
        <div className="mx-auto max-w-300">
          <div className="lg:gird-rows-3 mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2 xl:gap-12">
            {pods.map((pod) => (
              <BrowsePodsCard key={pod.id} pod={pod} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
