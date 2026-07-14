import fs from "node:fs";
import sharp from "sharp";

const OUT = "design/wonderdrive-question-and-loading.excalidraw";
const SVG = "design/wonderdrive-question-and-loading.svg";
const PNG = "design/wonderdrive-question-and-loading.png";
const elements = [];
let serial = 0;

function base(type, x, y, width, height, options = {}) {
  serial += 1;
  return {
    id: `wdql-${serial}`, type, x, y, width, height, angle: 0,
    strokeColor: options.strokeColor ?? "#17212b",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: "solid", strokeWidth: options.strokeWidth ?? 2,
    strokeStyle: options.strokeStyle ?? "solid", roughness: options.roughness ?? 1.25,
    opacity: options.opacity ?? 100, groupIds: options.groupIds ?? [], frameId: null,
    index: `a${serial.toString(36)}`, roundness: options.roundness === false ? null : { type: 3 },
    seed: 7100 + serial * 89, version: 1, versionNonce: 19000 + serial * 113,
    isDeleted: false, boundElements: null, updated: 1783987200000,
    link: null, locked: false,
  };
}

const rect = (x, y, w, h, o = {}) => elements.push(base("rectangle", x, y, w, h, o));
const ellipse = (x, y, w, h, o = {}) => elements.push(base("ellipse", x, y, w, h, { ...o, roundness: false }));

function text(x, y, value, size = 18, options = {}) {
  const lines = value.split("\n");
  const width = options.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.56;
  const height = options.height ?? lines.length * size * 1.25;
  elements.push({
    ...base("text", x, y, width, height, { strokeColor: options.strokeColor, roughness: 0, roundness: false }),
    fontSize: size, fontFamily: 5, text: value, textAlign: options.textAlign ?? "left",
    verticalAlign: "top", containerId: null, originalText: value, autoResize: true, lineHeight: 1.25,
  });
}

function path(type, x, y, points, options = {}) {
  const xs = points.map(([px]) => px); const ys = points.map(([, py]) => py);
  elements.push({
    ...base(type, x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      ...options, backgroundColor: "transparent", roundness: false,
    }),
    points, lastCommittedPoint: null, startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: type === "arrow" ? "arrow" : null, elbowed: false,
  });
}
const line = (x, y, pts, o = {}) => path("line", x, y, pts, o);
const arrow = (x, y, pts, o = {}) => path("arrow", x, y, pts, o);

// Board title and story.
text(80, 45, "WonderDrive — ask → research", 36);
text(82, 96, "Two product states on one hand-drawn Excalidraw canvas", 17, { strokeColor: "#667085" });
rect(1980, 49, 340, 54, { backgroundColor: "#dfff58", strokeColor: "#17212b" });
text(2043, 64, "ONE QUESTION · ONE LIVE RUN", 14);

// Screen labels.
ellipse(80, 157, 42, 42, { backgroundColor: "#ff7b67" });
text(94, 165, "1", 18, { strokeColor: "#ffffff" });
text(137, 161, "Information + question", 24);
text(137, 194, "Choose the voice, frame the curiosity, begin.", 13, { strokeColor: "#667085" });

ellipse(1260, 157, 42, 42, { backgroundColor: "#acd8ff" });
text(1274, 165, "2", 18);
text(1317, 161, "Foreground research loading", 24);
text(1317, 194, "Show honest progress while the answer is composed.", 13, { strokeColor: "#667085" });

// Browser frames.
rect(80, 235, 1090, 1145, { backgroundColor: "#fffdf8", strokeWidth: 3, roughness: 1.65 });
rect(1260, 235, 1090, 1145, { backgroundColor: "#101820", strokeColor: "#101820", strokeWidth: 3, roughness: 1.65 });
// Chrome bars.
rect(80, 235, 1090, 58, { backgroundColor: "#f1eee7", strokeWidth: 2 });
ellipse(105, 256, 12, 12, { backgroundColor: "#ff7b67", strokeWidth: 1 });
ellipse(128, 256, 12, 12, { backgroundColor: "#ffd166", strokeWidth: 1 });
ellipse(151, 256, 12, 12, { backgroundColor: "#81d88d", strokeWidth: 1 });
rect(342, 249, 566, 30, { backgroundColor: "#ffffff", strokeColor: "#b7bec6", strokeWidth: 1 });
text(512, 255, "wonderdrive.app/new", 12, { strokeColor: "#667085" });

