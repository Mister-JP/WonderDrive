import fs from "node:fs";
import sharp from "sharp";

// Regenerate the authoritative combined board first, then derive spacious,
// independently editable views from its real Excalidraw frames.
await import("./generate-infrastructure-architecture.mjs");

const sourcePath = "design/wonderdrive-infrastructure-architecture.excalidraw";
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const paper = source.appState.viewBackgroundColor ?? "#fbf8ef";

const views = [
  {
    frameName: "1. System landscape",
    stem: "design/wonderdrive-architecture-01-system-landscape",
    scaleX: 1.05,
    scaleY: 1.25,
  },
  {
    frameName: "2. One research turn",
    stem: "design/wonderdrive-architecture-02-research-turn",
    scaleX: 1.05,
    scaleY: 1.45,
  },
  {
    frameName: "3. Inside WonderDrive",
    stem: "design/wonderdrive-architecture-03-inside-wonderdrive",
    scaleX: 1.05,
    scaleY: 1.35,
  },
  {
    frameName: "4. Deployment topology",
    stem: "design/wonderdrive-architecture-04-deployment-topology",
    scaleX: 1.05,
    scaleY: 1.35,
  },
];

for (const spec of views) {
  const frame = source.elements.find(
    (element) => element.type === "frame" && element.name === spec.frameName,
  );
  if (!frame) throw new Error(`Missing Excalidraw frame: ${spec.frameName}`);

  const margin = 45;
  const frameId = `standalone-${frame.id}`;
  const elements = source.elements
    .filter((element) => element.frameId === frame.id)
    .map((element) => transformElement(element, frame, frameId, margin, spec.scaleX, spec.scaleY));

  const standaloneFrame = {
    ...frame,
    id: frameId,
    x: margin,
    y: margin,
    width: Math.round(frame.width * spec.scaleX),
    height: Math.round(frame.height * spec.scaleY),
    index: "a0",
    frameId: null,
    seed: frame.seed + 100_000,
    versionNonce: frame.versionNonce + 100_000,
  };

  const drawing = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [standaloneFrame, ...elements],
    appState: {
      gridSize: null,
      viewBackgroundColor: paper,
      currentItemFontFamily: 1,
    },
    files: {},
  };

  fs.writeFileSync(`${spec.stem}.excalidraw`, `${JSON.stringify(drawing, null, 2)}\n`);
  const width = standaloneFrame.width + margin * 2;
  const height = standaloneFrame.height + margin * 2;
  const svg = renderSvg(drawing.elements, width, height, paper);
  fs.writeFileSync(`${spec.stem}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`${spec.stem}.png`);
  console.log(`Created ${spec.stem}.{excalidraw,svg,png} (${width}×${height})`);
}

function transformElement(element, frame, frameId, margin, scaleX, scaleY) {
  const transformed = {
    ...element,
    id: `standalone-${element.id}`,
    x: margin + (element.x - frame.x) * scaleX,
    y: margin + (element.y - frame.y) * scaleY,
    width: element.width * scaleX,
    height: element.height * scaleY,
    frameId,
    seed: element.seed + 100_000,
    versionNonce: element.versionNonce + 100_000,
    containerId: null,
    boundElements: null,
  };

  if (Array.isArray(element.points)) {
    transformed.points = element.points.map(([x, y]) => [x * scaleX, y * scaleY]);
    transformed.lastCommittedPoint = null;
    transformed.startBinding = null;
    transformed.endBinding = null;
  }

  // Keep text comfortably large while giving the sequence and component views
  // extra vertical breathing room.
  if (element.type === "text") {
    const fontScale = Math.max(1.08, Math.min(scaleX, scaleY));
    transformed.fontSize = Math.round(element.fontSize * fontScale);
    transformed.lineHeight = element.lineHeight ?? 1.25;
  }

  return transformed;
}

function renderSvg(elements, width, height, background) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    '<style>text{font-family:"Comic Sans MS","Bradley Hand",cursive}</style>',
    '<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>',
  ];

  for (const element of elements) {
    const fill = element.backgroundColor === "transparent" ? "none" : element.backgroundColor;
    const dash = element.strokeStyle === "dashed" ? ' stroke-dasharray="10 8"' : "";
    const transform = element.angle
      ? ` transform="rotate(${element.angle * 180 / Math.PI} ${element.x + element.width / 2} ${element.y + element.height / 2})"`
      : "";
    if (element.type === "frame") {
      svg.push(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="10" fill="#fffdf8" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"/>`);
    }
    if (element.type === "rectangle") {
      svg.push(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.roundness ? 8 : 0}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"${dash}${transform}/>`);
    }
    if (element.type === "ellipse") {
      svg.push(`<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" fill="${fill}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"${transform}/>`);
    }
    if (element.type === "line" || element.type === "arrow") {
      const points = element.points.map((point) => `${element.x + point[0]},${element.y + point[1]}`).join(" ");
      svg.push(`<polyline points="${points}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"${dash}${element.type === "arrow" ? ' marker-end="url(#arr)"' : ""}/>`);
    }
    if (element.type === "text") {
      const lines = element.text.split("\n");
      svg.push(`<text x="${element.x}" y="${element.y + element.fontSize}" fill="${element.strokeColor}" font-size="${element.fontSize}" font-weight="${element.fontSize >= 20 ? 600 : 500}"${transform}>${lines.map((lineText, index) => `<tspan x="${element.x}" dy="${index ? element.fontSize * element.lineHeight : 0}">${escapeXml(lineText)}</tspan>`).join("")}</text>`);
    }
  }
  svg.push("</svg>");
  return svg.join("\n");
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
