import { LAND_DOTS } from "./globe-data"

const DEG = Math.PI / 180
/** latitude rotation is clamped to avoid flipping over the poles */
const MAX_LAT = 75 * DEG
/** zoom range */
const MIN_ZOOM = 1
const MAX_ZOOM = 2

export interface GlobeMarker {
	id: string
	lat: number
	lng: number
	/** fill color for the marker */
	color: string
	/** ISO 3166-1 alpha-2 code; when set (and the flag font is ready) markers render as circular flag badges */
	flag?: string
}

export interface GlobePalette {
	/** ocean disc fill, center shade */
	ocean: string
	/** ocean disc fill, limb shade */
	oceanShade: string
	/** sphere edge stroke and graticule lines */
	grid: string
	/** land dot fill */
	land: string
	/** atmosphere glow color */
	atmosphere: string
	/** marker outline color for contrast against the ocean */
	markerStroke: string
	/** floating label background */
	labelBg: string
	/** floating label border */
	labelBorder: string
	/** floating label text color */
	labelText: string
}

interface Vec3 {
	x: number
	y: number
	z: number
}

/** unit vector for a lat/lng pair (lat/lng in degrees) */
function toVec(lat: number, lng: number): Vec3 {
	const phi = lat * DEG
	const lambda = lng * DEG
	const cosPhi = Math.cos(phi)
	return { x: cosPhi * Math.sin(lambda), y: Math.sin(phi), z: cosPhi * Math.cos(lambda) }
}

// precomputed xyz vectors for the land dot grid (module-level memo)
let landVecs: Vec3[] | null = null
function getLandVecs(): Vec3[] {
	if (!landVecs) {
		landVecs = LAND_DOTS.map(([lat, lng]) => toVec(lat, lng))
	}
	return landVecs
}

// the bundled Twemoji Country Flags font renders ISO flag emoji on canvas
let flagFontReady = false
if (typeof document !== "undefined") {
	document.fonts
		?.load("24px TwemojiCountryFlags", "🇺🇸")
		.then(() => {
			flagFontReady = true
		})
		.catch(() => {})
}

