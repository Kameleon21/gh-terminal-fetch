#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { fetchCalendar } from "./github";
import { render } from "./render";

const { values } = parseArgs({
  options: {
    username: { type: "string", short: "u" },
    output: { type: "string", short: "o", default: "terminal.svg" },
    host: { type: "string" },
    role: { type: "string" },
    location: { type: "string" },
    stack: { type: "string" },
    building: { type: "string" },
    command: { type: "string" },
  },
});

if (!values.username) {
  console.error(
    "Usage: bun src/cli.ts --username <login> [--output terminal.svg] [--host name] [--role text] [--location text] [--stack a,b,c] [--building a,b,c] [--command text]",
  );
  process.exit(1);
}

// Empty values (unset action inputs) fall back to the GitHub profile.
const text = (s?: string) => s?.trim() || undefined;
const list = (s?: string) => text(s)?.split(",").map((x) => x.trim()).filter(Boolean);

const cal = await fetchCalendar(values.username);
const svg = render(cal, {
  host: text(values.host),
  role: text(values.role),
  location: text(values.location),
  stack: list(values.stack),
  building: list(values.building),
  command: text(values.command),
});
await Bun.write(values.output!, svg);
console.log(`${values.output}: ${cal.total} contributions, ${(svg.length / 1024).toFixed(1)}KB`);