rect(1260, 235, 1090, 58, { backgroundColor: "#27313a", strokeColor: "#27313a", strokeWidth: 2 });
ellipse(1285, 256, 12, 12, { backgroundColor: "#ff7b67", strokeWidth: 1 });
ellipse(1308, 256, 12, 12, { backgroundColor: "#ffd166", strokeWidth: 1 });
ellipse(1331, 256, 12, 12, { backgroundColor: "#81d88d", strokeWidth: 1 });
rect(1522, 249, 566, 30, { backgroundColor: "#16212a", strokeColor: "#5e6a74", strokeWidth: 1 });
text(1693, 255, "wonderdrive.app/research", 12, { strokeColor: "#b8c2ca" });

// Screen 1 navigation.
text(115, 321, "WONDERDRIVE", 18);
text(575, 323, "New journey", 13);
text(688, 323, "My paths", 13, { strokeColor: "#667085" });
ellipse(1110, 320, 14, 14, { backgroundColor: "#81d88d", strokeColor: "#2f7d3a", strokeWidth: 1 });
line(105, 360, [[0, 0], [1040, 0]], { strokeColor: "#cad0d6", strokeWidth: 1 });

// Recommendation ribbon.
text(145, 397, "8 QUESTIONS FOR YOU", 11);
text(315, 397, "Shaped by Sage and your question history", 11, { strokeColor: "#667085" });
rect(130, 425, 990, 122, { backgroundColor: "#fff1bf", strokeColor: "#f59e0b", roughness: 1.6 });
rect(151, 446, 280, 78, { backgroundColor: "#ffffff", strokeColor: "#f59e0b", strokeWidth: 1 });
text(169, 458, "MAPS & POWER", 9, { strokeColor: "#d56600" });
text(169, 481, "What can an accurate map\nstill hide?", 14);
rect(445, 446, 309, 78, { backgroundColor: "#e6f4ff", strokeColor: "#3182ce", strokeWidth: 1 });
text(463, 458, "PLACE & MEMORY", 9, { strokeColor: "#1971c2" });
text(463, 481, "Where does a city keep\nits memories?", 14);
rect(768, 446, 331, 78, { backgroundColor: "#f3e8ff", strokeColor: "#9c36b5", strokeWidth: 1 });
text(786, 458, "HIDDEN SYSTEMS", 9, { strokeColor: "#8b2aa8" });
text(786, 481, "When does a shortcut\nbecome infrastructure?", 14);

// Main question.
text(292, 590, "What are you curious about?", 31);
rect(180, 646, 890, 125, { backgroundColor: "#ffffff", strokeWidth: 3, roughness: 1.45 });
text(211, 676, "Where does a city keep its memories?", 23);
text(985, 744, "38 / 280", 11, { strokeColor: "#7b8791" });
text(184, 784, "RECOMMENDED MATCH", 10, { strokeColor: "#1971c2" });
text(343, 784, "Place & memory", 11, { strokeColor: "#667085" });

// Compact information controls.
text(180, 834, "PERFORMER", 11, { strokeColor: "#667085" });
text(640, 834, "MODEL", 11, { strokeColor: "#667085" });
rect(180, 858, 420, 68, { backgroundColor: "#ffffff", strokeColor: "#ff7b67", strokeWidth: 2 });
ellipse(198, 876, 34, 34, { backgroundColor: "#ffd3cc", strokeColor: "#ff7b67", strokeWidth: 1 });
text(210, 881, "S", 14, { strokeColor: "#c53b2a" });
text(247, 870, "Sage", 16);
text(247, 893, "patient connections", 10, { strokeColor: "#667085" });
text(564, 877, "⌄", 19);
rect(640, 858, 430, 68, { backgroundColor: "#ffffff", strokeColor: "#3182ce", strokeWidth: 2 });
text(661, 870, "GPT-5.6 Luna", 16);
text(661, 893, "fast · live research", 10, { strokeColor: "#667085" });
text(1034, 877, "⌄", 19);

rect(180, 956, 890, 101, { backgroundColor: "#fff0e7", strokeColor: "#ff7b67", strokeWidth: 1 });
text(204, 973, "SAGE WILL CARRY THIS QUESTION", 10, { strokeColor: "#d64b38" });
text(204, 999, "Patient, warm, and precise—connecting the answer to deeper", 14);
text(204, 1022, "patterns without forcing a surprise.", 14);

rect(180, 1093, 890, 73, { backgroundColor: "#17212b", strokeColor: "#17212b", strokeWidth: 2 });
text(486, 1114, "Begin the wonder", 19, { strokeColor: "#ffffff" });
text(674, 1114, "→", 21, { strokeColor: "#dfff58" });
ellipse(356, 1191, 10, 10, { backgroundColor: "#81d88d", strokeColor: "#2f7d3a", strokeWidth: 1 });
text(375, 1187, "Live web research · sources included · you’ll watch it unfold", 11, { strokeColor: "#667085" });