/** converts an ISO 3166-1 alpha-2 code into its flag emoji */
function flagEmoji(cc: string): string {
	return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** sprites are rendered at 2x+ for crispness on hi-dpi canvases */
const FLAG_SPRITE_SIZE = 48

/** font for the country-code text in floating labels (size scales with the canvas) */
function labelFont(scale: number): string {
	return `600 ${Math.round(12 * scale)}px InterVariable, Inter, sans-serif`
}

/** cached label text widths, keyed by font+text */
const textWidthCache = new Map<string, number>()
function measureText(text: string, font: string): number {
	const key = `${font}|${text}`
	let width = textWidthCache.get(key)
	if (width === undefined) {
		const canvas = document.createElement("canvas")
		const ctx = canvas.getContext("2d")
		if (!ctx) return 20
		ctx.font = font
		width = ctx.measureText(text).width
		textWidthCache.set(key, width)
	}
	return width
}

/** Renders an orthographic dot-matrix globe on a 2D canvas. All coordinates are CSS pixels. */
export class GlobeRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private palette: GlobePalette
	private markers: GlobeMarker[] = []
	/** markers keyed by id, rebuilt in setMarkers */
	private markerById = new Map<string, GlobeMarker>()
	/** label size multiplier, derived from canvas width (mobile ~1x, desktop up to 1.4x) */
	private labelScale = 1
	/** view rotation: latitude/longitude at the center of the projection (radians) */
	private viewLat = 25 * DEG
	private viewLng = 105 * DEG
	/** current and target zoom; zoom eases toward the target on each update */
	private zoom = 1
	private targetZoom = 1
	/** focus animation state, inactive when target is null */
	private focusTarget: { lat: number; lng: number } | null = null
	/** css pixel size of the canvas */
	private width = 0
	private height = 0
	private radius = 0
	/** screen positions of the markers from the last draw, for hit testing */
	private projected: { id: string; x: number; y: number; z: number }[] = []
	/** cached offscreen circular flag badges, keyed by ISO country code */
	private flagSprites = new Map<string, HTMLCanvasElement>()
	/** marker currently hovered (drawn with a highlight ring) */
	hoveredId: string | null = null

	constructor(canvas: HTMLCanvasElement, palette: GlobePalette) {
		this.canvas = canvas
		const ctx = canvas.getContext("2d")
		if (!ctx) throw new Error("Canvas 2D context unavailable")
		this.ctx = ctx
		this.palette = palette
	}

	setPalette(palette: GlobePalette) {
		this.palette = palette
		// sprite backgrounds follow the theme, so drop stale badges
		this.flagSprites.clear()
	}

	setMarkers(markers: GlobeMarker[]) {
		this.markers = markers
		this.markerById = new Map(markers.map((m) => [m.id, m]))
	}

	/** Resize backing store for a css pixel size change; DPR is capped to bound fill cost. */
	resize(width: number, height: number) {
		const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
		this.width = width
		this.height = height
		this.canvas.width = Math.max(1, Math.round(width * dpr))
		this.canvas.height = Math.max(1, Math.round(height * dpr))
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		this.radius = (Math.min(width, height) / 2) * 0.86
		// labels: phone-width canvases keep the base size, wide desktop panels scale up
		this.labelScale = Math.min(1.4, Math.max(1, width / 650))
	}

	/** Drag rotation; dx/dy are pointer deltas in CSS pixels. */
	move(dx: number, dy: number) {
		this.focusTarget = null
		const scale = (0.35 * DEG) / this.zoom
		this.viewLng -= dx * scale
		this.viewLat = Math.min(MAX_LAT, Math.max(-MAX_LAT, this.viewLat + dy * scale))
	}

	/** Multiply the zoom level, clamped to [MIN_ZOOM, MAX_ZOOM]. */
	zoomBy(factor: number) {
		this.focusTarget = null
		this.setZoom(this.targetZoom * factor)
	}

	setZoom(zoom: number) {
		this.targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
	}

	getZoom() {
		return this.targetZoom
	}

	/** Rotate the view so the given point is centered; animated in update(). */
	focus(lat: number, lng: number) {
		this.focusTarget = { lat: lat * DEG, lng: lng * DEG }
	}

	/** Reset to the default view. */
	reset() {
		this.focusTarget = null
		this.viewLat = 25 * DEG
		this.viewLng = 105 * DEG
		this.setZoom(1)
	}

	/** Ease zoom and focus animation forward; call once per frame before draw(). */
	update(dt: number) {
		this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 10)
		if (this.focusTarget) {
			let dLng = this.focusTarget.lng - this.viewLng
			// wrap to the shortest path around the antimeridian
			dLng = ((((dLng + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
			const dLat = this.focusTarget.lat - this.viewLat
			const step = Math.min(1, dt * 5)
			if (Math.abs(dLng) < 0.002 && Math.abs(dLat) < 0.002) {
				this.viewLng = this.focusTarget.lng
				this.viewLat = this.focusTarget.lat
				this.focusTarget = null
			} else {
				this.viewLng += dLng * step
				this.viewLat = Math.min(MAX_LAT, Math.max(-MAX_LAT, this.viewLat + dLat * step))
			}
		}
	}

	/** Rotate a unit vector into view space and return view-space coords plus depth. */
	private project(vec: Vec3) {
		const cosLng = Math.cos(this.viewLng)
		const sinLng = Math.sin(this.viewLng)
		const x1 = vec.x * cosLng - vec.z * sinLng
		const z1 = vec.x * sinLng + vec.z * cosLng
		const cosLat = Math.cos(this.viewLat)
		const sinLat = Math.sin(this.viewLat)
		const y2 = vec.y * cosLat - z1 * sinLat
		const z2 = vec.y * sinLat + z1 * cosLat
		return { x: x1, y: y2, z: z2 }
	}

	/** Draw one full frame. */
	draw() {
		const ctx = this.ctx
		const width = this.width
		const height = this.height
		const cx = width / 2
		const cy = height / 2
		const r = this.radius * this.zoom
		ctx.clearRect(0, 0, width, height)

		// atmosphere glow
		const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.18)
		glow.addColorStop(0, this.palette.atmosphere)
		glow.addColorStop(1, "transparent")
		ctx.fillStyle = glow
		ctx.beginPath()
		ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2)
		ctx.fill()

		// ocean disc with subtle limb shading
		const ocean = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r)
		ocean.addColorStop(0, this.palette.ocean)
		ocean.addColorStop(1, this.palette.oceanShade)
		ctx.fillStyle = ocean
		ctx.beginPath()
		ctx.arc(cx, cy, r, 0, Math.PI * 2)
		ctx.fill()
		ctx.strokeStyle = this.palette.grid
		ctx.lineWidth = 1
		ctx.stroke()

		this.drawGraticule(cx, cy, r)
		this.drawLandDots(cx, cy, r)
		this.drawMarkers(cx, cy, r)
	}

	/** Graticule every 30°, path segments broken where points fall behind the sphere. */
	private drawGraticule(cx: number, cy: number, r: number) {
		const ctx = this.ctx
		ctx.strokeStyle = this.palette.grid
		ctx.lineWidth = 1
		ctx.beginPath()
		const strokePolyline = (points: [number, number][]) => {
			let penDown = false
			for (const [lat, lng] of points) {
				const p = this.project(toVec(lat, lng))
				if (p.z <= 0) {
					penDown = false
					continue
				}
				if (penDown) {
					ctx.lineTo(cx + r * p.x, cy - r * p.y)
				} else {
					ctx.moveTo(cx + r * p.x, cy - r * p.y)
					penDown = true
				}
			}
		}
		for (let lng = -180; lng < 180; lng += 30) {
			const points: [number, number][] = []
			for (let lat = -80; lat <= 80; lat += 4) {
				points.push([lat, lng])
			}
			strokePolyline(points)
		}
		for (let lat = -60; lat <= 60; lat += 30) {
			const points: [number, number][] = []
			for (let lng = -180; lng <= 180; lng += 4) {
				points.push([lat, lng])
			}
			strokePolyline(points)
		}
		ctx.stroke()
	}

	/** Land dots in three depth buckets so back dots recede without per-dot styling. */
	private drawLandDots(cx: number, cy: number, r: number) {
		const ctx = this.ctx
		const buckets: Vec3[][] = [[], [], []]
		for (const vec of getLandVecs()) {
			const p = this.project(vec)
			if (p.z <= 0) continue
			buckets[p.z > 0.66 ? 2 : p.z > 0.33 ? 1 : 0].push(p)
		}
		const base = Math.max(1.1, r * 0.011)
		for (let tier = 0; tier < 3; tier++) {
			const depth = (tier + 1) / 3
			ctx.globalAlpha = 0.35 + 0.5 * depth
			ctx.fillStyle = this.palette.land
			ctx.beginPath()
			for (const p of buckets[tier]) {
				const size = base * (0.6 + 0.4 * depth)
				ctx.moveTo(cx + r * p.x + size, cy - r * p.y)
				ctx.arc(cx + r * p.x, cy - r * p.y, size, 0, Math.PI * 2)
			}
			ctx.fill()
		}
		ctx.globalAlpha = 1
	}

	/** floating label geometry from the last draw, for hit testing */
	private labels: { id: string; x: number; y: number; w: number; h: number }[] = []

	/** Status markers as pulsing dots, sorted so nearer markers paint on top. */
	private drawMarkers(cx: number, cy: number, r: number) {
		const ctx = this.ctx
		this.projected = this.markers
			.map((m) => {
				const p = this.project(toVec(m.lat, m.lng))
				return { id: m.id, x: cx + r * p.x, y: cy - r * p.y, z: p.z }
			})
			.filter((m) => m.z > 0.05)
			.sort((a, b) => a.z - b.z)
		// breathing halo, one shared phase for all dots
		const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320)
		const anchors = new Map<string, number>()
		for (const m of this.projected) {
			const marker = this.markerById.get(m.id)
			const color = marker?.color ?? this.palette.markerStroke
			const size = 4.5 * (0.85 + 0.15 * m.z)
			anchors.set(m.id, size)
			const mx = Math.round(m.x)
			const my = Math.round(m.y)
			if (m.id === this.hoveredId) {
				ctx.beginPath()
				ctx.arc(mx, my, size + 4, 0, Math.PI * 2)
				ctx.strokeStyle = this.palette.markerStroke
				ctx.lineWidth = 1.5
				ctx.stroke()
			}
			// expanding fading halo gives the dot its blink
			ctx.beginPath()
			ctx.arc(mx, my, size + 2 + 3 * pulse, 0, Math.PI * 2)
			ctx.globalAlpha = 0.3 * (1 - pulse)
			ctx.fillStyle = color
			ctx.fill()
			ctx.globalAlpha = 1
			// core dot
			ctx.beginPath()
			ctx.arc(mx, my, size, 0, Math.PI * 2)
			ctx.fillStyle = color
			ctx.fill()
			ctx.strokeStyle = this.palette.markerStroke
			ctx.lineWidth = 1.5
			ctx.stroke()
		}
		this.drawLabels(anchors)
	}

	/**
	 * Floating flag+country-code labels that ride their marker: the label sits at
	 * a fixed offset from the dot (right of it, flipped to the left near the right
	 * edge), so it rotates in perfect sync with the globe — KPanel-style.
	 */
	private drawLabels(anchors: Map<string, number>) {
		const ctx = this.ctx
		const width = this.width
		const height = this.height
		const s = this.labelScale
		this.labels = []
		const labelH = 28 * s
		const flagR = 10 * s
		const gap = 8 * s
		const font = labelFont(s)
		for (const m of this.projected) {
			const marker = this.markerById.get(m.id)
			if (!marker?.flag || !flagFontReady) continue
			const cc = marker.flag.toUpperCase()
			const anchor = anchors.get(m.id) ?? 5
			const textWidth = measureText(cc, font)
			const w = Math.ceil(gap + flagR * 2 + 6 + textWidth + gap)
			// position = pure function of the dot: right of it, flipped near the right
			// edge, vertically centered on the dot, clamped to the canvas
			const onRight = m.x + anchor + gap + w <= width - 4
			const x = Math.round(onRight ? m.x + anchor + gap : m.x - anchor - gap - w)
			const y = Math.round(Math.max(4, Math.min(height - labelH - 4, m.y - labelH / 2)))
			this.labels.push({ id: m.id, x, y, w, h: labelH })

			// thin horizontal connector line from the dot to the label edge
			const anchorX = m.x + (onRight ? anchor + 1 : -(anchor + 1))
			const edgeX = onRight ? x - 1.5 : x + w + 1.5
			ctx.beginPath()
			ctx.moveTo(anchorX, m.y)
			ctx.lineTo(edgeX, m.y)
			ctx.strokeStyle = this.palette.grid
			ctx.lineWidth = 1
			ctx.stroke()
		}
		// paint labels above markers and connectors
		for (const l of this.labels) {
			const marker = this.markerById.get(l.id)
			const hovered = l.id === this.hoveredId
			ctx.beginPath()
			ctx.roundRect(l.x, l.y, l.w, l.h, 8 * s)
			ctx.fillStyle = this.palette.labelBg
			ctx.fill()
			ctx.strokeStyle = hovered ? (marker?.color ?? this.palette.labelBorder) : this.palette.labelBorder
			ctx.lineWidth = hovered ? 1.5 : 1
			ctx.stroke()
			const flagX = l.x + gap + flagR
			const flagY = l.y + labelH / 2
			const sprite = marker?.flag ? this.getFlagSprite(marker.flag) : null
			if (sprite) {
				ctx.save()
				ctx.beginPath()
				ctx.arc(flagX, flagY, flagR, 0, Math.PI * 2)
				ctx.clip()
				ctx.drawImage(sprite, flagX - flagR, flagY - flagR, flagR * 2, flagR * 2)
				ctx.restore()
				ctx.beginPath()
				ctx.arc(flagX, flagY, flagR, 0, Math.PI * 2)
				ctx.strokeStyle = this.palette.labelBorder
				ctx.lineWidth = 1
				ctx.stroke()
			}
			const cc = marker?.flag?.toUpperCase() ?? ""
			ctx.font = font
			ctx.fillStyle = this.palette.labelText
			ctx.textAlign = "left"
			ctx.textBaseline = "middle"
			ctx.fillText(cc, l.x + gap + flagR * 2 + 6, flagY + 0.5)
		}
	}

	/** Render (and cache) a circular flag badge for an ISO country code. */
	private getFlagSprite(cc: string): HTMLCanvasElement | null {
		const cached = this.flagSprites.get(cc)
		if (cached) return cached
		const sprite = document.createElement("canvas")
		sprite.width = FLAG_SPRITE_SIZE
		sprite.height = FLAG_SPRITE_SIZE
		const sctx = sprite.getContext("2d")
		if (!sctx) return null
		sctx.fillStyle = this.palette.markerStroke
		sctx.fillRect(0, 0, FLAG_SPRITE_SIZE, FLAG_SPRITE_SIZE)
		sctx.font = `${FLAG_SPRITE_SIZE * 0.82}px TwemojiCountryFlags`
		sctx.textAlign = "center"
		sctx.textBaseline = "middle"
		sctx.fillText(flagEmoji(cc), FLAG_SPRITE_SIZE / 2, FLAG_SPRITE_SIZE / 2 + 1)
		this.flagSprites.set(cc, sprite)
		return sprite
	}

	/** Hit test labels first, then the nearest visible marker within 24px. */
	hitTest(x: number, y: number): string | null {
		for (const l of this.labels) {
			if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) {
				return l.id
			}
		}
		let best: string | null = null
		let bestDist = 24 * 24
		for (const m of this.projected) {
			const dx = m.x - x
			const dy = m.y - y
			const dist = dx * dx + dy * dy
			if (dist < bestDist) {
				bestDist = dist
				best = m.id
			}
		}
		return best
	}
}
