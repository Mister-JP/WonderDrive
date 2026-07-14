import fs from "node:fs";
import sharp from "sharp";

const C = {
  paper: "#f4efe5",
  surface: "#fffdf8",
  ink: "#18232d",
  muted: "#68747c",
  divider: "#d2d3ce",
  coral: "#ed725e",
  blue: "#b9ddf5",
  green: "#dfff58",
  acidSoft: "#f1ffc9",
  skeleton: "#dfe2df",
  skeletonLight: "#e9eae7",
};

const elements = [];
const mapFileId = "wonderdrive-card-map";
let serial = 0;

function base(type, x, y, width, height, o = {}) {
  serial += 1;
  return {
    id: `wd-card-${serial}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: o.strokeColor ?? C.ink,
    backgroundColor: o.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: o.strokeWidth ?? 1,
    strokeStyle: o.strokeStyle ?? "solid",
    roughness: 0,
    opacity: o.opacity ?? 100,
    groupIds: [],
    frameId: null,
    index: `a${serial.toString(36)}`,
    roundness: o.roundness === false ? null : { type: 3 },
    seed: 71000 + serial * 89,
    version: 1,
    versionNonce: 91000 + serial * 127,
    isDeleted: false,
    boundElements: null,
    updated: 1784073600000,
    link: o.link ?? null,
    locked: false,
  };
}

const rect = (x, y, width, height, o = {}) => elements.push(base("rectangle", x, y, width, height, o));
const ellipse = (x, y, width, height, o = {}) => elements.push(base("ellipse", x, y, width, height, { ...o, roundness: false }));

function text(x, y, value, size = 14, o = {}) {
  const lines = value.split("\n");
  elements.push({
    ...base("text", x, y, o.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.53, o.height ?? lines.length * size * (o.lineHeight ?? 1.25), {
      strokeColor: o.strokeColor,
      roundness: false,
      link: o.link,
    }),
    fontSize: size,
    fontFamily: 2,
    text: value,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: value,
    autoResize: true,
    lineHeight: o.lineHeight ?? 1.25,
  });
}

function line(x, y, points, o = {}) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  elements.push({
    ...base("line", x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), { ...o, roundness: false }),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  });
}

function imageElement(x, y, width, height) {
  elements.push({
    ...base("image", x, y, width, height, { strokeColor: "transparent", roundness: false }),
    fileId: mapFileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
  });
}

function skeleton(x, y, width, height = 11, light = false) {
  rect(x, y, width, height, {
    backgroundColor: light ? C.skeletonLight : C.skeleton,
    strokeColor: light ? C.skeletonLight : C.skeleton,
  });
}

function header(x, y, loading = false) {
  rect(x, y, 1600, 66, { backgroundColor: C.surface, strokeColor: C.surface });
  text(x + 44, y + 23, "WONDER", 17);
  text(x + 118, y + 23, "DRIVE", 17, { strokeColor: C.coral });
  line(x + 214, y + 16, [[0, 0], [0, 34]], { strokeColor: C.divider });
  text(x + 240, y + 18, "TURN 06", 10, { strokeColor: C.muted });
  ellipse(x + 318, y + 15, 34, 34, { backgroundColor: "#ffd2ca", strokeColor: C.coral });
  text(x + 331, y + 22, "S", 13, { strokeColor: "#973c2f" });
  text(x + 364, y + 18, "Sage", 13);
  text(x + 364, y + 36, "performing", 9, { strokeColor: C.muted });
  rect(x + 711, y + 16, loading ? 154 : 130, 31, {
    backgroundColor: loading ? "#edf0ef" : C.acidSoft,
    strokeColor: loading ? C.divider : "#a7bd42",
  });
  ellipse(x + 726, y + 27, 7, 7, { backgroundColor: loading ? "#a9b0b3" : "#759000", strokeColor: loading ? "#a9b0b3" : "#759000" });
  text(x + 745, y + 22, loading ? "Researching · 12s" : "Answer ready", 10, { strokeColor: loading ? C.muted : "#526500" });
  text(x + 1195, y + 24, "Journey Map", 11);
  text(x + 1314, y + 24, "Read Aloud", 11);
  rect(x + 1434, y + 15, 40, 34, { backgroundColor: C.surface, strokeColor: C.divider });
  text(x + 1446, y + 21, "•••", 13, { strokeColor: C.muted });
  line(x, y + 66, [[0, 0], [1600, 0]], { strokeColor: C.divider });
}

function question(x, y) {
  text(x + 170, y + 105, "CITY MEMORY · TURN 06", 9, { strokeColor: C.coral });
  text(x + 170, y + 130, "Why do cities preserve some memories—and erase others?", 31);
  text(x + 170, y + 174, "A concise answer from four checked sources.", 12, { strokeColor: C.muted });
}

function answerCard(x, y, loading = false) {
  const cardX = x + 170;
  const cardY = y + 218;
  rect(cardX, cardY, 1260, 388, { backgroundColor: C.surface, strokeColor: C.divider, strokeWidth: 1 });
  rect(cardX, cardY, 7, 388, { backgroundColor: C.coral, strokeColor: C.coral });
  text(cardX + 34, cardY + 25, "THE SHORT ANSWER", 9, { strokeColor: loading ? "#a5aaa8" : C.coral });

  if (loading) {
    skeleton(cardX + 34, cardY + 55, 465, 20);
    skeleton(cardX + 34, cardY + 96, 660);
    skeleton(cardX + 34, cardY + 121, 622, 11, true);
    skeleton(cardX + 34, cardY + 146, 570, 11, true);
    skeleton(cardX + 34, cardY + 193, 120, 25);
    skeleton(cardX + 168, cardY + 193, 140, 25, true);
    skeleton(cardX + 322, cardY + 193, 126, 25, true);
    rect(cardX + 34, cardY + 246, 698, 66, { backgroundColor: C.skeletonLight, strokeColor: C.divider });
    skeleton(cardX + 52, cardY + 264, 180, 9);
    skeleton(cardX + 52, cardY + 285, 550, 12, true);
    rect(cardX + 776, cardY + 24, 450, 247, { backgroundColor: C.skeletonLight, strokeColor: C.divider });
    line(cardX + 792, cardY + 40, [[0, 0], [418, 215]], { strokeColor: "#d7dad7" });
    line(cardX + 1210, cardY + 40, [[0, 0], [-418, 215]], { strokeColor: "#d7dad7" });
    skeleton(cardX + 776, cardY + 287, 340, 10);
    skeleton(cardX + 776, cardY + 307, 420, 8, true);
    rect(cardX + 34, cardY + 337, 1192, 34, { backgroundColor: C.surface, strokeColor: C.divider });
    skeleton(cardX + 52, cardY + 349, 245, 10);
    skeleton(cardX + 1010, cardY + 349, 170, 10, true);
    return;
  }

  text(cardX + 34, cardY + 53, "Public memory is designed, not merely stored.", 22);
  text(cardX + 34, cardY + 93, "Cities make some histories durable through names, landmarks, archives, and rituals.\nOther histories become harder to see through demolition, renaming, and neglect. [1–4]", 14, { lineHeight: 1.4 });

  rect(cardX + 34, cardY + 185, 132, 28, { backgroundColor: "#eef7fd", strokeColor: "#a8cde4" });
  text(cardX + 49, cardY + 193, "VISIBLE POWER", 9, { strokeColor: "#315d79" });
  rect(cardX + 177, cardY + 185, 146, 28, { backgroundColor: "#fff0ec", strokeColor: "#e5afa5" });
  text(cardX + 193, cardY + 193, "SELECTIVE MEMORY", 9, { strokeColor: "#973c2f" });
  rect(cardX + 334, cardY + 185, 134, 28, { backgroundColor: C.acidSoft, strokeColor: "#b5c966" });
  text(cardX + 349, cardY + 193, "LIVING RECORD", 9, { strokeColor: "#526500" });

  rect(cardX + 34, cardY + 239, 698, 70, { backgroundColor: C.acidSoft, strokeColor: "#a7bd42" });
  text(cardX + 54, cardY + 253, "WHERE THIS LEAVES US", 9, { strokeColor: "#526500" });
  text(cardX + 54, cardY + 277, "A city's memory is a negotiation over what remains visible.", 14);

  rect(cardX + 776, cardY + 24, 450, 247, { backgroundColor: "#eee4d1", strokeColor: C.divider });
  imageElement(cardX + 784, cardY + 32, 434, 203);
  text(cardX + 786, cardY + 246, "Jackson Park & Midway Plaisance, Chicago, 1892", 10);
  text(cardX + 776, cardY + 287, "Library of Congress · Geography and Map Division", 9, {
    strokeColor: C.muted,
    link: "https://www.loc.gov/item/2010587004/",
  });

  rect(cardX + 34, cardY + 329, 1192, 42, { backgroundColor: C.surface, strokeColor: C.divider });
  text(cardX + 52, cardY + 343, "Evidence & research details", 11);
  text(cardX + 787, cardY + 344, "4 sources · 9 searches · $0.18 · GPT-5.6 Luna · 42s", 9, { strokeColor: C.muted });
  rect(cardX + 1084, cardY + 337, 122, 26, { backgroundColor: C.ink, strokeColor: C.ink });
  text(cardX + 1101, cardY + 344, "DEEPER DIVE  ↗", 9, { strokeColor: C.surface });
}

function directions(x, y, loading = false) {
  const top = y + 652;
  text(x + 170, top, "CHOOSE THE NEXT DIRECTION", 9, { strokeColor: loading ? "#a2a8a6" : C.coral });
  text(x + 170, top + 24, "Where should curiosity go next?", 18, { strokeColor: loading ? "#8e9695" : C.ink });
  const cardY = top + 58;
  if (loading) {
    rect(x + 170, cardY, 612, 68, { backgroundColor: C.skeletonLight, strokeColor: C.divider });
    rect(x + 818, cardY, 612, 68, { backgroundColor: C.skeletonLight, strokeColor: C.divider });
    skeleton(x + 190, cardY + 15, 120, 8);
    skeleton(x + 190, cardY + 38, 430, 13, true);
    skeleton(x + 838, cardY + 15, 120, 8);
    skeleton(x + 838, cardY + 38, 390, 13, true);
    skeleton(x + 600, cardY + 88, 130, 8, true);
    skeleton(x + 858, cardY + 88, 160, 8, true);
    return;
  }
  rect(x + 170, cardY, 612, 68, { backgroundColor: C.blue, strokeColor: "#75a9ca" });
  text(x + 190, cardY + 12, "←  PLACE & POWER", 9, { strokeColor: "#315d79" });
  text(x + 190, cardY + 35, "Who decides which memories become official?", 14);
  rect(x + 818, cardY, 612, 68, { backgroundColor: C.green, strokeColor: "#9fb63a" });
  text(x + 838, cardY + 12, "LOSS & RECOVERY  →", 9, { strokeColor: "#526500" });
  text(x + 838, cardY + 35, "Can a city recover a memory it erased?", 14);
  text(x + 586, cardY + 86, "✦  Let Sage choose", 10, { strokeColor: C.muted });
  text(x + 850, cardY + 86, "Neither question works  ⌄", 10, { strokeColor: C.muted });
}

function baseScreen(x, y, loading = false) {
  rect(x, y, 1600, 900, { backgroundColor: C.paper, strokeColor: C.ink, strokeWidth: 2 });
  header(x, y, loading);
  question(x, y);
  answerCard(x, y, loading);
  directions(x, y, loading);
}

function overlayScreen(x, y) {
  baseScreen(x, y, false);
  rect(x, y, 1600, 900, { backgroundColor: C.ink, strokeColor: C.ink, opacity: 56 });
  const modalX = x + 295;
  const modalY = y + 118;
  rect(modalX, modalY, 1010, 664, { backgroundColor: C.surface, strokeColor: C.ink, strokeWidth: 2 });
  text(modalX + 36, modalY + 27, "DEEPER DIVE", 9, { strokeColor: C.coral });
  text(modalX + 36, modalY + 52, "How a city makes memory durable", 26);
  text(modalX + 36, modalY + 91, "Supporting detail without leaving the journey.", 12, { strokeColor: C.muted });
  rect(modalX + 944, modalY + 24, 40, 40, { backgroundColor: C.surface, strokeColor: C.divider });
  text(modalX + 958, modalY + 31, "×", 21);
  line(modalX + 36, modalY + 126, [[0, 0], [938, 0]], { strokeColor: C.divider });

  text(modalX + 36, modalY + 154, "01  THE BUILT ENVIRONMENT", 10, { strokeColor: C.coral });
  text(modalX + 36, modalY + 181, "Names, monuments, transit maps, and preserved buildings repeatedly place\nselected histories in public view. Repetition helps them feel settled and official. [1][2]", 14, { lineHeight: 1.45 });
  text(modalX + 36, modalY + 272, "02  THE POLITICS OF ABSENCE", 10, { strokeColor: C.coral });
  text(modalX + 36, modalY + 299, "Demolition and renaming can weaken visible continuity. Communities often answer\nwith oral histories, family archives, protest, and informal place-names. [3][4]", 14, { lineHeight: 1.45 });

  rect(modalX + 625, modalY + 154, 349, 218, { backgroundColor: "#eee4d1", strokeColor: C.divider });
  imageElement(modalX + 633, modalY + 162, 333, 155);
  text(modalX + 633, modalY + 330, "Souvenir map, Jackson Park, 1892", 10);
  text(modalX + 633, modalY + 348, "Library of Congress · public domain", 9, { strokeColor: C.muted });

  rect(modalX + 36, modalY + 411, 938, 72, { backgroundColor: C.acidSoft, strokeColor: "#a7bd42" });
  text(modalX + 56, modalY + 426, "KEY DISTINCTION", 9, { strokeColor: "#526500" });
  text(modalX + 56, modalY + 450, "Official memory is not the same as shared memory; the second can survive outside institutions.", 14);

  rect(modalX + 36, modalY + 511, 938, 92, { backgroundColor: "#f5f6f3", strokeColor: C.divider });
  text(modalX + 56, modalY + 528, "SOURCES", 9, { strokeColor: C.muted });
  text(modalX + 56, modalY + 551, "[1] Library of Congress map collection   [2] Chicago municipal archives", 11);
  text(modalX + 56, modalY + 574, "[3] National Park Service preservation guidance   [4] Community oral-history collection", 11);
  text(modalX + 821, modalY + 620, "Close and continue", 10, { strokeColor: C.muted });
}

text(60, 34, "WonderDrive · contained answer card", 26);
text(60, 69, "The main journey stays quiet; detail appears only on request in a closable overlay.", 13, { strokeColor: C.muted });
rect(1360, 39, 300, 30, { backgroundColor: C.green, strokeColor: C.green });
text(1395, 47, "CONDENSED · CARD-CONTAINED", 10);
baseScreen(60, 104, false);

text(1720, 47, "IN-PLACE BUFFERING · NOT A SEPARATE PAGE", 13, { strokeColor: C.muted });
baseScreen(1720, 104, true);

text(3380, 47, "DEEPER DIVE · CLOSABLE OVERLAY", 13, { strokeColor: C.muted });
overlayScreen(3380, 104);

rect(60, 1036, 4920, 84, { backgroundColor: C.surface, strokeColor: C.divider });
text(86, 1054, "INTERACTION NOTES", 9, { strokeColor: C.coral });
text(86, 1078, "Research never opens an intermediate steps page: the mounted answer card buffers in place until content replaces its skeletons. Deeper dive opens above the stable journey and closes with ×, Escape, or outside click.", 13);

const response = await fetch("https://tile.loc.gov/image-services/iiif/service:gmd:gmd410:g4104:g4104c:ct002834/full/pct:25/0/default.jpg");
if (!response.ok) throw new Error(`Could not retrieve archival map: ${response.status}`);
const sourceBuffer = Buffer.from(await response.arrayBuffer());
const mapJpeg = await sharp(sourceBuffer).resize(1000, 460, { fit: "cover", position: "centre" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
const mapDataUrl = `data:image/jpeg;base64,${mapJpeg.toString("base64")}`;
const files = {
  [mapFileId]: {
    mimeType: "image/jpeg",
    id: mapFileId,
    dataURL: mapDataUrl,
    created: 1784073600000,
    lastRetrieved: 1784073600000,
  },
};

const drawing = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: { gridSize: null, viewBackgroundColor: C.paper, currentItemFontFamily: 2 },
  files,
};

fs.mkdirSync("design", { recursive: true });
const stem = "design/wonderdrive-card-journey-screen";
fs.writeFileSync(`${stem}.excalidraw`, `${JSON.stringify(drawing, null, 2)}\n`);

const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="5040" height="1160" viewBox="0 0 5040 1160">',
  `<rect width="5040" height="1160" fill="${C.paper}"/>`,
  "<style>text{font-family:Inter,Arial,Helvetica,sans-serif}</style>",
];

for (const element of elements) {
  const fill = element.backgroundColor === "transparent" ? "none" : element.backgroundColor;
  const opacity = element.opacity / 100;
  if (element.type === "rectangle") svg.push(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.roundness ? 7 : 0}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  if (element.type === "ellipse") svg.push(`<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  if (element.type === "line") {
    const points = element.points.map((point) => `${element.x + point[0]},${element.y + point[1]}`).join(" ");
    svg.push(`<polyline points="${points}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  }
  if (element.type === "image") svg.push(`<image href="${mapDataUrl}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid slice"/>`);
  if (element.type === "text") {
    const weight = element.fontSize >= 18 ? 600 : 500;
    const lines = element.text.split("\n");
    svg.push(`<text x="${element.x}" y="${element.y + element.fontSize}" fill="${element.strokeColor}" font-size="${element.fontSize}" font-weight="${weight}" opacity="${opacity}">${lines.map((value, index) => `<tspan x="${element.x}" dy="${index ? element.fontSize * element.lineHeight : 0}">${esc(value)}</tspan>`).join("")}</text>`);
  }
}

svg.push("</svg>");
fs.writeFileSync(`${stem}.svg`, svg.join("\n"));
const boardPng = await sharp(Buffer.from(svg.join("\n"))).png().toBuffer();
fs.writeFileSync(`${stem}.png`, boardPng);
await sharp(boardPng).extract({ left: 60, top: 104, width: 1600, height: 900 }).png().toFile(`${stem}-main.png`);
await sharp(boardPng).extract({ left: 1720, top: 104, width: 1600, height: 900 }).png().toFile(`${stem}-loading.png`);
await sharp(boardPng).extract({ left: 3380, top: 104, width: 1600, height: 900 }).png().toFile(`${stem}-deep-dive.png`);
console.log(`Created ${stem}.{excalidraw,svg,png} plus three 16:9 state previews`);