// Screen 2 live research page.
ellipse(1298, 324, 11, 11, { backgroundColor: "#dfff58", strokeColor: "#dfff58", strokeWidth: 1 });
text(1320, 320, "RESEARCH TRAIL / LIVE FOREGROUND RUN", 11, { strokeColor: "#e9eef2" });
text(2150, 320, "KEEP THIS PAGE OPEN", 10, { strokeColor: "#acd8ff" });
line(1288, 359, [[0, 0], [1035, 0]], { strokeColor: "#46515a", strokeWidth: 1 });

text(1300, 398, "CONNECTING TO LIVE FOREGROUND RESEARCH…", 10, { strokeColor: "#acd8ff" });
text(1300, 434, "Where does a city", 40, { strokeColor: "#fffdf8" });
text(1300, 485, "keep its memories?", 40, { strokeColor: "#fffdf8" });
line(1288, 548, [[0, 0], [1035, 0]], { strokeColor: "#46515a", strokeWidth: 1 });

// Event feed.
const events = [
  ["01", "STATUS", "Reserved one foreground run", "#dfff58"],
  ["02", "SEARCH", "Looking across archives and civic records", "#acd8ff"],
  ["03", "SOURCE", "Found three useful primary sources", "#ff7b67"],
  ["04", "CHECK", "Cross-checking dates and competing accounts", "#dfff58"],
];
events.forEach(([n, kind, label, color], index) => {
  const y = 602 + index * 100;
  text(1300, y + 19, n, 15, { strokeColor: "#75818a" });
  ellipse(1352, y + 20, 14, 14, { backgroundColor: color, strokeColor: color, strokeWidth: 1 });
  text(1390, y + 5, kind, 10, { strokeColor: color });
  text(1390, y + 29, label, 14, { strokeColor: "#f6f7f8" });
  text(1768, y + 20, "✓", 16, { strokeColor: "#dfff58" });
  line(1300, y + 72, [[0, 0], [510, 0]], { strokeColor: "#46515a", strokeWidth: 1 });
});

// Pulse card.
rect(1850, 600, 445, 390, { backgroundColor: "#17242e", strokeColor: "#596670", strokeWidth: 1, roughness: 1.5 });
rect(1867, 617, 411, 356, { backgroundColor: "transparent", strokeColor: "#394750", strokeWidth: 1 });
ellipse(1976, 667, 196, 196, { backgroundColor: "transparent", strokeColor: "#acd8ff", strokeStyle: "dashed", strokeWidth: 2 });
ellipse(2066, 656, 18, 18, { backgroundColor: "#ff7b67", strokeColor: "#ff7b67", strokeWidth: 1 });
ellipse(2158, 763, 18, 18, { backgroundColor: "#dfff58", strokeColor: "#dfff58", strokeWidth: 1 });
ellipse(1998, 838, 18, 18, { backgroundColor: "#acd8ff", strokeColor: "#acd8ff", strokeWidth: 1 });
text(2001, 886, "Researching", 26, { strokeColor: "#fffdf8" });
text(2017, 929, "SEARCH · CHECK · COMPOSE", 10, { strokeColor: "#94a0a9" });

// Honest status and safety copy.
line(1298, 1043, [[0, 0], [995, 0]], { strokeColor: "#46515a", strokeWidth: 1 });
ellipse(1302, 1072, 12, 12, { backgroundColor: "#dfff58", strokeColor: "#dfff58", strokeWidth: 1 });
text(1331, 1068, "Research is active in this foreground request.", 13, { strokeColor: "#c8d0d6" });
rect(1298, 1120, 995, 117, { backgroundColor: "#1a2731", strokeColor: "#46515a", strokeWidth: 1 });
text(1322, 1143, "LIVE MODE", 10, { strokeColor: "#ff7b67" });
text(1412, 1140, "A turn is saved only after source links, answer blocks, and exactly", 13, { strokeColor: "#c8d0d6" });
text(1412, 1164, "two paths pass validation. No invisible background job continues.", 13, { strokeColor: "#c8d0d6" });
rect(1298, 1270, 995, 6, { backgroundColor: "#37434c", strokeColor: "#37434c", strokeWidth: 1 });
rect(1298, 1270, 620, 6, { backgroundColor: "#dfff58", strokeColor: "#dfff58", strokeWidth: 1 });
text(1298, 1294, "SEARCH", 9, { strokeColor: "#dfff58" });
text(1748, 1294, "CHECK", 9, { strokeColor: "#acd8ff" });
text(2179, 1294, "COMPOSE", 9, { strokeColor: "#78848d" });

