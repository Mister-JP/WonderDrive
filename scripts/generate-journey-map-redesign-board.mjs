import fs from "node:fs";
import sharp from "sharp";

const elements = [];
let nextId = 0;

function base(type, x, y, width, height, options = {}) {
  nextId += 1;
  return {
    id: `wd-map-${nextId}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: options.strokeColor ?? "#17212b",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: options.strokeWidth ?? 2,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1.15,
    opacity: options.opacity ?? 100,
    groupIds: [],
    frameId: null,
    index: `a${nextId.toString(36)}`,
    roundness: options.roundness === false ? null : { type: 3 },
    seed: 19000 + nextId * 83,
    version: 1,
    versionNonce: 41000 + nextId * 109,
    isDeleted: false,
    boundElements: null,
    updated: 1783987200000,
    link: null,
    locked: false,
  };
}

function rect(x, y, width, height, options = {}) {
  elements.push(base("rectangle", x, y, width, height, options));
}

function ellipse(x, y, width, height, options = {}) {
  elements.push(base("ellipse", x, y, width, height, { ...options, roundness: false }));
}

function text(x, y, value, size = 16, options = {}) {
  const lines = value.split("\n");
  elements.push({
    ...base(
      "text",
      x,
      y,
      options.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.56,
      options.height ?? lines.length * size * 1.25,
      { strokeColor: options.strokeColor, roughness: 0, roundness: false },
    ),
    fontSize: size,
    fontFamily: 5,
    text: value,
    textAlign: options.textAlign ?? "left",
    verticalAlign: "top",
    containerId: null,
    originalText: value,
    autoResize: true,
    lineHeight: 1.25,
  });
}

function path(type, x, y, points, options = {}) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  elements.push({
    ...base(
      type,
      x,
      y,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      { ...options, roundness: false },
    ),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: type === "arrow" ? "arrow" : null,
    elbowed: false,
  });
}

const line = (x, y, points, options = {}) => path("line", x, y, points, options);
const arrow = (x, y, points, options = {}) => path("arrow", x, y, points, options);

function chip(x, y, label, fill, width) {
  rect(x, y, width, 28, { backgroundColor: fill, strokeWidth: 1 });
  text(x + 11, y + 7, label, 10);
}

function turnNode(x, y, number, topic, question, status, selected = false) {
  rect(x, y, 310, 145, {
    backgroundColor: selected ? "#acd8ff" : "#fffdf8",
    strokeWidth: selected ? 3 : 2,
  });
  ellipse(x + 18, y + 18, 34, 34, {
    backgroundColor: selected ? "#dfff58" : "#eeeae2",
    strokeWidth: 1,
  });
  text(x + 29, y + 26, String(number), 12);
  text(x + 64, y + 19, topic.toUpperCase(), 9, { strokeColor: "#667085" });
  text(x + 18, y + 62, question, 17);
  chip(x + 18, y + 108, status, selected ? "#dfff58" : "#eeeae2", selected ? 92 : 75);
}

function openPathNode(x, y, label, question) {
  rect(x, y, 310, 126, {
    backgroundColor: "#efffc4",
    strokeColor: "#849c15",
    strokeStyle: "dashed",
    strokeWidth: 2,
  });
  ellipse(x + 18, y + 18, 28, 28, {
    backgroundColor: "#dfff58",
    strokeColor: "#849c15",
    strokeWidth: 1,
  });
  text(x + 27, y + 24, "+", 12, { strokeColor: "#506500" });
  text(x + 58, y + 19, `OPEN PATH · ${label}`, 9, { strokeColor: "#506500" });
  text(x + 18, y + 53, question, 16);
  text(x + 18, y + 102, "EXPLORE THIS  →", 9, { strokeColor: "#506500" });
}

text(65, 35, "WonderDrive — reimagined journey map", 38);
text(67, 88, "A decision workspace that makes the active path, earlier branches, and still-open questions immediately visible.", 17, { strokeColor: "#667085" });
rect(1840, 42, 475, 50, { backgroundColor: "#dfff58" });
text(1903, 57, "TURN → CHOICE → ANSWER → NEXT CHOICE", 13);

// Desktop board.
text(65, 145, "DESKTOP · FOCUSED BRANCH EXPLORER", 14, { strokeColor: "#d64b38" });
rect(65, 180, 1510, 1080, { backgroundColor: "#fffdf8", strokeWidth: 3, roughness: 1.45 });

// Browser and compact product header.
rect(65, 180, 1510, 52, { backgroundColor: "#eeeae2", strokeWidth: 2 });
ellipse(85, 200, 10, 10, { backgroundColor: "#ff7b67", strokeWidth: 1 });
ellipse(104, 200, 10, 10, { backgroundColor: "#ffd166", strokeWidth: 1 });
ellipse(123, 200, 10, 10, { backgroundColor: "#81d88d", strokeWidth: 1 });
rect(535, 193, 520, 25, { backgroundColor: "#ffffff", strokeColor: "#b7bec6", strokeWidth: 1 });
text(695, 199, "wonderdrive.app/journey/map", 10, { strokeColor: "#667085" });

text(95, 259, "WONDERDRIVE", 15);
text(1110, 260, "STAGE", 10, { strokeColor: "#667085" });
rect(1190, 246, 120, 36, { backgroundColor: "#17212b" });
text(1226, 257, "MAP", 10, { strokeColor: "#fffdf8" });
text(1390, 260, "•••", 12);
line(90, 298, [[0, 0], [1455, 0]], { strokeColor: "#ccd2d7", strokeWidth: 1 });

// Context bar.
text(95, 324, "How does a city remember?", 24);
text(95, 359, "Sage · researched journey", 10, { strokeColor: "#667085" });
chip(1040, 323, "TURN 3 OF 3", "#e6f4ff", 112);
chip(1165, 323, "4 OPEN PATHS", "#efffc4", 125);
chip(1303, 323, "12 SOURCES", "#eeeae2", 105);
line(90, 393, [[0, 0], [1455, 0]], { strokeColor: "#17212b", strokeWidth: 1 });

// Canvas label and active path.
text(95, 420, "ACTIVE PATH", 10, { strokeColor: "#d64b38" });
text(95, 443, "The route you have taken stays visually dominant. Unchosen questions remain attached to the turn that created them.", 12, { strokeColor: "#667085" });

turnNode(105, 500, 1, "Collective memory", "How does a city remember?", "EXPLORED");
arrow(415, 565, [[0, 0], [100, 0]], { strokeColor: "#17212b", strokeWidth: 3 });
text(438, 538, "CHOSEN · PLACE & POWER", 9, { strokeColor: "#667085" });
turnNode(520, 500, 2, "Public authority", "Who decides what becomes\nofficial memory?", "EXPLORED");
arrow(830, 565, [[0, 0], [100, 0]], { strokeColor: "#17212b", strokeWidth: 3 });
text(851, 538, "CHOSEN · CONFLICT", 9, { strokeColor: "#667085" });
turnNode(935, 500, 3, "Contested monuments", "What happens when a monument\nand its community disagree?", "YOU ARE HERE", true);

// Only the selected turn's two choices open by default. Older branches stay collapsed.
line(1090, 645, [[0, 0], [0, 72], [-120, 72]], { strokeColor: "#849c15", strokeWidth: 2 });
line(1090, 645, [[0, 0], [0, 72], [225, 72]], { strokeColor: "#849c15", strokeWidth: 2 });
openPathNode(815, 735, "OPTION A", "Who gets to rename\na public place?");
openPathNode(1160, 735, "OPTION B", "Can removal create\na stronger memory?");
rect(935, 660, 310, 46, { backgroundColor: "#17212b", strokeColor: "#17212b", strokeWidth: 1 });
text(970, 675, "OPEN FULL ANSWER", 10, { strokeColor: "#fffdf8" });
rect(520, 920, 620, 52, { backgroundColor: "#fffdf8", strokeColor: "#849c15", strokeStyle: "dashed", strokeWidth: 2 });
text(550, 937, "OTHER OPEN QUESTIONS FROM EARLIER TURNS (2)", 11, { strokeColor: "#506500" });
text(1100, 934, "⌄", 15, { strokeColor: "#506500" });

// Main annotation strip.
rect(105, 1085, 1400, 92, { backgroundColor: "#e6f4ff", strokeColor: "#3182ce", strokeWidth: 1 });
text(130, 1106, "WHY THIS IS DIFFERENT", 10, { strokeColor: "#1971c2" });
text(130, 1133, "The default view shows one active path and two next choices. Older branches stay collapsed until requested; the complete answer stays in Stage.", 14);

// Mobile board.
text(1660, 145, "MOBILE · ACTIVE PATH FIRST", 14, { strokeColor: "#d64b38" });
rect(1660, 180, 520, 1080, { backgroundColor: "#fffdf8", strokeWidth: 3, roughness: 1.45 });
rect(1660, 180, 520, 52, { backgroundColor: "#eeeae2", strokeWidth: 2 });
text(1685, 198, "WONDERDRIVE", 13);
text(2070, 199, "•••", 12);
rect(1685, 252, 235, 38, { backgroundColor: "#fffdf8", strokeWidth: 1 });
text(1776, 264, "STAGE", 10);
rect(1920, 252, 235, 38, { backgroundColor: "#17212b", strokeWidth: 1 });
text(2013, 264, "MAP", 10, { strokeColor: "#fffdf8" });
text(1685, 320, "How does a city remember?", 22);
text(1685, 354, "Turn 3 of 3 · 4 open paths", 10, { strokeColor: "#667085" });
line(1685, 388, [[0, 0], [470, 0]], { strokeColor: "#17212b", strokeWidth: 1 });

text(1685, 414, "YOUR PATH", 10, { strokeColor: "#d64b38" });
rect(1705, 452, 430, 112, { backgroundColor: "#fffdf8", strokeWidth: 2 });
ellipse(1725, 472, 30, 30, { backgroundColor: "#eeeae2", strokeWidth: 1 });
text(1736, 479, "1", 11);
text(1770, 470, "COLLECTIVE MEMORY", 9, { strokeColor: "#667085" });
text(1770, 496, "How does a city remember?", 16);
chip(1770, 527, "EXPLORED", "#eeeae2", 73);
line(1740, 564, [[0, 0], [0, 36]], { strokeColor: "#17212b", strokeWidth: 3 });

rect(1705, 600, 430, 112, { backgroundColor: "#fffdf8", strokeWidth: 2 });
ellipse(1725, 620, 30, 30, { backgroundColor: "#eeeae2", strokeWidth: 1 });
text(1736, 627, "2", 11);
text(1770, 618, "PUBLIC AUTHORITY", 9, { strokeColor: "#667085" });
text(1770, 644, "Who decides what becomes official?", 16);
chip(1770, 675, "EXPLORED", "#eeeae2", 73);
line(1740, 712, [[0, 0], [0, 36]], { strokeColor: "#17212b", strokeWidth: 3 });

rect(1705, 748, 430, 146, { backgroundColor: "#acd8ff", strokeWidth: 3 });
ellipse(1725, 768, 30, 30, { backgroundColor: "#dfff58", strokeWidth: 1 });
text(1736, 775, "3", 11);
text(1770, 766, "CONTESTED MONUMENTS", 9, { strokeColor: "#667085" });
text(1770, 792, "What happens when a monument\nand its community disagree?", 16);
chip(1770, 836, "YOU ARE HERE", "#dfff58", 95);
text(2070, 842, "⌃", 14);

// Selected turn expands inline on mobile—no drawer or bottom sheet.
rect(1705, 910, 430, 204, { backgroundColor: "#f1f6f8", strokeColor: "#17212b", strokeWidth: 2 });
text(1723, 928, "QUESTIONS FROM THIS TURN", 9, { strokeColor: "#d64b38" });
rect(1723, 958, 394, 58, { backgroundColor: "#fffdf8", strokeColor: "#849c15", strokeWidth: 1 });
text(1738, 971, "A · OPEN", 9, { strokeColor: "#506500" });
text(1810, 971, "Who gets to rename a public place?", 13);
rect(1723, 1028, 394, 58, { backgroundColor: "#efffc4", strokeColor: "#849c15", strokeWidth: 1 });
text(1738, 1041, "B · OPEN", 9, { strokeColor: "#506500" });
text(1810, 1041, "Can removal create a stronger memory?", 13);
text(1723, 1095, "OPEN FULL ANSWER  →", 9);
rect(1705, 1132, 430, 52, { backgroundColor: "#efffc4", strokeColor: "#849c15", strokeWidth: 2 });
text(1723, 1149, "OTHER OPEN PATHS (2)", 11, { strokeColor: "#506500" });
text(2100, 1146, "⌄", 15, { strokeColor: "#506500" });

// Footer principles.
rect(65, 1310, 2115, 230, { backgroundColor: "#f1f6f8", strokeColor: "#c5d0d7", strokeWidth: 2 });
text(95, 1338, "THE THREE RULES", 11, { strokeColor: "#1971c2" });
ellipse(100, 1385, 38, 38, { backgroundColor: "#acd8ff", strokeWidth: 1 });
text(114, 1394, "1", 13);
text(155, 1380, "Path first", 18);
text(155, 1410, "Show where I am and how I got here before metadata.", 12, { strokeColor: "#667085" });
ellipse(795, 1385, 38, 38, { backgroundColor: "#dfff58", strokeWidth: 1 });
text(809, 1394, "2", 13);
text(850, 1380, "Show only the next choice", 18);
text(850, 1410, "Two current options are visible; older branches stay collapsed.", 12, { strokeColor: "#667085" });
ellipse(1535, 1385, 38, 38, { backgroundColor: "#ffd2ca", strokeWidth: 1 });
text(1549, 1394, "3", 13);
text(1590, 1380, "Selection expands in place", 18);
text(1590, 1410, "No permanent panel; Stage still owns the complete researched answer.", 12, { strokeColor: "#667085" });
line(95, 1468, [[0, 0], [2055, 0]], { strokeColor: "#c5d0d7", strokeWidth: 1 });
text(95, 1490, "No oversized manifesto heading. No ambiguous current + selected status. No flat list pretending to be a graph.", 14);

const drawing = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: null,
    viewBackgroundColor: "#f7f5ef",
    currentItemFontFamily: 5,
  },
  files: {},
};

fs.mkdirSync("design", { recursive: true });
const stem = "design/wonderdrive-journey-map-redesign";
fs.writeFileSync(`${stem}.excalidraw`, `${JSON.stringify(drawing, null, 2)}\n`);

const escapeXml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="2240" height="1580" viewBox="0 0 2240 1580">',
  '<rect width="2240" height="1580" fill="#f7f5ef"/>',
  '<style>text{font-family:Arial,Helvetica,sans-serif}</style>',
  '<defs><filter id="w"><feTurbulence baseFrequency=".012" numOctaves="1" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".6"/></filter></defs>',
];

for (const element of elements) {
  const fill = element.backgroundColor === "transparent" ? "none" : element.backgroundColor;
  if (element.type === "rectangle") {
    svg.push(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.roundness ? 7 : 0}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" ${element.strokeStyle === "dashed" ? 'stroke-dasharray="9 7"' : ""} filter="url(#w)"/>`);
  }
  if (element.type === "ellipse") {
    svg.push(`<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" filter="url(#w)"/>`);
  }
  if (element.type === "line" || element.type === "arrow") {
    const points = element.points.map((point) => `${element.x + point[0]},${element.y + point[1]}`).join(" ");
    svg.push(`<polyline points="${points}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"/>`);
    if (element.type === "arrow") {
      const point = element.points.at(-1);
      const endX = element.x + point[0];
      const endY = element.y + point[1];
      svg.push(`<path d="M${endX - 12},${endY - 8} L${endX},${endY} L${endX - 12},${endY + 8}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"/>`);
    }
  }
  if (element.type === "text") {
    const lines = element.text.split("\n");
    svg.push(`<text x="${element.x}" y="${element.y + element.fontSize}" fill="${element.strokeColor}" font-size="${element.fontSize}" font-weight="${element.fontSize >= 22 ? 600 : 500}">${lines.map((lineText, index) => `<tspan x="${element.x}" dy="${index ? element.fontSize * 1.25 : 0}">${escapeXml(lineText)}</tspan>`).join("")}</text>`);
  }
}

svg.push("</svg>");
fs.writeFileSync(`${stem}.svg`, svg.join("\n"));
await sharp(Buffer.from(svg.join("\n"))).png().toFile(`${stem}.png`);
console.log(`Created ${stem}.{excalidraw,svg,png}`);
