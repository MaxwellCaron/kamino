import { describe, expect, it } from "vitest"
import {
  createInitialPublishPodValues,
  publishPodFormSchema,
} from "./publish-pod-form"

const imageSchema = publishPodFormSchema.shape.image
const tasksSchema = publishPodFormSchema.shape.tasks

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

describe("published pod tasks", () => {
  it("allows a pod without tasks", () => {
    expect(tasksSchema.safeParse([]).success).toBe(true)
  })

  it("includes a task by default for new pods", () => {
    expect(createInitialPublishPodValues().tasks).toHaveLength(1)
  })
})
