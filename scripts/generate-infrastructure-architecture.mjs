import fs from "node:fs";
import sharp from "sharp";

const E = [];
let id = 0;
let activeFrameId = null;
const C = {
  ink: "#202933",
  muted: "#63707c",
  paper: "#fbf8ef",
  white: "#fffdf8",
  blue: "#dceeff",
  blueStroke: "#2672a8",
  green: "#ddf7e8",
  greenStroke: "#16815d",
  purple: "#eee6ff",
  purpleStroke: "#7451b8",
  coral: "#ffd8ce",
  coralStroke: "#cf4c38",
  yellow: "#fff2a8",
  lime: "#e4ff6a",
  gray: "#ece9e1",
};

function base(type, x, y, width, height, o = {}) {
  id += 1;
  return {
    id: `wd-arch-${id}`,
    type,
    x,
    y,
    width,
    height,
    angle: o.angle ?? 0,
    strokeColor: o.strokeColor ?? C.ink,
    backgroundColor: o.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: o.strokeWidth ?? 2,
    strokeStyle: o.strokeStyle ?? "solid",
    roughness: o.roughness ?? 2,
    opacity: o.opacity ?? 100,
    groupIds: [],
    frameId: type === "frame" ? null : activeFrameId,
    index: `a${id.toString(36)}`,
    roundness: o.roundness === false ? null : { type: 3 },
    seed: 50000 + id * 101,
    version: 1,
    versionNonce: 85000 + id * 137,
    isDeleted: false,
    boundElements: null,
    updated: 1783987200000,
    link: null,
    locked: false,
  };
}

function rect(x, y, w, h, o = {}) {
  E.push(base("rectangle", x, y, w, h, o));
}

function ellipse(x, y, w, h, o = {}) {
  E.push(base("ellipse", x, y, w, h, { ...o, roundness: false }));
}

function text(x, y, value, size = 16, o = {}) {
  const lines = value.split("\n");
  E.push({
    ...base(
      "text",
      x,
      y,
      o.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.58,
      o.height ?? lines.length * size * 1.25,
      { strokeColor: o.strokeColor, roughness: 0, roundness: false, angle: o.angle },
    ),
    fontSize: size,
    fontFamily: 1,
    text: value,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: value,
    autoResize: true,
    lineHeight: 1.25,
  });
}

function path(type, x, y, points, o = {}) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  E.push({
    ...base(type, x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      ...o,
      roundness: false,
    }),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: type === "arrow" ? "arrow" : null,
    elbowed: false,
  });
}

const arrow = (x, y, points, o = {}) => path("arrow", x, y, points, o);
const line = (x, y, points, o = {}) => path("line", x, y, points, o);

function box(x, y, w, h, title, body, o = {}) {
  rect(x, y, w, h, {
    backgroundColor: o.fill ?? C.white,
    strokeColor: o.stroke ?? C.ink,
    strokeWidth: o.strokeWidth ?? 2,
    strokeStyle: o.strokeStyle,
    roughness: o.roughness ?? 2.2,
    angle: o.angle,
  });
  text(x + 22, y + 18, title, o.titleSize ?? 22, { strokeColor: o.titleColor ?? C.ink, angle: o.angle });
  if (body) text(x + 22, y + (o.bodyY ?? 60), body, o.bodySize ?? 14, { strokeColor: o.bodyColor ?? C.muted, angle: o.angle });
  if (o.footer) text(x + 22, y + h - 28, o.footer, 10, { strokeColor: C.muted, angle: o.angle });
}