// Transition arrow between states.
arrow(1178, 714, [[0, 0], [68, 0]], { strokeColor: "#ff7b67", strokeWidth: 4 });
rect(1130, 665, 163, 36, { backgroundColor: "#fffdf8", strokeColor: "#ff7b67", strokeWidth: 1 });
text(1153, 674, "BEGIN THE WONDER", 9, { strokeColor: "#d64b38" });

// Bottom interaction notes.
rect(80, 1425, 1090, 170, { backgroundColor: "#fff1bf", strokeColor: "#f59e0b", roughness: 1.5 });
text(110, 1453, "QUESTION SCREEN", 12, { strokeColor: "#d56600" });
text(110, 1482, "• Recommendations spark curiosity without crowding the primary field.", 14);
text(110, 1512, "• Performer + model are visible, compact, and easy to change.", 14);
text(110, 1542, "• One unmistakable action starts the live turn.", 14);

rect(1260, 1425, 1090, 170, { backgroundColor: "#e6f4ff", strokeColor: "#3182ce", roughness: 1.5 });
text(1290, 1453, "LOADING / RESEARCH SCREEN", 12, { strokeColor: "#1971c2" });
text(1290, 1482, "• Observable events communicate progress; no hidden chain-of-thought.", 14);
text(1290, 1512, "• The animated orbit gives motion while status copy stays precise.", 14);
text(1290, 1542, "• Validation and foreground-only behavior build trust.", 14);

const drawing = {
  type: "excalidraw", version: 2, source: "https://excalidraw.com", elements,
  appState: { gridSize: null, viewBackgroundColor: "#f7f5ef", currentItemFontFamily: 5 }, files: {},
};

fs.mkdirSync("design", { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(drawing, null, 2)}\n`);

// A high-fidelity preview generated from the same layout coordinates.
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svgParts = [`<svg xmlns="http://www.w3.org/2000/svg" width="2430" height="1650" viewBox="0 0 2430 1650">`,
  `<rect width="2430" height="1650" fill="#f7f5ef"/>`,
  `<style>text{font-family:Arial,Helvetica,sans-serif}.hand{filter:url(#wobble)}</style>`,
  `<defs><filter id="wobble"><feTurbulence baseFrequency="0.012" numOctaves="1" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.75"/></filter></defs>`];
for (const el of elements) {
  const stroke = el.strokeColor; const fill = el.backgroundColor === "transparent" ? "none" : el.backgroundColor;
  if (el.type === "rectangle") svgParts.push(`<rect class="hand" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.roundness ? 7 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}" opacity="${el.opacity / 100}"/>`);
  if (el.type === "ellipse") svgParts.push(`<ellipse class="hand" cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${el.strokeWidth}"/>`);
  if (el.type === "line" || el.type === "arrow") {
    const pts = el.points.map(([px, py]) => `${el.x + px},${el.y + py}`).join(" ");
    svgParts.push(`<polyline class="hand" points="${pts}" fill="none" stroke="${stroke}" stroke-width="${el.strokeWidth}" ${el.strokeStyle === "dashed" ? 'stroke-dasharray="8 7"' : ""}/>`);
    if (el.type === "arrow") { const b = el.points.at(-1); const ex=el.x+b[0], ey=el.y+b[1]; svgParts.push(`<path d="M ${ex-13} ${ey-9} L ${ex} ${ey} L ${ex-13} ${ey+9}" fill="none" stroke="${stroke}" stroke-width="${el.strokeWidth}"/>`); }
  }
  if (el.type === "text") {
    const lines = el.text.split("\n");
    svgParts.push(`<text x="${el.x}" y="${el.y + el.fontSize}" fill="${stroke}" font-size="${el.fontSize}" font-weight="${el.fontSize >= 24 ? 600 : 500}">${lines.map((ln,i)=>`<tspan x="${el.x}" dy="${i ? el.fontSize*1.25 : 0}">${esc(ln)}</tspan>`).join("")}</text>`);
  }
}
svgParts.push("</svg>");
fs.writeFileSync(SVG, svgParts.join("\n"));
await sharp(Buffer.from(svgParts.join("\n"))).png().toFile(PNG);
console.log(`Created ${OUT}\nCreated ${SVG}\nCreated ${PNG}`);
