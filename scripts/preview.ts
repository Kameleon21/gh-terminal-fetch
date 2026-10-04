// Renders SVG frames to PNG with headless Chrome so they can be inspected.
// Usage: bun scripts/preview.ts terminal.svg 4 8 12  (seconds to capture)
import { $ } from "bun";
const [file, ...times] = process.argv.slice(2);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const svg = await Bun.file(file).text();
const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!;
const [w, h] = [+vb[1], +vb[2]];
for (const t of times.length ? times : ["0"]) {
  // Pause every animation at time t by forcing a negative delay.
  const html = `<html><body style="margin:0;background:#0d1117"><style>*{animation-play-state:paused!important}</style>${svg}<script>
    document.querySelectorAll('*').forEach(e=>{const s=getComputedStyle(e);if(s.animationName!=='none'){const d=s.animationDelay.split(',').map(x=>parseFloat(x)-${t});e.style.animationDelay=d.map(x=>x+'s').join(',')}});
    const r=document.querySelector('svg');if(r.pauseAnimations){r.pauseAnimations();r.setCurrentTime(${t})}
  </script></body></html>`;
  const tmp = `/tmp/preview-${Date.now()}.html`;
  await Bun.write(tmp, html);
  const out = file.replace(/\.svg$/, `@${t}s.png`);
  await $`${chrome} --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=${w},${h} --screenshot=${out} file://${tmp}`.quiet();
  console.log(out);
}