function frame(x, y, w, h, number, title, subtitle) {
  activeFrameId = null;
  const element = {
    ...base("frame", x, y, w, h, {
      backgroundColor: "transparent",
      strokeColor: C.ink,
      strokeWidth: 3,
      roughness: 0,
      roundness: false,
    }),
    name: `${number}. ${title}`,
    isCollapsed: false,
  };
  E.push(element);
  activeFrameId = element.id;
  ellipse(x + 28, y + 24, 48, 48, { backgroundColor: C.ink, strokeColor: C.ink, strokeWidth: 1 });
  text(x + 45, y + 34, number, 18, { strokeColor: C.white });
  text(x + 94, y + 24, title, 29);
  text(x + 96, y + 63, subtitle, 14, { strokeColor: C.muted });
  rect(x + w - 345, y + 24, 295, 42, {
    backgroundColor: C.lime,
    strokeColor: C.ink,
    strokeWidth: 1,
    roughness: 2.2,
    angle: -0.006,
  });
  text(x + w - 318, y + 36, "CURRENT IMPLEMENTATION · JUL 2026", 11, {
    angle: -0.006,
  });
  line(x + 28, y + 96, [[0, 0], [w - 56, 0]], { strokeColor: C.muted, strokeWidth: 1, roughness: 2 });
}

function endFrame() {
  activeFrameId = null;
}

function step(x, y, n, color, title, body, w = 280) {
  ellipse(x, y, 36, 36, { backgroundColor: color, strokeColor: color, strokeWidth: 1 });
  text(x + 13, y + 8, String(n), 13, { strokeColor: C.white });
  text(x + 48, y - 3, title, 18);
  text(x + 48, y + 25, body, 12, { strokeColor: C.muted, width: w });
}

function sticky(x, y, w, h, title, body, o = {}) {
  box(x, y, w, h, title, body, {
    fill: o.fill ?? C.yellow,
    stroke: o.stroke ?? C.ink,
    titleSize: o.titleSize ?? 17,
    bodySize: o.bodySize ?? 12,
    bodyY: 49,
    angle: o.angle ?? 0,
    roughness: 2.8,
  });
}

text(55, 34, "WonderDrive architecture", 44);
text(58, 92, "Three views, three questions: what connects, how a turn runs, and what lives inside the app", 18, { strokeColor: C.muted });
rect(1860, 42, 310, 48, { backgroundColor: C.lime, strokeWidth: 2, roughness: 2.7, angle: -0.01 });
text(1890, 57, "CURRENT: CHATGPT SITES + OPENAI + D1", 11, { angle: -0.01 });

// FRAME 1 — system context.
frame(55, 145, 2120, 500, "1", "System landscape", "The five-second view: who uses WonderDrive and which managed systems it depends on");

// Person sketch.
ellipse(130, 280, 62, 62, { backgroundColor: C.coral, strokeColor: C.coralStroke, strokeWidth: 3 });
line(161, 342, [[0, 0], [0, 98]], { strokeColor: C.coralStroke, strokeWidth: 3, roughness: 2.8 });
line(161, 375, [[0, 0], [-62, 52]], { strokeColor: C.coralStroke, strokeWidth: 3, roughness: 2.8 });
line(161, 375, [[0, 0], [62, 52]], { strokeColor: C.coralStroke, strokeWidth: 3, roughness: 2.8 });
line(161, 440, [[0, 0], [-46, 72]], { strokeColor: C.coralStroke, strokeWidth: 3, roughness: 2.8 });
line(161, 440, [[0, 0], [46, 72]], { strokeColor: C.coralStroke, strokeWidth: 3, roughness: 2.8 });
text(90, 535, "curious person", 19, { strokeColor: C.coralStroke });

box(380, 245, 650, 300, "WonderDrive on ChatGPT Sites", "PUBLIC WEB EXPERIENCE\nchoose a performer, model, question, and next path\n\nTRUSTED SERVER ROUTES\nresolve identity · enforce ownership and limits\nassemble research context · validate · persist · stream\n\nSites owns the application boundary and server-only secrets.", {
  fill: C.blue,
  stroke: C.blueStroke,
  strokeWidth: 4,
  footer: "React / Vinext application · Sign in with ChatGPT seam",
  titleSize: 27,
  bodySize: 14,
});

