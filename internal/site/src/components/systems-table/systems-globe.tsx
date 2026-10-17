import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import type { Row } from "@tanstack/react-table"
import { Trans, useLingui } from "@lingui/react/macro"
import { GlobeIcon, HomeIcon, MapPinOffIcon, PauseIcon, PlayIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { $router } from "@/components/router"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { SystemStatus } from "@/lib/enums"
import { $userSettings } from "@/lib/stores"
import type { SystemLocation, SystemRecord } from "@/types"
import { cn, decimalString } from "@/lib/utils"
import { cityDisplayName, cleanCityName } from "./globe/city-names"
import { GlobeRenderer, type GlobePalette } from "./globe/globe-renderer"

/** idle rotation speed in css px/s passed to renderer.move (~6°/s at zoom 1) */
const ROTATION_SPEED = 18

// fixed canvas colors for status markers (match the table's indicator colors)
const STATUS_MARKER_COLORS: Record<string, string> = {
	up: "#22c55e",
	down: "#ef4444",
	pending: "#eab308",
	paused: "#71717a",
}

/** status badge classes for the client list */
const STATUS_BADGE_CLASSES: Record<string, string> = {
	up: "bg-green-500/15 text-green-700 dark:text-green-400",
	down: "bg-red-500/15 text-red-700 dark:text-red-400",
	pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
	paused: "bg-muted text-muted-foreground",
}

/** resolve a css custom property, falling back when unset */
function readColor(name: string, fallback: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** mix a color toward transparency (canvas accepts color-mix in modern browsers) */
function withAlpha(color: string, pct: number): string {
	return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

function buildPalette(light: boolean): GlobePalette {
	const fg = readColor("--foreground", light ? "#18181b" : "#fafafa")
	const ocean = readColor("--secondary", light ? "#f4f4f5" : "#27272a")
	return {
		ocean,
		// opaque limb shade mixed toward the foreground so the disc never turns translucent
		oceanShade: `color-mix(in srgb, ${ocean} 86%, ${fg} 14%)`,
		grid: readColor("--border", light ? "#e4e4e7" : "#3f3f46"),
		land: readColor("--muted-foreground", light ? "#71717a" : "#a1a1aa"),
		atmosphere: withAlpha(readColor("--primary", light ? "#18181b" : "#fafafa"), light ? 14 : 20),
		markerStroke: readColor("--background", light ? "#ffffff" : "#09090b"),
		labelBg: readColor("--popover", light ? "#ffffff" : "#18181b"),
		labelBorder: readColor("--border", light ? "#e4e4e7" : "#3f3f46"),
		labelText: readColor("--popover-foreground", light ? "#18181b" : "#fafafa"),
	}
}

/** ISO 3166-1 alpha-2 code -> flag emoji (rendered by the bundled Twemoji flags font) */
function flagEmoji(cc: string): string {
	return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

function locationLabel(location?: SystemLocation): string {
	if (!location) return ""
	return [location.city, location.country].filter(Boolean).join(", ")
}

const controlButton = "h-7 w-7 bg-card/80 backdrop-blur-sm"

const SystemsGlobeView = memo(({ rows }: { rows: Row<SystemRecord>[] }) => {
	const { t, i18n } = useLingui()
	const { resolvedTheme } = useTheme()
	const { colorWarn = 65, colorCrit = 90 } = useStore($userSettings, { keys: ["colorWarn", "colorCrit"] })

	// localized country names from the geocoder's ISO codes (e.g. DE -> 德国 / Germany)
	const regionNames = useMemo(() => {
		try {
			return new Intl.DisplayNames([i18n.locale || "en"], { type: "region" })
		} catch {
			return null
		}
	}, [i18n.locale])

	// list subtitle: localized country + localized city, e.g. 德国·柏林
	const placeText = useCallback(
		(system: SystemRecord) => {
			const location = system.location
			if (!location) return ""
			const cc = location.cc
			let country: string | undefined
			if (cc) {
				try {
					country = regionNames?.of(cc.toUpperCase()) ?? location.country
				} catch {
					country = location.country
				}
			} else {
				country = location.country
			}
			const city = cityDisplayName(location.city, i18n.locale)
			return [country, city].filter(Boolean).join("·")
		},
		[regionNames, i18n.locale]
	)

	// meter fill color, matching the table's threshold coloring
	const meterClassFor = (system: SystemRecord, value?: number) => {
		if (system.status !== SystemStatus.Up) return "bg-primary/40"
		const pct = value ?? 0
		if (pct >= colorCrit) return "bg-red-500"
		if (pct >= colorWarn) return "bg-yellow-500"
		return "bg-green-500"
	}

	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const rendererRef = useRef<GlobeRenderer | null>(null)
	const themeRef = useRef(resolvedTheme)
	themeRef.current = resolvedTheme
	const [rendererReady, setRendererReady] = useState(false)
	const [rotating, setRotating] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
	const rotatingRef = useRef(rotating)
	rotatingRef.current = rotating
	const [hover, setHover] = useState<{ system: SystemRecord; x: number; y: number } | null>(null)
	const hoverRef = useRef(hover)
	hoverRef.current = hover

	const systems = useMemo(() => rows.map((row) => row.original), [rows])
	const { positioned, unpositioned } = useMemo(() => {
		const positioned: SystemRecord[] = []
		const unpositioned: SystemRecord[] = []
		for (const system of systems) {
			if (system.location && (system.location.lat !== 0 || system.location.lng !== 0)) {
				positioned.push(system)
			} else {
				unpositioned.push(system)
			}
		}
		return { positioned, unpositioned }
	}, [systems])

	// clients per city (country+city group), shown as ×N on the globe label
	const cityCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const system of positioned) {
			const location = system.location
			if (!location) continue
			const cc = location.cc ?? ""
			const city = cleanCityName(location.city ?? "")
			const key = `${cc}|${city}`
			counts.set(key, (counts.get(key) ?? 0) + 1)
		}
		return counts
	}, [positioned])

	const markers = useMemo(
		() =>
			positioned.flatMap((system) => {
				const location = system.location
				if (!location || (location.lat === 0 && location.lng === 0)) return []
				const cc = location.cc
				// globe labels use the cleaned English city name; the list shows the localized one
				const city = cleanCityName(location.city ?? "")
				const group = `${cc ?? ""}|${city}`
				return [
					{
						id: system.id,
						lat: location.lat,
						lng: location.lng,
						color: STATUS_MARKER_COLORS[system.status] ?? STATUS_MARKER_COLORS.paused,
						flag: cc,
						group,
						cityLabel: cc ? `${cc}·${city}` : city,
						count: cityCounts.get(group),
					},
				]
			}),
		[positioned, cityCounts]
	)

	const statusCounts = useMemo(() => {
		const counts = { up: 0, down: 0, other: 0 }
		for (const system of positioned) {
			if (system.status === SystemStatus.Up) counts.up++
			else if (system.status === SystemStatus.Down) counts.down++
			else counts.other++
		}
		return counts
	}, [positioned])

	// create the renderer once and keep it sized to its container
	useEffect(() => {
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!canvas || !container) return
		const renderer = new GlobeRenderer(canvas, buildPalette(themeRef.current === "light"))
		rendererRef.current = renderer
		renderer.resize(container.clientWidth, container.clientHeight)
		const observer = new ResizeObserver(() => {
			renderer.resize(container.clientWidth, container.clientHeight)
		})
		observer.observe(container)
		setRendererReady(true)
		return () => {
			observer.disconnect()
			rendererRef.current = null
			setRendererReady(false)
		}
	}, [])

	// apply palette on theme change; deferred a frame so the theme-provider's
	// class flip on <html> (a parent effect) lands before CSS vars are read
	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			rendererRef.current?.setPalette(buildPalette(resolvedTheme === "light"))
		})
		return () => cancelAnimationFrame(raf)
	}, [resolvedTheme, rendererReady])

	// push markers into the renderer
	useEffect(() => {
		rendererRef.current?.setMarkers(markers)
	}, [markers, rendererReady])

	// render loop at display refresh rate (rotation smoothness depends on it)
	useEffect(() => {
		if (!rendererReady) return
		let raf = 0
		let last = performance.now()
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame)
			const elapsed = now - last
			if (elapsed < 1000 / 61) return
			const dt = Math.min(0.2, elapsed / 1000)
			last = now
			const renderer = rendererRef.current
			if (!renderer) return
			renderer.update(dt)
			// idle rotation pauses while a marker is hovered so it stays under the cursor
			if (rotatingRef.current && !hoverRef.current && !renderer.hoveredId) {
				renderer.move(ROTATION_SPEED * dt, 0)
			}
			renderer.draw()
		}
		raf = requestAnimationFrame(frame)
		return () => cancelAnimationFrame(raf)
	}, [rendererReady])

	// pointer drag / tap / hover handling
	const dragState = useRef<{ pointerId: number; lastX: number; lastY: number; moved: number } | null>(null)

	const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!e.isPrimary) return
		dragState.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0 }
		e.currentTarget.setPointerCapture(e.pointerId)
	}, [])

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			const renderer = rendererRef.current
			if (!renderer) return
			const drag = dragState.current
			if (drag && drag.pointerId === e.pointerId) {
				const dx = e.clientX - drag.lastX
				const dy = e.clientY - drag.lastY
				drag.lastX = e.clientX
				drag.lastY = e.clientY
				drag.moved += Math.abs(dx) + Math.abs(dy)
				renderer.move(dx, dy)
				return
			}
			// hover detection when not dragging
			const rect = e.currentTarget.getBoundingClientRect()
			const id = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top)
			renderer.hoveredId = id
			if (id) {
				const system = positioned.find((s) => s.id === id)
				if (system) {
					setHover({ system, x: e.clientX - rect.left, y: e.clientY - rect.top })
					return
				}
			}
			if (hoverRef.current) setHover(null)
		},
		[positioned]
	)

	const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragState.current
		if (!drag || drag.pointerId !== e.pointerId) return
		dragState.current = null
		e.currentTarget.releasePointerCapture(e.pointerId)
		// treat as a click when the pointer barely moved
		if (drag.moved < 6) {
			const renderer = rendererRef.current
			if (!renderer) return
			const rect = e.currentTarget.getBoundingClientRect()
			const id = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top)
			if (id) {
				renderer.hoveredId = null
				setHover(null)
				$router.open(getPagePath($router, "system", { id }))
			}
		}
	}, [])

	const onPointerLeave = useCallback(() => {
		const renderer = rendererRef.current
		if (renderer) renderer.hoveredId = null
		setHover(null)
	}, [])

	// wheel zoom needs a non-passive listener to prevent page scroll
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey) return
			e.preventDefault()
			const renderer = rendererRef.current
			if (!renderer) return
			renderer.zoomBy(Math.exp(-e.deltaY * 0.0015))
		}
		canvas.addEventListener("wheel", onWheel, { passive: false })
		return () => canvas.removeEventListener("wheel", onWheel)
	}, [rendererReady])

	const onKeyDown = useCallback((e: React.KeyboardEvent) => {
		const renderer = rendererRef.current
		if (!renderer) return
		const step = 30
		if (e.key === "ArrowLeft") renderer.move(step, 0)
		else if (e.key === "ArrowRight") renderer.move(-step, 0)
		else if (e.key === "ArrowUp") renderer.move(0, step)
		else if (e.key === "ArrowDown") renderer.move(0, -step)
		else if (e.key === "+" || e.key === "=") {
			renderer.zoomBy(1.2)
		} else if (e.key === "-") {
			renderer.zoomBy(1 / 1.2)
		} else if (e.key === "Home") {
			renderer.reset()
		} else {
			return
		}
		e.preventDefault()
	}, [])

	const highlightMarker = useCallback((id: string | null) => {
		const renderer = rendererRef.current
		if (renderer) renderer.hoveredId = id
	}, [])

	const openSystem = useCallback((id: string) => {
		$router.open(getPagePath($router, "system", { id }))
	}, [])

	return (
		<div className="flex w-full flex-col gap-3 lg:h-[500px] lg:flex-row">
			<div
				ref={containerRef}
				className="relative h-[300px] shrink-0 overflow-hidden rounded-md border bg-card/40 sm:h-[380px] lg:h-full lg:min-w-0 lg:flex-[2]"
			>
				<canvas
					ref={canvasRef}
					className="absolute inset-0 size-full touch-none select-none cursor-grab active:cursor-grabbing"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerLeave={onPointerLeave}
					onKeyDown={onKeyDown}
					tabIndex={0}
					aria-label={t`Globe view of all systems. Drag to rotate, scroll to zoom.`}
				/>

				{hover && (
					<div
						className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md"
						style={{
							left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 300) - 190),
							top: Math.max(hover.y - 10, 8),
						}}
					>
						<div className="flex items-center gap-1.5 font-semibold">
							<span
								className="size-2 rounded-full"
								style={{ backgroundColor: STATUS_MARKER_COLORS[hover.system.status] ?? STATUS_MARKER_COLORS.paused }}
							/>
							{hover.system.name}
						</div>
						{(hover.system.location?.city || hover.system.location?.country) && (
							<div className="text-muted-foreground mt-0.5">{locationLabel(hover.system.location)}</div>
						)}
						{hover.system.status === SystemStatus.Up ? (
							<div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5 tabular-nums">
								<span>CPU {Math.round(hover.system.info.cpu ?? 0)}%</span>
								<span>MEM {Math.round(hover.system.info.mp ?? 0)}%</span>
								<span>DSK {Math.round(hover.system.info.dp ?? 0)}%</span>
							</div>
						) : (
							<div className="text-muted-foreground mt-1">{hover.system.status}</div>
						)}
					</div>
				)}

				{positioned.length > 0 && (
					<div className="absolute right-2 top-2 flex flex-col gap-1">
						<Button
							variant="outline"
							size="icon"
							className={controlButton}
							onClick={() => setRotating((prev) => !prev)}
							aria-label={rotating ? t`Pause rotation` : t`Resume rotation`}
						>
							{rotating ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
						</Button>
						<Button
							variant="outline"
							size="icon"
							className={controlButton}
							onClick={() => rendererRef.current?.zoomBy(1.25)}
							aria-label={t`Zoom in`}
						>
							<ZoomInIcon className="size-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className={controlButton}
							onClick={() => rendererRef.current?.zoomBy(1 / 1.25)}
							aria-label={t`Zoom out`}
						>
							<ZoomOutIcon className="size-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className={controlButton}
							onClick={() => rendererRef.current?.reset()}
							aria-label={t`Reset view`}
						>
							<HomeIcon className="size-3.5" />
						</Button>
					</div>
				)}

				{positioned.length > 0 && (
					<div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md border bg-card/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-green-500" />
							{statusCounts.up} {t`up`}
						</span>
						{statusCounts.down > 0 && (
							<span className="flex items-center gap-1">
								<span className="size-2 rounded-full bg-red-500" />
								{statusCounts.down} {t`down`}
							</span>
						)}
						{statusCounts.other > 0 && (
							<span className="flex items-center gap-1">
								<span className="size-2 rounded-full bg-zinc-500" />
								{statusCounts.other}
							</span>
						)}
					</div>
				)}

				{positioned.length === 0 && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
						<GlobeIcon className="size-10 opacity-50" />
						<p className="max-w-96 text-sm">
							<Trans>
								No system locations yet. The hub locates systems automatically from their agent's connection IP (public
								addresses only); you can also set a location manually in the edit system dialog.
							</Trans>
						</p>
					</div>
				)}
			</div>

			<ul
				className="flex min-h-0 flex-col gap-1 overflow-y-auto lg:w-1/3 lg:flex-1 lg:rounded-md lg:border lg:p-1.5"
				onMouseLeave={() => highlightMarker(null)}
			>
				{systems.length === 0 && (
					<li className="px-3 py-8 text-center text-sm text-muted-foreground">
						<Trans>No systems found.</Trans>
					</li>
				)}
				{[...positioned, ...unpositioned].map((system) => {
					const cc = system.location?.cc
					const statusLabel =
						system.status === SystemStatus.Up
							? t`Up`
							: system.status === SystemStatus.Down
								? t`Down`
								: system.status === SystemStatus.Paused
									? t`Paused`
									: t`Pending`
					const country = placeText(system)
					return (
						<li key={system.id}>
							<button
								type="button"
								className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-start transition-colors hover:bg-muted/60 lg:gap-3 lg:px-3 lg:py-2.5"
								onClick={() => openSystem(system.id)}
								onMouseEnter={() => positioned.includes(system) && highlightMarker(system.id)}
								onFocus={() => positioned.includes(system) && highlightMarker(system.id)}
								onBlur={() => highlightMarker(null)}
							>
								<span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-base leading-none lg:size-9 lg:text-lg">
									{cc ? (
										<span className="translate-y-px">{flagEmoji(cc)}</span>
									) : (
										<MapPinOffIcon className="size-3.5 text-muted-foreground" />
									)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-1.5">
										<span className="truncate text-[13px] font-medium lg:text-[15px] lg:font-semibold">
											{system.name}
										</span>
										<span
											className={cn(
												"shrink-0 rounded px-1 text-[9px] font-medium leading-4 lg:px-1.5 lg:text-[11px] lg:leading-5",
												STATUS_BADGE_CLASSES[system.status] ?? STATUS_BADGE_CLASSES.paused
											)}
										>
											{statusLabel}
										</span>
									</span>
									<span className="block truncate text-[11px] text-muted-foreground lg:text-[13px]">
										{country || t`Location not set`}
									</span>
								</span>
								<span className="grid w-32 shrink-0 gap-1 lg:w-44 lg:gap-1.5">
									<GaugeBar label="CPU" value={system.info.cpu} meterClass={meterClassFor(system, system.info.cpu)} />
									<GaugeBar label={t`MEM`} value={system.info.mp} meterClass={meterClassFor(system, system.info.mp)} />
									<GaugeBar label={t`DSK`} value={system.info.dp} meterClass={meterClassFor(system, system.info.dp)} />
								</span>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
})

/** usage row for the client list: label + percent + threshold-colored bar (mirrors the table's meter) */
function GaugeBar({ label, value, meterClass }: { label: string; value?: number; meterClass: string }) {
	const pct = Math.max(0, Math.min(100, value ?? 0))
	return (
		<span className="flex items-center gap-1.5 tabular-nums">
			<span className="w-6 shrink-0 text-[9px] text-muted-foreground lg:w-8 lg:text-[11px]">{label}</span>
			<span className="w-8 shrink-0 text-end text-[10px] text-muted-foreground lg:w-10 lg:text-xs lg:font-medium">
				{decimalString(pct, 1)}%
			</span>
			<span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted lg:h-1.5">
				<span className={cn("block h-full rounded-full", meterClass)} style={{ width: `${pct}%` }} />
			</span>
		</span>
	)
}

export default SystemsGlobeView
