import fs from "node:fs";

const elements = [];
let serial = 0;

function base(type, x, y, width, height, options = {}) {
  serial += 1;
  return {
    id: `wd4-${serial}`, type, x, y, width, height, angle: options.angle ?? 0,
    strokeColor: options.strokeColor ?? "#1e1e1e",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "solid", strokeWidth: options.strokeWidth ?? 2,
    strokeStyle: options.strokeStyle ?? "solid", roughness: options.roughness ?? 1.4,
    opacity: options.opacity ?? 100, groupIds: [], frameId: null, index: `a${serial}`,
    roundness: options.roundness === false ? null : { type: 3 },
    seed: 4100 + serial * 97, version: 1, versionNonce: 13000 + serial * 131,
    isDeleted: false, boundElements: null, updated: 1720980000000,
    link: null, locked: false,
  };
}

const rect = (x, y, w, h, o = {}) => elements.push(base("rectangle", x, y, w, h, o));
const ellipse = (x, y, w, h, o = {}) => elements.push(base("ellipse", x, y, w, h, { ...o, roundness: false }));

function text(x, y, value, size = 18, options = {}) {
  const lines = value.split("\n");
  const width = options.width ?? Math.max(...lines.map((line) => line.length)) * size * 0.58;
  const height = options.height ?? lines.length * size * 1.25;
  elements.push({
    ...base("text", x, y, width, height, {
      strokeColor: options.strokeColor ?? "#1e1e1e", backgroundColor: "transparent",
      strokeWidth: 1, roughness: 0, roundness: false, angle: options.angle,
    }),
    fontSize: size, fontFamily: 5, text: value,
    textAlign: options.textAlign ?? "left", verticalAlign: "top",
    containerId: null, originalText: value, autoResize: true, lineHeight: 1.25,
  });
}