box(1325, 225, 720, 165, "OpenAI Responses API", "The audience-selected model researches and performs the turn.\nBuilt-in web search · structured output · provider-returned sources\nNo hidden planner, second model, or background agent.", {
  fill: C.purple,
  stroke: C.purpleStroke,
  titleSize: 23,
  bodySize: 13,
  footer: "server-to-server · store: false",
});
box(1325, 430, 720, 165, "Sites-managed D1", "Canonical durable product state: identity, preferences, journeys,\nturns, choices, graph edges, research evidence, usage, and snapshots.\nOnly Sites server routes can access the `DB` binding.", {
  fill: C.green,
  stroke: C.greenStroke,
  titleSize: 23,
  bodySize: 13,
  footer: "Cloudflare D1 through the Sites-managed DB binding",
});

arrow(225, 390, [[0, 0], [155, 0]], { strokeColor: C.ink, strokeWidth: 4, roughness: 2.7 });
text(244, 357, "explore / choose", 13, { strokeColor: C.muted });
arrow(1030, 320, [[0, 0], [295, 0]], { strokeColor: C.purpleStroke, strokeWidth: 4, roughness: 2.7 });
text(1090, 284, "research request", 13, { strokeColor: C.purpleStroke });
arrow(1325, 365, [[0, 0], [-295, 0]], { strokeColor: C.purpleStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.7 });
text(1082, 373, "sourced draft", 13, { strokeColor: C.purpleStroke });
arrow(1030, 500, [[0, 0], [295, 0]], { strokeColor: C.greenStroke, strokeWidth: 4, roughness: 2.7 });
text(1095, 463, "read / atomic write", 13, { strokeColor: C.greenStroke });
arrow(380, 445, [[0, 0], [-155, 0]], { strokeColor: C.blueStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.7 });
text(238, 454, "live progress + result", 12, { strokeColor: C.blueStroke });

// FRAME 2 — sequence.
frame(55, 690, 2120, 760, "2", "One research turn", "A sequence view: the same four participants, with time moving downward");

const lanes = [
  { x: 330, title: "Browser", fill: C.coral, stroke: C.coralStroke },
  { x: 840, title: "ChatGPT Sites", fill: C.blue, stroke: C.blueStroke },
  { x: 1370, title: "OpenAI", fill: C.purple, stroke: C.purpleStroke },
  { x: 1880, title: "Sites D1", fill: C.green, stroke: C.greenStroke },
];
for (const lane of lanes) {
  box(lane.x - 125, 820, 250, 70, lane.title, "", { fill: lane.fill, stroke: lane.stroke, titleSize: 19 });
  line(lane.x, 890, [[0, 0], [0, 470]], { strokeColor: lane.stroke, strokeWidth: 2, strokeStyle: "dashed", roughness: 2.4 });
}

// Step 1.
arrow(330, 930, [[0, 0], [510, 0]], { strokeColor: C.ink, strokeWidth: 3, roughness: 2.6 });
step(505, 885, 1, C.ink, "Start or advance", "action + IDs + idempotency key + expected version", 305);
// Step 2 is work local to the Sites request boundary, shown as an activation note.
box(680, 970, 320, 90, "2. Authorize + reserve", "identity · ownership · budget · lease · compact context", {
  fill: C.coral,
  stroke: C.coralStroke,
  titleSize: 16,
  bodySize: 11,
  bodyY: 49,
});
// Step 3.
arrow(840, 1110, [[0, 0], [530, 0]], { strokeColor: C.purpleStroke, strokeWidth: 3, roughness: 2.6 });
step(1025, 1060, 3, C.purpleStroke, "Research", "selected model + web tools + strict turn schema", 280);
// Step 4.
arrow(1370, 1170, [[0, 0], [-530, 0]], { strokeColor: C.purpleStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.6 });
step(1010, 1128, 4, C.purpleStroke, "Normalize and validate", "safe activity · source allowlist · citations · exactly 2 paths", 320);
// Step 5.
arrow(840, 1255, [[0, 0], [1040, 0]], { strokeColor: C.greenStroke, strokeWidth: 3, roughness: 2.6 });
step(1320, 1205, 5, C.greenStroke, "Commit atomically", "turn + choices + sources + graph edge + usage + request result", 345);
// Step 6.
arrow(1880, 1320, [[0, 0], [-1040, 0]], { strokeColor: C.greenStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.6 });
step(1460, 1328, 6, C.greenStroke, "Committed", "the durable journey version is now authoritative", 300);
// Step 7.
arrow(840, 1390, [[0, 0], [-510, 0]], { strokeColor: C.blueStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.6 });
step(470, 1345, 7, C.blueStroke, "Reveal", "SSE activity first; visible answer only after commit", 300);

