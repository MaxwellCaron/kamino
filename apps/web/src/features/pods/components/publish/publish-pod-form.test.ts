import { describe, expect, it } from "vitest"
import { publishPodFormSchema } from "./publish-pod-form"

const imageSchema = publishPodFormSchema.shape.image

describe("published pod image URL validation", () => {
  it.each([
    "https://images.example.com/pod.png",
    "  https://images.example.com/pod.png  ",
    "/assets/pods/pod.png",
  ])("accepts %s", (image) => {
    expect(imageSchema.safeParse(image).success).toBe(true)
  })

  it.each([
    "http://images.example.com/pod.png",
    "javascript:alert(1)",
    "//images.example.com/pod.png",
    "images/pod.png",
    "https://user:password@images.example.com/pod.png",
    "",
  ])("rejects %s", (image) => {
    expect(imageSchema.safeParse(image).success).toBe(false)
  })
})
