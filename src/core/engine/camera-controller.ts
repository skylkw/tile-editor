import type { CameraState, MapMetrics, ViewportOptions, WorldPoint } from "./types"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export class CameraController {
  private readonly viewportOptions: Required<ViewportOptions>
  private readonly state: CameraState = { x: 0, y: 0, scale: 1 }
  private viewportSize = { width: 1, height: 1 }
  private contentSize = { width: 1, height: 1 }

  constructor(viewportOptions: Required<ViewportOptions>, metrics: MapMetrics) {
    this.viewportOptions = viewportOptions
    this.setContentMetrics(metrics)
  }

  public setViewportSize(width: number, height: number) {
    this.viewportSize.width = Math.max(width, 1)
    this.viewportSize.height = Math.max(height, 1)
  }

  public setContentMetrics(metrics: MapMetrics) {
    this.contentSize.width = metrics.width
    this.contentSize.height = metrics.height
  }

  public getState(): CameraState {
    return { ...this.state }
  }

  public fitToViewport() {
    const padding = this.viewportOptions.fitPadding
    const availableWidth = Math.max(this.viewportSize.width - padding * 2, 1)
    const availableHeight = Math.max(this.viewportSize.height - padding * 2, 1)

    this.state.scale = this.clampScale(
      Math.min(
        availableWidth / this.contentSize.width,
        availableHeight / this.contentSize.height
      )
    )

    this.clampPosition()
    return this.getState()
  }

  public panBy(deltaX: number, deltaY: number) {
    this.state.x += deltaX
    this.state.y += deltaY
    this.clampPosition()
    return this.getState()
  }

  public zoomBy(factor: number, origin: WorldPoint) {
    return this.zoomAt(this.state.scale * factor, origin)
  }

  public zoomAt(nextScale: number, origin: WorldPoint) {
    const clampedScale = this.clampScale(nextScale)
    const worldPoint = this.screenToWorld(origin.x, origin.y)

    this.state.scale = clampedScale
    this.state.x = origin.x - worldPoint.x * clampedScale
    this.state.y = origin.y - worldPoint.y * clampedScale

    this.clampPosition()
    return this.getState()
  }

  public screenToWorld(x: number, y: number): WorldPoint {
    return {
      x: (x - this.state.x) / this.state.scale,
      y: (y - this.state.y) / this.state.scale,
    }
  }

  public worldToScreen(x: number, y: number): WorldPoint {
    return {
      x: x * this.state.scale + this.state.x,
      y: y * this.state.scale + this.state.y,
    }
  }

  public clampToBounds() {
    this.clampPosition()
    return this.getState()
  }

  private clampScale(scale: number) {
    return clamp(scale, this.viewportOptions.zoomMin, this.viewportOptions.zoomMax)
  }

  private clampPosition() {
    const scaledWidth = this.contentSize.width * this.state.scale
    const scaledHeight = this.contentSize.height * this.state.scale

    if (scaledWidth <= this.viewportSize.width) {
      this.state.x = (this.viewportSize.width - scaledWidth) / 2
    } else {
      this.state.x = clamp(
        this.state.x,
        this.viewportSize.width - scaledWidth,
        0
      )
    }

    if (scaledHeight <= this.viewportSize.height) {
      this.state.y = (this.viewportSize.height - scaledHeight) / 2
    } else {
      this.state.y = clamp(
        this.state.y,
        this.viewportSize.height - scaledHeight,
        0
      )
    }
  }
}