sticky(95, 910, 185, 130, "Browser sends", "IDs and actions—\nnot a model-ready\ntranscript.", { fill: C.yellow, angle: -0.015 });
sticky(1915, 1090, 205, 130, "Failure rule", "Timeout, disconnect,\ninvalid citations, or\nversion race = no turn.", { fill: C.coral, stroke: C.coralStroke, angle: 0.012 });

// FRAME 3 — technical containers.
frame(55, 1495, 2120, 720, "3", "Inside WonderDrive", "A container/component view: which code boundary owns each responsibility");

text(95, 1620, "browser", 14, { strokeColor: C.coralStroke });
box(95, 1650, 300, 180, "React experience", "stage · map · library\nclient API · SSE reader\nview state only", {
  fill: C.coral,
  stroke: C.coralStroke,
  footer: "app/wonderdrive-experience.tsx",
  titleSize: 19,
  bodySize: 13,
});

rect(450, 1615, 1050, 500, { backgroundColor: C.white, strokeColor: C.blueStroke, strokeWidth: 4, roughness: 2.7 });
text(480, 1638, "ChatGPT Sites — trusted application boundary", 23, { strokeColor: C.blueStroke });

box(485, 1690, 300, 175, "API + identity", "same-origin mutation gate\nguest / ChatGPT viewer\nownership-scoped responses", {
  fill: C.blue,
  stroke: C.blueStroke,
  footer: "lib/api.ts · lib/viewer.ts",
  titleSize: 18,
  bodySize: 12,
});
box(825, 1690, 300, 175, "Research service", "context assembly\nOpenAI stream normalization\nschema + source validation", {
  fill: C.purple,
  stroke: C.purpleStroke,
  footer: "lib/live-research.ts",
  titleSize: 18,
  bodySize: 12,
});
box(1165, 1690, 300, 175, "Journey service", "create · advance · branch\ncompare · snapshot · export\nexactly-two path invariant", {
  fill: C.gray,
  stroke: C.ink,
  footer: "lib/repository.ts",
  titleSize: 18,
  bodySize: 12,
});
box(650, 1915, 620, 150, "D1 persistence adapter", "Sites-managed `DB` binding · prepared SQL · D1 batch transactions\noptimistic versions · idempotent replay · cost and usage ledgers", {
  fill: C.green,
  stroke: C.greenStroke,
  footer: "repository boundary",
  titleSize: 19,
  bodySize: 12,
});

text(1570, 1620, "managed services", 14, { strokeColor: C.purpleStroke });
box(1570, 1650, 520, 170, "OpenAI Responses API", "web research · optional image results\nstructured output · source set · usage", {
  fill: C.purple,
  stroke: C.purpleStroke,
  titleSize: 19,
  bodySize: 12,
  footer: "OPENAI_API_KEY remains server-only",
});
box(1570, 1870, 520, 235, "D1 data groups", "IDENTITY  identities · preferences · upgrades · starter cache\nJOURNEYS  turns · options · actions · edges\nRESEARCH  requests · runs · events · sources · relations\nCONTROL  usage ledgers · idempotency · snapshots", {
  fill: C.green,
  stroke: C.greenStroke,
  titleSize: 19,
  bodySize: 12,
  footer: "D1 is canonical; the browser has no DB binding",
});

