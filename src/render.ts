// A terminal window types a fetch command, prints a neofetch-style profile panel next to a
// pixel chameleon, then paints the contribution heatmap week by week under a tmux status bar.
import type { Calendar, Day } from "./github";

// GitHub dark-mode contribution palette, index = level.
const LEVELS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
const BG = "#0d1117";

const C = {
  bg: BG,
  chrome: "#161b22",
  border: "#30363d",
  dim: "#6e7681",
  muted: "#8b949e",
  text: "#c9d1d9",
  bright: "#f0f6fc",
  pink: "#ff5fd2",
  rose: "#f78fb3",
  purple: "#a78bfa",
  violet: "#7d56f4",
  blue: "#79c0ff",
  green: "#39d353",
};

// Pixel chameleon perched on a branch, tail curled.
const LOGO = [
  "............dddddd............",
  "..........ddglglgldd..........",
  ".........dgggggggggd....dddd..",
  "........dgglgglggggdd.ddggggd.",
  ".......dgggggggggggggdggggggd.",
  "......dgglgglgglggggggggeeeggd",
  "......dggggggggggggggggeepeegd",
  ".....dggggggggggggggggggeeeggd",
  ".....dglglglglglgggggggggggggd",
  "....dggggggggggggggggddddddddd",
  "...dgllllllllllllllgggggggdd..",
  "..dgddggggdddddddggggdddd.....",
  ".dgd..dgd.......dgd...........",
  "dgd...dgd.......dgd...........",
  "dg.dd.dggd......dggd..........",
  "dg.dgdbbbbbbbbbbbbbbbbbbbbbbbb",
  ".dgggd..bb.............bb.....",
  "..ddd.........................",
];
const PX_COLOR: Record<string, string> = { d: "#0e4429", g: "#26a641", l: "#39d353", e: "#d2f8d2", p: BG, b: "#7d56f4" };

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export type Options = {
  host?: string;
  role?: string;
  location?: string;
  stack?: string[];
  building?: string[];
  command?: string;
};

export const stats = (weeks: Day[][]) => {
  const days = weeks.flat();
  let longest = 0,
    run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today often has no contributions yet, so it does not break the current streak.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i !== days.length - 1) break;
  }
  const best = days.reduce((a, b) => (b.count > a.count ? b : a));
  const byWeekday = Array(7).fill(0);
  days.forEach((d) => (byWeekday[d.weekday] += d.count));
  const busiest = WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))];
  return { longest, current, best, busiest, activeDays: days.filter((d) => d.count > 0).length };
};

const len = (s: string) => [...s].length;
const fit = (s: string, n: number) => (len(s) > n ? [...s].slice(0, n - 1).join("").trimEnd() + "…" : s);

// "Dublin, Ireland" -> "Dublin, IE" for the status bar.
const REGIONS = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();
  const A = 65;
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      const name = names.of(code);
      if (name && name !== code && name !== "Unknown Region") map.set(name.toLowerCase(), code);
    }
  return map;
})();
const shortLocation = (loc: string) => {
  const parts = loc.split(",").map((s) => s.trim());
  const code = parts.length > 1 && REGIONS.get(parts[parts.length - 1].toLowerCase());
  return code ? [...parts.slice(0, -1), code].join(", ") : loc;
};

// First segment of the bio, else the company.
const defaultRole = (cal: Calendar) => {
  const bio = cal.bio?.split(/[·|•\n]/)[0].trim();
  if (bio) return bio;
  if (cal.company) return `@ ${cal.company.replace(/^@/, "")}`;
  return "";
};

