/**
 * Export a duet show (`?show=<id>`) as a video, frame-exact: the page's playhead is pinned to each
 * frame's time (`Transport.captureTime`) and Playwright's fake clock advances one frame between
 * screenshots, so the heads' animation runs at video time however slowly the 3D view renders
 * (software WebGL on a server can take seconds a frame). The show's mix is then muxed in.
 *
 * Usage: bun tools/duet-video.ts <show-id> <out.mp4> [--url http://127.0.0.1:5318/] [--fps 30]
 *        [--workers 4] [--size 1280x720] [--max-frames n]
 * Needs `bun run preview` (or dev) serving the show, and ffmpeg on PATH. Workers split the frames
 * into ranges; each renders a short warm-up before its range so springs and particles are settled
 * at the seam. Set CHROME to use a specific Chromium build.
 */
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const [id, outFile] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const base = opt("--url", "http://127.0.0.1:5318/");
const fps = Number(opt("--fps", "30"));
const [W, H] = opt("--size", "1280x720").split("x").map(Number);
const WARM = 20;

/** Render frames [from, to) of the show into dir (a worker). */
async function worker(dir: string, from: number, to: number): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME || undefined,
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto(`${base}?show=${encodeURIComponent(id)}`);
  let dur = 0;
  for (let k = 0; k < 600 && !(dur > 0); k++) {
    await page.clock.runFor(100);
    await page.waitForTimeout(50);
    dur = await page.evaluate(() => (window as unknown as { __duetTransport?: { duration: number } }).__duetTransport?.duration ?? 0);
  }
  if (!(dur > 0)) throw new Error(`show ${id} did not load`);
  await page.addStyleTag({ content: ".duet-bar button{visibility:hidden}" });
  for (let k = 0; k < 20; k++) await page.clock.runFor(100);
  const n = Math.ceil(dur * fps);
  const end = Math.min(n, to);
  const at = (t: number) => page.evaluate((t) => ((window as unknown as { __duetTransport: { captureTime: number | null } }).__duetTransport.captureTime = t), t);
  for (let i = Math.max(0, from - WARM); i < from; i++) {
    await at(i / fps);
    await page.clock.runFor(1000 / fps);
  }
  for (let i = from; i < end; i++) {
    await at(i / fps);
    await page.clock.runFor(1000 / fps);
    await page.screenshot({ path: join(dir, `${String(i).padStart(6, "0")}.jpg`), type: "jpeg", quality: 92 });
  }
  await browser.close();
}

if (process.env.DUET_WORKER) {
  const [dir, from, to] = process.env.DUET_WORKER.split(",");
  await worker(dir, Number(from), Number(to));
  process.exit(0);
}

if (!id || !outFile) {
  console.error("usage: bun tools/duet-video.ts <show-id> <out.mp4> [--url …] [--fps 30] [--workers 4] [--size 1280x720]");
  process.exit(2);
}
const show = await (await fetch(`${base}shows/${id}/show.json`)).json();
const audioUrl = `${base}shows/${id}/${show.audio}`;
const dir = mkdtempSync(join(tmpdir(), "duet-video-"));
const audio = join(dir, "mix");
await Bun.write(audio, await (await fetch(audioUrl)).arrayBuffer());
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio], { encoding: "utf8" });
const frames = Math.min(Math.ceil(Number(probe.stdout.trim()) * fps), Number(opt("--max-frames", "Infinity")));
const workers = Math.max(1, Number(opt("--workers", "4")));
const per = Math.ceil(frames / workers);
const framesDir = join(dir, "frames");
mkdirSync(framesDir);
console.log(`${id}: ${frames} frames at ${fps} fps, ${workers} workers`);
const t0 = Date.now();
const codes = await Promise.all(
  [...Array(workers).keys()].map(
    (w) =>
      new Promise<number>((resolve) => {
        const p = spawn(process.execPath, [import.meta.path, ...argv], { stdio: "inherit", env: { ...process.env, DUET_WORKER: `${framesDir},${w * per},${(w + 1) * per}` } });
        p.on("exit", (c) => resolve(c ?? 1));
      }),
  ),
);
if (codes.some((c) => c !== 0)) throw new Error(`a capture worker failed: ${codes.join(",")}`);
console.log(`captured in ${((Date.now() - t0) / 1000).toFixed(0)} s; encoding`);
const enc = spawnSync(
  "ffmpeg",
  ["-v", "error", "-y", "-framerate", String(fps), "-i", join(framesDir, "%06d.jpg"), "-i", audio, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", outFile],
  { stdio: "inherit" },
);
rmSync(dir, { recursive: true, force: true });
if (enc.status !== 0) throw new Error("ffmpeg failed");
console.log(`wrote ${outFile}`);