arrow(395, 1740, [[0, 0], [90, 0]], { strokeColor: C.ink, strokeWidth: 3, roughness: 2.6 });
text(410, 1692, "JSON / SSE", 11, { strokeColor: C.muted });
arrow(785, 1775, [[0, 0], [40, 0]], { strokeColor: C.blueStroke, strokeWidth: 3, roughness: 2.6 });
// Ordinary journey routes can bypass live research; route this branch through
// the clear corridor below the service row instead of through the heading.
arrow(785, 1810, [[0, 0], [20, 0], [20, 80], [380, 80], [380, 0]], { strokeColor: C.ink, strokeWidth: 3, roughness: 2.6 });
arrow(975, 1865, [[0, 0], [0, 50]], { strokeColor: C.greenStroke, strokeWidth: 3, roughness: 2.6 });
text(990, 1880, "validated turn", 11, { strokeColor: C.greenStroke });
arrow(1315, 1865, [[0, 0], [0, 100], [-45, 100]], { strokeColor: C.greenStroke, strokeWidth: 3, roughness: 2.6 });
text(1328, 1925, "journey state", 11, { strokeColor: C.greenStroke });
// Provider traffic uses the same lower connector corridor, then rises outside
// the Sites boundary to the OpenAI service.
arrow(1125, 1800, [[0, 0], [20, 0], [20, 85], [375, 85], [375, -20], [445, -20]], { strokeColor: C.purpleStroke, strokeWidth: 3, roughness: 2.6 });
text(1430, 1818, "provider request", 11, { strokeColor: C.purpleStroke });
arrow(1270, 1985, [[0, 0], [300, 0]], { strokeColor: C.greenStroke, strokeWidth: 3, roughness: 2.6 });
text(1340, 1950, "prepared SQL / batch", 11, { strokeColor: C.greenStroke });

sticky(95, 1885, 300, 160, "Identity", "Guest: HttpOnly cookie\nSigned in: hashed ChatGPT subject\nProfile: email + optional full name\nUpgrade: explicit + idempotent\nNo app-owned passwords", { fill: C.coral, stroke: C.coralStroke, angle: -0.01 });
sticky(95, 2065, 300, 100, "Deliberately absent", "No queues · schedulers · background\ncontinuation · model fan-out", { fill: C.yellow, angle: 0.008 });
sticky(1020, 2125, 480, 70, "Trust boundary", "Secrets, prompts, source validation, and D1 access stay server-side.", { fill: C.blue, stroke: C.blueStroke, angle: -0.008, bodySize: 11 });

// FRAME 4 — deployment topology.
frame(55, 2260, 2120, 520, "4", "Deployment topology", "The infrastructure view: how source becomes a public release and where production configuration lives");

box(105, 2415, 340, 170, "GitHub repository", "application source\nlockfile + tests\ndatabase migrations", {
  fill: C.gray,
  stroke: C.ink,
  titleSize: 20,
  bodySize: 13,
  footer: "public repository",
});
box(525, 2415, 340, 170, "GitHub Actions", "architecture check · lint\ntypecheck · production build\nrendered + adapter tests", {
  fill: C.coral,
  stroke: C.coralStroke,
  titleSize: 20,
  bodySize: 13,
  footer: "verification only—no paid provider call",
});
box(945, 2380, 470, 240, "ChatGPT Sites release", "public WonderDrive URL\nVinext web app + server routes\nSign in with ChatGPT identity seam\nreviewed deployment + rollback path", {
  fill: C.blue,
  stroke: C.blueStroke,
  strokeWidth: 4,
  titleSize: 22,
  bodySize: 13,
  footer: "production application boundary",
});
box(1535, 2365, 520, 155, "OpenAI project", "Responses API access\nmodel/search quota · usage billing\nemergency key disable", {
  fill: C.purple,
  stroke: C.purpleStroke,
  titleSize: 20,
  bodySize: 13,
  footer: "called only from Sites server routes",
});
box(1535, 2555, 520, 165, "Sites-managed D1", "canonical SQLite-compatible database\npackaged Drizzle migrations · prepared SQL / batch\nbackup and restore verification gate", {
  fill: C.green,
  stroke: C.greenStroke,
  titleSize: 20,
  bodySize: 13,
  footer: "canonical current persistence · DB binding",
});

