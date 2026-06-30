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
    date: "Jul 30, 2026",
    highlight: true,
    groups: [
      {
        tag: "New",
        tone: "emerald",
        items: ["Added Changelog."],
      },
    ],
  },
]
