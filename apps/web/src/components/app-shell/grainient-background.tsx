import Grainient from "@workspace/ui/components/Grainient"
import { cn } from "@workspace/ui/lib/utils"

export function KaminoGrainient() {
  return (
    <Grainient
      className="h-full w-full"
      color1="#404040"
      color2="#10B981"
      color3="#EAB308"
      timeSpeed={0}
      colorBalance={-0.24}
      warpStrength={0.8}
      warpFrequency={5}
      warpSpeed={2}
      warpAmplitude={44}
      blendAngle={0}
      blendSoftness={0.25}
      rotationAmount={530}
      noiseScale={2}
      grainAmount={0.1}
      grainScale={1}
      grainAnimated={false}
      contrast={1}
      gamma={0.7}
      saturation={0.8}
      centerX={-0.04}
      centerY={-0.49}
      zoom={0.9}
    />
  )
}

export function GrainientBackground({ className }: { className?: string }) {
  return (
    <>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", className)}
      >
        <KaminoGrainient />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 30%, color-mix(in srgb, var(--background) 18%, transparent), transparent 70%), linear-gradient(to bottom, color-mix(in srgb, var(--background) 8%, transparent), color-mix(in srgb, var(--background) 92%, transparent))",
        }}
      />
    </>
  )
}