arrow(445, 2500, [[0, 0], [80, 0]], { strokeColor: C.ink, strokeWidth: 3, roughness: 2.6 });
text(462, 2466, "push / PR", 12, { strokeColor: C.muted });
arrow(865, 2500, [[0, 0], [80, 0]], { strokeColor: C.ink, strokeWidth: 3, roughness: 2.6 });
text(875, 2466, "verified release", 12, { strokeColor: C.muted });
arrow(1415, 2445, [[0, 0], [120, 0]], { strokeColor: C.purpleStroke, strokeWidth: 3, roughness: 2.6 });
text(1430, 2410, "server request", 12, { strokeColor: C.purpleStroke });
arrow(1415, 2585, [[0, 0], [120, 0]], { strokeColor: C.greenStroke, strokeWidth: 3, roughness: 2.6 });
text(1445, 2550, "runtime DB", 12, { strokeColor: C.greenStroke });
arrow(1415, 2650, [[0, 0], [120, 0]], { strokeColor: C.greenStroke, strokeWidth: 3, strokeStyle: "dashed", roughness: 2.6 });
text(1445, 2660, "migrations", 12, { strokeColor: C.greenStroke });

sticky(105, 2630, 760, 90, "Release rule", "CI proves the build; production secrets are injected by the hosting environment and never committed to GitHub.", {
  fill: C.yellow,
  stroke: C.ink,
  angle: -0.005,
});
sticky(945, 2640, 470, 80, "Server-only configuration", "OPENAI_API_KEY · daily budget limit · Sites-managed DB binding", {
  fill: C.yellow,
  stroke: C.ink,
  angle: 0.006,
  bodySize: 11,
});

endFrame();
text(58, 2830, "Architecture intent: one explicit audience action → one bounded foreground turn → one atomic durable result.", 17, { strokeColor: C.muted });

const drawing = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: E,
  appState: { gridSize: null, viewBackgroundColor: C.paper, currentItemFontFamily: 1 },
  files: {},
};

fs.mkdirSync("design", { recursive: true });
const stem = "design/wonderdrive-infrastructure-architecture";
fs.writeFileSync(`${stem}.excalidraw`, `${JSON.stringify(drawing, null, 2)}\n`);

const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="2250" height="2890" viewBox="0 0 2250 2890">',
  `<rect width="2250" height="2890" fill="${C.paper}"/>`,
  '<style>text{font-family:"Comic Sans MS","Bradley Hand",cursive}</style>',
  '<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>',
];

for (const e of E) {
  const fill = e.backgroundColor === "transparent" ? "none" : e.backgroundColor;
  const dash = e.strokeStyle === "dashed" ? ' stroke-dasharray="10 8"' : "";
  const transform = e.angle ? ` transform="rotate(${e.angle * 180 / Math.PI} ${e.x + e.width / 2} ${e.y + e.height / 2})"` : "";
  if (e.type === "frame") svg.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="10" fill="${C.white}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"/>`);
  if (e.type === "rectangle") svg.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.roundness ? 8 : 0}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${dash}${transform}/>`);
  if (e.type === "ellipse") svg.push(`<ellipse cx="${e.x + e.width / 2}" cy="${e.y + e.height / 2}" rx="${e.width / 2}" ry="${e.height / 2}" fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${transform}/>`);
  if (e.type === "line" || e.type === "arrow") {
    const points = e.points.map((p) => `${e.x + p[0]},${e.y + p[1]}`).join(" ");
    svg.push(`<polyline points="${points}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${dash}${e.type === "arrow" ? ' marker-end="url(#arr)"' : ""}/>`);
  }
  if (e.type === "text") {
    const lines = e.text.split("\n");
    svg.push(`<text x="${e.x}" y="${e.y + e.fontSize}" fill="${e.strokeColor}" font-size="${e.fontSize}" font-weight="${e.fontSize >= 20 ? 600 : 500}"${transform}>${lines.map((lineText, index) => `<tspan x="${e.x}" dy="${index ? e.fontSize * 1.25 : 0}">${esc(lineText)}</tspan>`).join("")}</text>`);
  }
}
svg.push("</svg>");
fs.writeFileSync(`${stem}.svg`, svg.join("\n"));
await sharp(Buffer.from(svg.join("\n"))).png().toFile(`${stem}.png`);
console.log(`Created ${stem}.{excalidraw,svg,png}`);
