import fs from "node:fs";
import sharp from "sharp";

const PAPER = "#f6f1e7";
const SURFACE = "#fffdf8";
const INK = "#17212b";
const MUTED = "#69747d";
const DIVIDER = "#cfd2ce";
const CORAL = "#ef735f";
const BLUE = "#b9ddf5";
const GREEN = "#dfff58";
const SKELETON = "#dfe2df";
const SKELETON_LIGHT = "#e9eae7";

const elements = [];
let serial = 0;
const fileId = "wonderdrive-archival-map";

function base(type, x, y, width, height, o = {}) {
  serial += 1;
  return {
    id: `wd-editorial-${serial}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: o.strokeColor ?? INK,
    backgroundColor: o.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: o.strokeWidth ?? 1,
    strokeStyle: o.strokeStyle ?? "solid",
    roughness: o.roughness ?? 0,
    opacity: o.opacity ?? 100,
    groupIds: [],
    frameId: null,
    index: `a${serial.toString(36)}`,
    roundness: o.roundness === false ? null : { type: 3 },
    seed: 24000 + serial * 97,
    version: 1,
    versionNonce: 52000 + serial * 131,
    isDeleted: false,
    boundElements: null,
    updated: 1784073600000,
    link: o.link ?? null,
    locked: false,
  };
}

function rect(x, y, width, height, o = {}) {
  elements.push(base("rectangle", x, y, width, height, o));
}

function ellipse(x, y, width, height, o = {}) {
  elements.push(base("ellipse", x, y, width, height, { ...o, roundness: false }));
}

function text(x, y, value, size = 16, o = {}) {
  const lines = value.split("\n");
  elements.push({
    ...base(
      "text",
      x,
      y,
      o.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.53,
      o.height ?? lines.length * size * (o.lineHeight ?? 1.25),
      { strokeColor: o.strokeColor, roughness: 0, roundness: false, link: o.link },
    ),
    fontSize: size,
    fontFamily: o.fontFamily ?? 2,
    text: value,
    textAlign: o.textAlign ?? "left",
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
    ...base(
      "line",
      x,
      y,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      { ...o, roundness: false },
    ),
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
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
  });
}

function skeletonLine(x, y, width, height = 12, light = false) {
  rect(x, y, width, height, {
    backgroundColor: light ? SKELETON_LIGHT : SKELETON,
    strokeColor: light ? SKELETON_LIGHT : SKELETON,
    roundness: true,
  });
}

function header(x, y, loading) {
  text(x + 42, y + 24, "WONDER", 17, { strokeColor: INK });
  text(x + 116, y + 24, "DRIVE", 17, { strokeColor: CORAL });
  line(x + 209, y + 16, [[0, 0], [0, 34]], { strokeColor: DIVIDER });
  text(x + 234, y + 17, "TURN 06", 10, { strokeColor: MUTED });
  ellipse(x + 311, y + 14, 34, 34, { backgroundColor: "#ffd1c9", strokeColor: CORAL });
  text(x + 324, y + 21, "S", 13, { strokeColor: "#973c2f" });
  text(x + 355, y + 17, "Sage", 14);
  text(x + 355, y + 36, "current performer", 9, { strokeColor: MUTED });

  rect(x + 680, y + 14, loading ? 158 : 138, 32, {
    backgroundColor: loading ? "#edf0ef" : "#efffc4",
    strokeColor: loading ? DIVIDER : "#a7bd42",
  });
  ellipse(x + 695, y + 25, 8, 8, {
    backgroundColor: loading ? "#a9b0b3" : "#83a100",
    strokeColor: loading ? "#a9b0b3" : "#83a100",
  });
  text(x + 715, y + 21, loading ? "Researching · 12s" : "Answer ready", 11, {
    strokeColor: loading ? MUTED : "#526500",
  });

  text(x + 1172, y + 24, "Journey Map", 12);
  text(x + 1293, y + 24, "Read Aloud", 12);
  rect(x + 1421, y + 13, 42, 34, { backgroundColor: SURFACE, strokeColor: DIVIDER });
  text(x + 1434, y + 19, "•••", 13, { strokeColor: MUTED });
}

function question(x, y) {
  text(x + 42, y + 88, "CITY MEMORY · TURN 06", 10, { strokeColor: CORAL });
  text(x + 42, y + 112, "Why do cities preserve some memories—and erase others?", 34, {
    width: 1100,
  });
  text(
    x + 42,
    y + 161,
    "A city remembers through more than archives. Its streets, monuments, rituals, and absences all tell us who had the power to make a past feel permanent.",
    14,
    { strokeColor: MUTED, width: 1260 },
  );
  line(x + 42, y + 203, [[0, 0], [1476, 0]], { strokeColor: DIVIDER });
}

function answerReady(x, y) {
  const left = x + 42;
  const top = y + 228;
  text(left, top, "01", 11, { strokeColor: CORAL });
  text(left + 44, top - 3, "Memory becomes infrastructure", 20);
  text(
    left + 44,
    top + 33,
    "Street names, preserved buildings, and public ceremonies make selected stories part of daily life.\nThey turn memory into something people repeatedly encounter—not simply something stored away. [1]",
    13,
    { width: 770, lineHeight: 1.35 },
  );
  text(
    left + 44,
    top + 100,
    "That visibility gives official memory unusual staying power. A map can quietly teach a hierarchy:\nwhich places are centered, which are renamed, and which disappear at the edge. [2]",
    13,
    { width: 770, lineHeight: 1.35 },
  );
  line(left, top + 164, [[0, 0], [800, 0]], { strokeColor: DIVIDER });
  text(left, top + 187, "02", 11, { strokeColor: CORAL });
  text(left + 44, top + 184, "Forgetting is often a policy choice", 20);
  text(
    left + 44,
    top + 220,
    "Demolition, redevelopment, and removed records can make a community's history harder to see.\nUnofficial memory persists through oral history, family archives, protest, and familiar names. [3][4]",
    13,
    { width: 770, lineHeight: 1.35 },
  );

  const imageX = x + 928;
  const imageY = top - 3;
  rect(imageX, imageY, 590, 280, { backgroundColor: "#efe6d4", strokeColor: DIVIDER });
  imageElement(imageX + 8, imageY + 8, 574, 224);
  rect(imageX + 21, imageY + 19, 105, 25, { backgroundColor: SURFACE, strokeColor: SURFACE, opacity: 88 });
  text(imageX + 33, imageY + 25, "ARCHIVAL MAP", 9, { strokeColor: INK });
  text(imageX + 9, imageY + 242, "Jackson Park & Midway Plaisance, Chicago, 1892", 11);
  text(imageX + 9, imageY + 260, "Library of Congress, Geography and Map Division · public domain", 9, {
    strokeColor: MUTED,
    link: "https://www.loc.gov/item/2010587004/",
  });
}

function answerLoading(x, y) {
  const left = x + 42;
  const top = y + 228;
  text(left, top, "01", 11, { strokeColor: "#a4aaa8" });
  skeletonLine(left + 44, top, 306, 17);
  skeletonLine(left + 44, top + 38, 758);
  skeletonLine(left + 44, top + 62, 710, 12, true);
  skeletonLine(left + 44, top + 86, 748, 12, true);
  skeletonLine(left + 44, top + 110, 525, 12, true);
  line(left, top + 164, [[0, 0], [800, 0]], { strokeColor: DIVIDER });
  text(left, top + 187, "02", 11, { strokeColor: "#a4aaa8" });
  skeletonLine(left + 44, top + 187, 335, 17);
  skeletonLine(left + 44, top + 225, 758);
  skeletonLine(left + 44, top + 249, 700, 12, true);
  skeletonLine(left + 44, top + 273, 612, 12, true);

  const imageX = x + 928;
  const imageY = top - 3;
  rect(imageX, imageY, 590, 280, { backgroundColor: SKELETON_LIGHT, strokeColor: DIVIDER });
  line(imageX + 18, imageY + 18, [[0, 0], [554, 244]], { strokeColor: "#d6d9d6" });
  line(imageX + 572, imageY + 18, [[0, 0], [-554, 244]], { strokeColor: "#d6d9d6" });
  skeletonLine(imageX + 9, imageY + 242, 380, 10);
  skeletonLine(imageX + 9, imageY + 261, 474, 8, true);
}

function conclusion(x, y, loading) {
  const top = y + 535;
  rect(x + 42, top, 1476, 70, {
    backgroundColor: loading ? "#eceeea" : "#efffc4",
    strokeColor: loading ? DIVIDER : "#9fb63a",
  });
  text(x + 64, top + 13, "WHERE THIS LEAVES US", 9, {
    strokeColor: loading ? "#9da4a2" : "#526500",
  });
  if (loading) {
    skeletonLine(x + 64, top + 36, 1080, 13);
    skeletonLine(x + 1162, top + 36, 250, 13, true);
  } else {
    text(
      x + 64,
      top + 34,
      "A city's memory is not a vault. It is a living negotiation over what becomes visible, repeatable, and difficult to forget.",
      15,
    );
  }

  rect(x + 42, top + 82, 1476, 42, { backgroundColor: SURFACE, strokeColor: DIVIDER });
  if (loading) {
    skeletonLine(x + 64, top + 97, 248, 11);
    skeletonLine(x + 1025, top + 97, 420, 10, true);
  } else {
    text(x + 64, top + 94, "Evidence & research details", 12);
    text(x + 973, top + 95, "4 sources  ·  9 searches  ·  $0.18  ·  GPT-5.6 Luna  ·  42s", 10, {
      strokeColor: MUTED,
    });
    text(x + 1481, top + 94, "⌄", 14, { strokeColor: MUTED });
  }
}

function directions(x, y, loading) {
  const top = y + 684;
  text(x + 42, top, "CHOOSE THE NEXT DIRECTION", 9, { strokeColor: loading ? "#9da4a2" : CORAL });
  text(x + 42, top + 22, "Where should curiosity go next?", 18, {
    strokeColor: loading ? "#8e9695" : INK,
  });

  const cardY = top + 54;
  if (loading) {
    rect(x + 42, cardY, 725, 72, { backgroundColor: "#e8ebea", strokeColor: DIVIDER });
    rect(x + 793, cardY, 725, 72, { backgroundColor: "#e8ebea", strokeColor: DIVIDER });
    skeletonLine(x + 67, cardY + 17, 130, 9);
    skeletonLine(x + 67, cardY + 40, 505, 15, true);
    skeletonLine(x + 818, cardY + 17, 130, 9);
    skeletonLine(x + 818, cardY + 40, 460, 15, true);
    skeletonLine(x + 570, cardY + 91, 150, 9, true);
    skeletonLine(x + 846, cardY + 91, 188, 9, true);
    return;
  }

  rect(x + 42, cardY, 725, 72, { backgroundColor: BLUE, strokeColor: "#75a9ca", strokeWidth: 1 });
  text(x + 64, cardY + 13, "←  PLACE & POWER", 9, { strokeColor: "#315d79" });
  text(x + 64, cardY + 35, "Who decides which city memories become official?", 15);
  text(x + 732, cardY + 28, "←", 20, { strokeColor: "#315d79" });

  rect(x + 793, cardY, 725, 72, { backgroundColor: GREEN, strokeColor: "#9fb63a", strokeWidth: 1 });
  text(x + 815, cardY + 13, "LOSS & RECOVERY  →", 9, { strokeColor: "#526500" });
  text(x + 815, cardY + 35, "Can a city recover a memory it deliberately erased?", 15);
  text(x + 1482, cardY + 28, "→", 20, { strokeColor: "#526500" });

  text(x + 553, cardY + 88, "✦  Let Sage choose", 11, { strokeColor: MUTED });
  text(x + 826, cardY + 88, "Neither question works", 11, { strokeColor: MUTED });
  text(x + 1002, cardY + 88, "⌄", 12, { strokeColor: MUTED });
}

function screen(x, y, loading) {
  rect(x, y, 1600, 900, { backgroundColor: PAPER, strokeColor: INK, strokeWidth: 2 });
  rect(x, y, 1600, 64, { backgroundColor: SURFACE, strokeColor: SURFACE });
  header(x, y, loading);
  line(x, y + 64, [[0, 0], [1600, 0]], { strokeColor: DIVIDER });
  question(x, y);
  if (loading) answerLoading(x, y);
  else answerReady(x, y);
  conclusion(x, y, loading);
  directions(x, y, loading);
}

text(60, 34, "WonderDrive · editorial journey screen", 26);
text(60, 69, "One 16:9 composition. Ready content and loading placeholders share identical geometry.", 13, {
  strokeColor: MUTED,
});
rect(1372, 38, 288, 31, { backgroundColor: GREEN, strokeColor: GREEN });
text(1402, 47, "READY · INFORMATION FIRST", 10);
screen(60, 100, false);

text(1720, 44, "LOADING STATE · SAME LAYOUT", 13, { strokeColor: MUTED });
screen(1720, 100, true);

// Compact interaction note for the collapsed "Neither" action.
rect(60, 1034, 3260, 94, { backgroundColor: SURFACE, strokeColor: DIVIDER });
text(86, 1055, "NEITHER QUESTION WORKS · EXPANDED BEHAVIOR", 10, { strokeColor: CORAL });
text(86, 1082, "Opens in place beneath the quiet action:  Practical  /  Surprising  /  Different direction  /  Optional note.  Regeneration preserves the answer above.  Header overflow: Save journey / Export.", 14);

const mapResponse = await fetch("https://tile.loc.gov/image-services/iiif/service:gmd:gmd410:g4104:g4104c:ct002834/full/pct:25/0/default.jpg");
if (!mapResponse.ok) throw new Error(`Could not retrieve archival map: ${mapResponse.status}`);
const mapBuffer = Buffer.from(await mapResponse.arrayBuffer());
const mapJpeg = await sharp(mapBuffer)
  .resize(1148, 448, { fit: "cover", position: "centre" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
const mapDataUrl = `data:image/jpeg;base64,${mapJpeg.toString("base64")}`;

const files = {
  [fileId]: {
    mimeType: "image/jpeg",
    id: fileId,
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
  appState: { gridSize: null, viewBackgroundColor: PAPER, currentItemFontFamily: 2 },
  files,
};

fs.mkdirSync("design", { recursive: true });
const stem = "design/wonderdrive-editorial-journey-screen";
fs.writeFileSync(`${stem}.excalidraw`, `${JSON.stringify(drawing, null, 2)}\n`);

const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="3380" height="1168" viewBox="0 0 3380 1168">`,
  `<rect width="3380" height="1168" fill="${PAPER}"/>`,
  "<style>text{font-family:Inter,Arial,Helvetica,sans-serif}</style>",
];

for (const element of elements) {
  const fill = element.backgroundColor === "transparent" ? "none" : element.backgroundColor;
  const opacity = element.opacity / 100;
  if (element.type === "rectangle") {
    svg.push(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.roundness ? 7 : 0}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  }
  if (element.type === "ellipse") {
    svg.push(`<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  }
  if (element.type === "line") {
    const points = element.points.map((point) => `${element.x + point[0]},${element.y + point[1]}`).join(" ");
    svg.push(`<polyline points="${points}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" opacity="${opacity}"/>`);
  }
  if (element.type === "image") {
    svg.push(`<image href="${mapDataUrl}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid slice"/>`);
  }
  if (element.type === "text") {
    const lines = element.text.split("\n");
    const weight = element.fontSize >= 18 ? 600 : 500;
    svg.push(`<text x="${element.x}" y="${element.y + element.fontSize}" fill="${element.strokeColor}" font-size="${element.fontSize}" font-weight="${weight}" opacity="${opacity}">${lines.map((value, index) => `<tspan x="${element.x}" dy="${index ? element.fontSize * element.lineHeight : 0}">${escapeXml(value)}</tspan>`).join("")}</text>`);
  }
}

svg.push("</svg>");
fs.writeFileSync(`${stem}.svg`, svg.join("\n"));
await sharp(Buffer.from(svg.join("\n"))).png().toFile(`${stem}.png`);
console.log(`Created ${stem}.{excalidraw,svg,png}`);