export const render = (cal: Calendar, opts: Options = {}) => {
  const st = stats(cal.weeks);
  const login = cal.login.toLowerCase();
  const name = cal.name || cal.login;
  const user = fit(name.split(/\s+/)[0].toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "") || login, 16);
  const host = fit(opts.host || login, 16);
  const role = opts.role ?? defaultRole(cal);
  const location = opts.location ?? cal.location ?? "";
  const stack = opts.stack ?? cal.languages.slice(0, 3);
  const building = opts.building ?? (cal.pinned.length ? cal.pinned : cal.recent.filter((r) => r.toLowerCase() !== login)).slice(0, 3);

  const W = 840,
    H = 600;
  const WX = 10,
    WY = 10,
    WW = W - 20,
    WH = H - 20;
  const CW = 8.2; // character cell width
  const LH = 19; // line height
  const FS = 13.5; // font size
  const PADX = WX + 24;
  const T = 15; // loop length in seconds
  const FONT = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pct = (t: number) => +((t / T) * 100).toFixed(3);
  const r2 = (n: number) => +n.toFixed(2);

  // Every glyph sits on a fixed grid via an explicit x list, so alignment does
  // not depend on which monospace font the viewer ends up with.
  const gridX = (x0: number, s: string) => [...s].map((_, i) => r2(x0 + i * CW)).join(" ");

  type Seg = [string, string, string?]; // text, color, weight
  const segLen = (segs: Seg[]) => segs.reduce((n, [s]) => n + len(s), 0);
  const line = (x: number, y: number, segs: Seg[], extra = "") => {
    let col = 0;
    const parts = segs.map(([s, color, weight]) => {
      const t = `<tspan x="${gridX(x + col * CW, s)}" fill="${color}"${weight ? ` font-weight="${weight}"` : ""}>${esc(s)}</tspan>`;
      col += len(s);
      return t;
    });
    return `<text y="${y}"${extra}>${parts.join("")}</text>`;
  };

  // Appearance keyframes, deduplicated by start time.
  const appear = new Map<string, string>();
  const anim = (t: number, fade = 0) => {
    const key = `${t.toFixed(2)}_${fade}`;
    if (!appear.has(key)) {
      const p0 = pct(t),
        p1 = pct(t + fade);
      appear.set(
        key,
        fade
          ? `@keyframes a${appear.size}{0%,${p0}%{opacity:0}${p1}%,100%{opacity:1}}`
          : `@keyframes a${appear.size}{0%{opacity:0}${p0}%,100%{opacity:1}}`,
      );
    }
    const name = appear.get(key)!.match(/@keyframes (\w+)/)![1];
    return ` class="${fade ? "f" : "s"}" style="animation-name:${name}"`;
  };

  // Prompt and command, truncated so the line and the typing time stay bounded.
  const prompt: Seg[] = [
    [user, C.pink, "700"],
    ["@", C.dim],
    [host, C.purple, "700"],
    [" ~ ", C.blue],
    ["❯ ", C.pink, "700"],
  ];
  const promptLen = segLen(prompt);
  const cmd = fit(opts.command || `fetch ${login}`, 40);
  const verbLen = cmd.includes(" ") ? cmd.indexOf(" ") : len(cmd);

  // Timeline.
  const tTypeStart = 1.1;
  const charDt = 0.075;
  const tEnter = tTypeStart + len(cmd) * charDt + 0.45;
  const tPanel = tEnter + 0.25;
  const panelDt = 0.11;
  const tBox = tPanel + 13 * panelDt + 0.2;
  const tWeeks = tBox + 0.35;
  const weekDt = 0.07;
  const tAfter = tWeeks + cal.weeks.length * weekDt + 0.25;
  const tPrompt2 = tAfter + 0.35;
  const tFadeOut = T - 0.9;

  const out: string[] = [];
  const y0 = WY + 64;

  // Typed command.
  const promptLine = (y: number) => line(PADX, y, prompt);
  out.push(promptLine(y0));
  const cmdX = PADX + promptLen * CW;
  [...cmd].forEach((ch, i) => {
    const verb = i < verbLen;
    out.push(
      `<text x="${r2(cmdX + i * CW)}" y="${y0}" fill="${verb ? C.green : C.text}"${verb ? ' font-weight="700"' : ""}${anim(tTypeStart + (i + 1) * charDt)}>${esc(ch)}</text>`,
    );
  });

  // Cursor 1: blinks, follows the typing, then disappears on enter.
  {
    const mv = [`0%{transform:translateX(0)}`];
    for (let i = 1; i <= len(cmd); i++) mv.push(`${pct(tTypeStart + i * charDt)}%{transform:translateX(${r2(i * CW)}px)}`);
    const bl: string[] = [];
    for (let t = 0; t + 0.5 < tTypeStart; t += 1) bl.push(`${pct(t)}%{opacity:1}`, `${pct(t + 0.5)}%{opacity:0}`);
    bl.push(`${pct(tTypeStart)}%{opacity:1}`, `${pct(tEnter)}%{opacity:0}`, `100%{opacity:0}`);
    appear.set("cur1mv", `@keyframes c1m{${mv.join("")}100%{transform:translateX(${r2(len(cmd) * CW)}px)}}`);
    appear.set("cur1bl", `@keyframes c1b{${bl.join("")}}`);
    out.push(`
  <g style="animation:c1m ${T}s step-end infinite"><rect x="${r2(cmdX)}" y="${y0 - 13}" width="${CW}" height="17" rx="1" fill="${C.pink}" style="animation:c1b ${T}s step-end infinite"/></g>`);
  }

  // Logo: each row reveals together with the info line next to it.
  const PX = 8;
  const logoX = PADX + 4,
    logoY = y0 + 30;
  const logoTop = logoY + 22;
  {
    const rows = LOGO.map((row, r) => {
      const rects = [...row]
        .map((ch, c) =>
          ch === "."
            ? ""
            : `<rect x="${logoX + c * PX}" y="${logoTop + r * PX}" width="${PX}" height="${PX}" fill="${PX_COLOR[ch]}"/>`,
        )
        .join("");
      return `<g${anim(tPanel + r * panelDt * 0.6)}>${rects}</g>`;
    });
    out.push(`<g shape-rendering="crispEdges">${rows.join("")}</g>`);
  }

  // Tongue flick once the run finishes.
  {
    const tx = logoX + 30 * PX,
      ty = logoTop + 9 * PX + 2;
    const t0 = tPrompt2 + 0.6;
    appear.set(
      "tongue",
      `@keyframes tg{0%,${pct(t0)}%{transform:scaleX(0)}${pct(t0 + 0.12)}%{transform:scaleX(1)}${pct(t0 + 0.32)}%{transform:scaleX(1)}${pct(t0 + 0.45)}%,100%{transform:scaleX(0)}}`,
    );
    out.push(
      `<g style="animation:tg ${T}s ease-in-out infinite;transform-box:fill-box;transform-origin:left center;transform:scaleX(0)" shape-rendering="crispEdges"><rect x="${tx}" y="${ty}" width="22" height="4" fill="${C.pink}"/><rect x="${tx + 20}" y="${ty - 2}" width="6" height="8" rx="3" fill="${C.pink}"/></g>`,
    );
  }

  // Info panel.
  const fmtDate = (iso: string) =>
    new Date(iso + "T12:00:00Z")
      .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .replace(",", "");

  const infoX = PADX + 30 * PX + 34;
  const KEYW = 11;
  const VALW = Math.floor((WX + WW - 24 - infoX) / CW) - KEYW; // columns left for a value
  const INFO_ROWS = 11; // fixed so the heatmap box never moves when optional rows are dropped
  const kv = (k: string, v: Seg[]): Seg[] => [[k.padEnd(KEYW), C.pink, "700"], ...v];
  const sep: Seg = [" · ", C.dim];
  // Joins as many items as fit, separated by dots.
  const list = (items: string[], color: string, weight?: string) => {
    const segs: Seg[] = [];
    let used = 0;
    for (const item of items) {
      const room = VALW - used - (segs.length ? 3 : 0);
      if (room < Math.min(len(item), 4)) break;
      if (segs.length) segs.push(sep);
      segs.push([fit(item, room), color, weight]);
      used = segLen(segs);
    }
    return segs;
  };
  const roleSegs = (): Seg[] => {
    const s = fit(role, VALW);
    const at = s.indexOf("@");
    if (at < 0) return [[s, C.text]];
    return at === 0 ? [[s, C.purple]] : [[s.slice(0, at), C.text], [s.slice(at), C.purple]];
  };

  const title: Seg[] = [
    [user, C.pink, "700"],
    ["@", C.dim],
    [fit(login, KEYW + VALW - len(user) - 1), C.purple, "700"],
  ];
  const none: Seg[] = [];
  const rows: Seg[][] = [
    title,
    [["─".repeat(segLen(title)), C.border]],
    kv("name", [[fit(name, VALW), C.bright]]),
    role ? kv("role", roleSegs()) : none,
    location ? kv("location", [[fit(location, VALW), C.text]]) : none,
    stack.length ? kv("stack", list(stack, C.text)) : none,
    building.length ? kv("building", list(building, C.green, "700")) : none,
    kv("contribs", [
      [String(cal.total), C.green, "700"],
      [" in the last year", C.text],
    ]),
    kv("streak", [
      [`${st.current}d`, C.bright, "700"],
      [" current", C.muted],
      sep,
      [`${st.longest}d`, C.bright, "700"],
      [" longest", C.muted],
    ]),
    kv("best day", [
      [String(st.best.count), C.bright, "700"],
      [` on ${fmtDate(st.best.date)}`, C.muted],
    ]),
    kv("active", [
      [`${st.activeDays}`, C.bright, "700"],
      [` days`, C.muted],
      sep,
      ["busiest on ", C.muted],
      [st.busiest, C.text],
    ]),
  ];
  const info = rows.filter((segs) => segs.length);
  info.forEach((segs, i) => out.push(`<g${anim(tPanel + i * panelDt)}>${line(infoX, logoY + 10 + i * LH, segs)}</g>`));
  // Palette swatches, neofetch style.
  {
    const sw = [C.pink, C.rose, C.purple, C.violet, ...LEVELS.slice(1)];
    const y = logoY + 10 + info.length * LH - 6;
    const rects = sw.map((c, i) => `<rect x="${r2(infoX + i * CW * 3)}" y="${y}" width="${r2(CW * 3)}" height="10" fill="${c}"/>`).join("");
    out.push(`<g${anim(tPanel + info.length * panelDt)} shape-rendering="crispEdges">${rects}</g>`);
  }

  // Heatmap box.
  const boxX = PADX,
    boxW = WW - 48;
  const boxY = logoY + 10 + (INFO_ROWS + 1) * LH + 14;
  const CELL = 11,
    STEP = 13.5;
  const gridW = cal.weeks.length * STEP - (STEP - CELL);
  const labelW = 4 * CW;
  const gx = boxX + Math.round((boxW - gridW - labelW) / 2) + labelW;
  const gy = boxY + 38;
  const boxH = 38 + 7 * STEP + 34;
  {
    const label = " contributions ";
    const right = ` last 12 months `;
    const g: string[] = [];
    g.push(`<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="7" fill="none" stroke="${C.violet}" stroke-opacity=".75"/>`);
    // Labels sitting in the border, Lip Gloss style.
    g.push(`<rect x="${boxX + 14}" y="${boxY - 8}" width="${r2(len(label) * CW)}" height="16" fill="${C.bg}"/>`);
    g.push(line(boxX + 14, boxY + 4.5, [[label, C.pink, "700"]]));
    const rx = boxX + boxW - 14 - len(right) * CW;
    g.push(`<rect x="${r2(rx)}" y="${boxY - 8}" width="${r2(len(right) * CW)}" height="16" fill="${C.bg}"/>`);
    g.push(line(rx, boxY + 4.5, [[right, C.muted]]));
    // Month labels.
    let lastCol = -10;
    let lastMonth = -1;
    cal.weeks.forEach((wk, i) => {
      const date = new Date(wk[0].date + "T12:00:00Z");
      const m = date.getUTCMonth();
      if (m === lastMonth) return;
      if (i - lastCol >= 3 && i < cal.weeks.length - 2) {
        const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
        g.push(line(gx + i * STEP, gy - 9, [[month, C.muted]], ` font-size="11"`));
        lastCol = i;
      }
      lastMonth = m;
    });
    // Weekday labels.
    for (const [d, s] of [
      [1, "Mon"],
      [3, "Wed"],
      [5, "Fri"],
    ] as const)
      g.push(`<text x="${gx - 8}" y="${r2(gy + d * STEP + 9)}" fill="${C.dim}" font-size="11" text-anchor="end">${s}</text>`);
    // Empty grid.
    const empty = cal.weeks.flatMap((wk, i) =>
      wk.map((d) => `<rect x="${r2(gx + i * STEP)}" y="${r2(gy + d.weekday * STEP)}" width="${CELL}" height="${CELL}" rx="2"/>`),
    );
    g.push(`<g fill="${LEVELS[0]}">${empty.join("")}</g>`);
    out.push(`<g${anim(tBox)}>${g.join("")}</g>`);

    // Week-by-week fill.
    cal.weeks.forEach((wk, i) => {
      const lit = wk.filter((d) => d.level > 0);
      if (!lit.length) return;
      const rects = lit
        .map(
          (d) =>
            `<rect x="${r2(gx + i * STEP)}" y="${r2(gy + d.weekday * STEP)}" width="${CELL}" height="${CELL}" rx="2" fill="${LEVELS[d.level]}"/>`,
        )
        .join("");
      out.push(`<g${anim(tWeeks + i * weekDt, 0.18)}>${rects}</g>`);
    });
    // Sweeping scan column.
    const end = tWeeks + cal.weeks.length * weekDt;
    const dx = r2(cal.weeks.length * STEP);
    appear.set(
      "sweep",
      `@keyframes sw{0%,${pct(tWeeks)}%{opacity:0;transform:translateX(0)}${pct(tWeeks + 0.01)}%{opacity:1;transform:translateX(0)}${pct(end)}%{opacity:1;transform:translateX(${dx}px)}${pct(end + 0.2)}%,100%{opacity:0;transform:translateX(${dx}px)}}`,
    );
    out.push(
      `<rect x="${r2(gx - 3)}" y="${gy - 3}" width="3" height="${r2(7 * STEP + 3)}" rx="1.5" fill="${C.pink}" opacity="0" style="animation:sw ${T}s linear infinite"/>`,
    );

    // Footer: summary and legend.
    const fy = gy + 7 * STEP + 18;
    const foot: string[] = [];
    foot.push(
      line(
        gx,
        fy,
        [
          [String(cal.total), C.green, "700"],
          [" contributions", C.muted],
          sep,
          [`${st.activeDays}`, C.text, "700"],
          [" active days", C.muted],
        ],
        ` font-size="12"`,
      ),
    );
    const lx = gx + gridW - 5 * STEP - 4 * CW - 6;
    foot.push(line(lx - 5 * CW, fy, [["less", C.dim]], ` font-size="11"`));
    LEVELS.forEach((c, i) => foot.push(`<rect x="${r2(lx + i * STEP)}" y="${fy - 10}" width="${CELL}" height="${CELL}" rx="2" fill="${c}"/>`));
    foot.push(line(lx + 5 * STEP + 6, fy, [["more", C.dim]], ` font-size="11"`));
    out.push(`<g${anim(tAfter)}>${foot.join("")}</g>`);
  }

  // Second prompt with a blinking cursor.
  const y2 = boxY + boxH + 30;
  out.push(`<g${anim(tPrompt2)}>${promptLine(y2)}</g>`);
  {
    const bl = [`0%{opacity:0}`];
    for (let t = tPrompt2; t < tFadeOut; t += 1) bl.push(`${pct(t)}%{opacity:1}`, `${pct(Math.min(t + 0.5, tFadeOut))}%{opacity:0}`);
    bl.push(`100%{opacity:0}`);
    appear.set("cur2", `@keyframes c2b{${bl.join("")}}`);
    out.push(
      `<rect x="${r2(PADX + promptLen * CW)}" y="${y2 - 13}" width="${CW}" height="17" rx="1" fill="${C.pink}" style="animation:c2b ${T}s step-end infinite"/>`,
    );
  }

  // Window chrome.
  const SBH = 24;
  const sbY = WY + WH - SBH;
  const chrome: string[] = [];
  chrome.push(`<rect x="${WX + 0.5}" y="${WY + 0.5}" width="${WW - 1}" height="${WH - 1}" rx="10" fill="${C.bg}" stroke="${C.border}"/>`);
  chrome.push(
    `<path d="M${WX + 0.5} ${WY + 34}V${WY + 10}a9.5 9.5 0 0 1 9.5-9.5H${WX + WW - 10}a9.5 9.5 0 0 1 9.5 9.5V${WY + 34}Z" fill="${C.chrome}"/>`,
  );
  chrome.push(`<path d="M${WX + 0.5} ${WY + 34.5}H${WX + WW - 0.5}" stroke="${C.border}"/>`);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) =>
    chrome.push(`<circle cx="${WX + 20 + i * 19}" cy="${WY + 17.5}" r="5.5" fill="${c}" fill-opacity=".85"/>`),
  );
  chrome.push(`<text x="${W / 2}" y="${WY + 22}" fill="${C.muted}" font-size="12" text-anchor="middle">${esc(`${user}@${host}: ~ — zsh`)}</text>`);

  // tmux status bar: session, windows named after what you are building, branch and location.
  chrome.push(
    `<path d="M${WX + 0.5} ${sbY}H${WX + WW - 0.5}V${WY + WH - 10}a9.5 9.5 0 0 1-9.5 9.5H${WX + 10}a9.5 9.5 0 0 1-9.5-9.5Z" fill="${C.chrome}"/>`,
  );
  chrome.push(`<path d="M${WX + 0.5} ${sbY}H${WX + WW - 0.5}" stroke="${C.border}"/>`);
  {
    const sy = sbY + 16.5;
    const sess = ` ${fit(login, 14)} `;
    const sessW = len(sess) * CW;
    chrome.push(
      `<path d="M${WX + 0.5} ${sbY + 0.5}H${r2(WX + 10 + sessW)}l8 ${(SBH - 1) / 2}-8 ${(SBH - 1) / 2}H${WX + 10}a9.5 9.5 0 0 1-9.5-9.5Z" fill="${C.violet}"/>`,
    );
    chrome.push(line(WX + 10, sy, [[sess, C.bright, "700"]], ` font-size="12"`));
    const tabs = [...building.slice(0, 2), "nvim"];
    const wins: Seg[] = [["1:zsh*", C.pink, "700"], ...tabs.map((t, i): Seg => [`  ${i + 2}:${fit(t, 12)}`, C.muted])];
    chrome.push(line(WX + 10 + sessW + 22, sy, wins, ` font-size="12"`));
    const place = location && fit(shortLocation(location), 16);
    const rtxt: Seg[] = [["⎇ main", C.purple], ...(place ? ([["  │  ", C.border], [place, C.muted]] as Seg[]) : []), [" ", C.muted]];
    chrome.push(line(WX + WW - 14 - segLen(rtxt) * CW, sy, rtxt, ` font-size="12"`));
  }

  const css = `
text{font-family:${FONT};font-size:${FS}px;white-space:pre}
.s{animation-duration:${T}s;animation-iteration-count:infinite;animation-timing-function:step-end}
.f{animation-duration:${T}s;animation-iteration-count:infinite;animation-timing-function:ease-out}
.wrap{animation:wrap ${T}s linear infinite}
@keyframes wrap{0%,${pct(tFadeOut)}%{opacity:1}${pct(T - 0.25)}%,100%{opacity:0}}
${[...appear.values()].join("\n")}`;

  const label = [name, role, location, `${cal.total} contributions in the last year`].filter(Boolean).join(", ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`Terminal running ${cmd}: ${label}`)}">
<style>${css}</style>
${chrome.join("\n")}
<g class="wrap">
${out.join("\n")}
</g>
</svg>
`;
};