function path(type, x, y, points, options = {}) {
  const xs = points.map(([px]) => px);
  const ys = points.map(([, py]) => py);
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

text(76, 24, "WonderDrive — simple personalized start", 30);
text(78, 64, "Recommendations create the fun. Performer and model remain clear, compact choices.", 16, { strokeColor: "#495057" });

// Product frame and quiet navigation.
rect(64, 108, 1370, 930, { backgroundColor: "#fffdf8", roughness: 1.8 });
line(64, 169, [[0, 0], [1370, 0]], { strokeColor: "#868e96", strokeWidth: 1 });
text(96, 125, "WONDERDRIVE", 20);
text(676, 127, "New journey     My paths", 14, { strokeColor: "#495057" });
ellipse(1374, 126, 14, 14, { backgroundColor: "#b2f2bb", strokeColor: "#2b8a3e", strokeWidth: 1 });

// Personalized recommendation marquee — the visual spark.
text(186, 210, "20 questions for you", 13);
text(355, 211, "written in Sage’s style · based on your question history", 11, { strokeColor: "#868e96" });
text(1230, 210, "4 / 20", 11, { strokeColor: "#868e96" });
rect(160, 239, 1178, 112, { backgroundColor: "#fff9db", strokeColor: "#f08c00", strokeWidth: 2, roughness: 1.8 });
ellipse(177, 271, 39, 39, { backgroundColor: "#ffffff", strokeColor: "#f08c00", strokeWidth: 1 });
text(191, 280, "←", 15);

rect(235, 258, 306, 74, { backgroundColor: "#ffffff", strokeColor: "#f08c00", strokeWidth: 1 });
text(252, 270, "MAPS & POWER", 9, { strokeColor: "#e8590c" });
text(252, 292, "What can an accurate map still hide?", 13);

rect(554, 258, 317, 74, { backgroundColor: "#e7f5ff", strokeColor: "#1971c2", strokeWidth: 1 });
text(571, 270, "PLACE & MEMORY", 9, { strokeColor: "#1971c2" });
text(571, 292, "Where does a city keep its memories?", 13);

rect(884, 258, 353, 74, { backgroundColor: "#f3d9fa", strokeColor: "#9c36b5", strokeWidth: 1 });
text(901, 270, "HIDDEN SYSTEMS", 9, { strokeColor: "#9c36b5" });
text(901, 292, "When does a shortcut become infrastructure?", 13);

ellipse(1260, 271, 39, 39, { backgroundColor: "#ffffff", strokeColor: "#f08c00", strokeWidth: 1 });
text(1274, 280, "→", 15);
text(1184, 358, "moves automatically · pause on hover", 9, { strokeColor: "#868e96" });

// The single primary field.
text(342, 397, "What are you curious about?", 28);
rect(250, 443, 998, 111, { backgroundColor: "#ffffff", strokeColor: "#1e1e1e", strokeWidth: 2 });
text(278, 471, "Where does a city keep its memories?", 21);
text(1156, 525, "38 / 280", 11, { strokeColor: "#868e96" });

// Only two compact selectors.
text(250, 595, "Performer", 12, { strokeColor: "#495057" });
rect(250, 620, 476, 59, { backgroundColor: "#ffffff", strokeColor: "#e8590c", strokeWidth: 2 });
ellipse(268, 634, 31, 31, { backgroundColor: "#ffc9c9", strokeColor: "#e8590c", strokeWidth: 1 });
text(279, 640, "S", 13, { strokeColor: "#c92a2a" });
text(313, 631, "Sage", 15);
text(313, 653, "patient connections", 10, { strokeColor: "#868e96" });
text(693, 639, "⌄", 16);

text(772, 595, "Model", 12, { strokeColor: "#495057" });
rect(772, 620, 476, 59, { backgroundColor: "#ffffff", strokeColor: "#1971c2", strokeWidth: 2 });
text(793, 632, "GPT-5.6 Luna", 15);
text(793, 654, "fast · live research", 10, { strokeColor: "#868e96" });
text(1215, 639, "⌄", 16);

// The thin performer layer lives right here, with no “Meet” action.
rect(250, 701, 998, 83, { backgroundColor: "#fff4e6", strokeColor: "#e8590c", strokeWidth: 1 });
text(273, 716, "SAGE WILL CARRY THIS QUESTION", 9, { strokeColor: "#e8590c" });
text(273, 740, "Patient, warm, and precise—connecting the answer to deeper patterns without forcing a surprise.", 14);
text(273, 765, "Changing performer refreshes both this layer and the 20 questions above.", 10, { strokeColor: "#868e96" });

// One action, one small confidence line.
rect(250, 824, 998, 68, { backgroundColor: "#1e1e1e", strokeColor: "#1e1e1e", strokeWidth: 2 });
text(573, 844, "Begin the wonder   →", 19, { strokeColor: "#ffffff" });
text(515, 912, "Live web research · sources included · you’ll watch it unfold", 10, { strokeColor: "#868e96" });

// Interaction notes and dropdown open-state examples.
text(1482, 135, "Interaction model", 24);
rect(1467, 178, 372, 139, { backgroundColor: "#fff3bf", strokeColor: "#f08c00", roughness: 2 });
text(1488, 199, "Recommendations are the fun", 18);
text(1488, 230, "20 rotating questions are personalized\nfrom history and rewritten through\nthe selected performer’s perspective.", 14);
arrow(1468, 247, [[0, 0], [-103, 50]], { strokeColor: "#f08c00", strokeWidth: 2 });

rect(1467, 365, 372, 229, { backgroundColor: "#ffe8cc", strokeColor: "#e8590c", roughness: 2 });
text(1488, 386, "Performer dropdown", 18);
rect(1491, 420, 324, 145, { backgroundColor: "#ffffff", strokeColor: "#e8590c", strokeWidth: 1 });
text(1508, 433, "✓  Sage", 13);
text(1620, 434, "patient connections", 10, { strokeColor: "#868e96" });
text(1508, 464, "   Spark", 13);
text(1620, 465, "playful surprise", 10, { strokeColor: "#868e96" });
text(1508, 495, "   Mechanist", 13);
text(1620, 496, "how things work", 10, { strokeColor: "#868e96" });
text(1508, 526, "   Archivist", 13);
text(1620, 527, "context keeper", 10, { strokeColor: "#868e96" });
text(1508, 549, "More performers…", 10, { strokeColor: "#1971c2" });
arrow(1468, 491, [[0, 0], [-176, 155]], { strokeColor: "#e8590c", strokeWidth: 2 });

rect(1467, 643, 372, 247, { backgroundColor: "#e7f5ff", strokeColor: "#1971c2", roughness: 2 });
text(1488, 664, "Model dropdown", 18);
text(1488, 694, "No provider or endpoint UI.", 12, { strokeColor: "#495057" });
rect(1491, 724, 324, 137, { backgroundColor: "#ffffff", strokeColor: "#1971c2", strokeWidth: 1 });
text(1508, 739, "✓  GPT-5.6 Luna", 13);
text(1691, 740, "fast", 10, { strokeColor: "#868e96" });
text(1508, 773, "   GPT-5.6 Terra", 13);
text(1691, 774, "balanced", 10, { strokeColor: "#868e96" });
text(1508, 807, "   GPT-5.6 Sol", 13);
text(1691, 808, "deep", 10, { strokeColor: "#868e96" });
text(1508, 841, "   Reviewed free demo", 13);
arrow(1468, 793, [[0, 0], [-176, -141]], { strokeColor: "#1971c2", strokeWidth: 2 });

rect(1467, 929, 372, 86, { backgroundColor: "#d3f9d8", strokeColor: "#2b8a3e", roughness: 2 });
text(1488, 949, "Everything else belongs in Settings.", 15);
text(1488, 977, "Landing page = choose, ask, go.", 12);

text(78, 1064, "Mobile: recommendation ribbon → question → performer dropdown → model dropdown → performer layer → start", 14, { strokeColor: "#495057" });

const drawing = {
  type: "excalidraw", version: 2, source: "https://excalidraw.com", elements,
  appState: { gridSize: null, viewBackgroundColor: "#f8f9fa", currentItemFontFamily: 5 }, files: {},
};

fs.mkdirSync("design", { recursive: true });
fs.writeFileSync("design/wonderdrive-simple-personalized-landing-v4.excalidraw", `${JSON.stringify(drawing, null, 2)}\n`);
