declare module "@novnc/novnc/core/rfb.js" {
  interface RFBCredentials {
    password?: string
    username?: string
    target?: string
  }

  interface RFBOptions {
    shared?: boolean
    credentials?: RFBCredentials
    wsProtocols?: Array<string>
  }

  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      urlOrChannel: string | WebSocket,
      options?: RFBOptions
    )

    scaleViewport: boolean
    resizeSession: boolean
    clipViewport: boolean
    dragViewport: boolean
    showDotCursor: boolean
    qualityLevel: number
    compressionLevel: number
    readonly capabilities: { power: boolean }

    disconnect(): void
    sendCredentials(credentials: RFBCredentials): void
    sendKey(keysym: number, code: string | null, down?: boolean): void
    sendCtrlAltDel(): void
    focus(options?: FocusOptions): void
    blur(): void
    machineShutdown(): void
    machineReboot(): void
    machineReset(): void
    clipboardPasteFrom(text: string): void
    toDataURL(type?: string, encoderOptions?: number): string
    toBlob(callback: BlobCallback, type?: string, quality?: number): void
  }
}
