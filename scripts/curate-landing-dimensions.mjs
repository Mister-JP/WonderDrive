import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("editorial/landing");
const write = process.argv.includes("--write");
const force = process.argv.includes("--force");

const BASE_DIMENSION = {
  Nature: "Living World",
  Science: "Forces & Energy",
  History: "Time & History",
  Culture: "Society",
  Systems: "Design & Technology",
  Space: "Cosmos",
  Technology: "Design & Technology",
  Art: "Art & Expression",
};

const PRIMARY_DIMENSION = {
  "singing-sand": "Forces & Energy",
  "snowflake-sixfold": "Matter",
  "submarine-cables": "Design & Technology",
  "maeslant-barrier": "Design & Technology",
  "termite-mound-airflow": "Living World",
  "phantom-traffic-jam": "Society",
  "racetrack-sailing-stones": "Forces & Energy",
  "synchronous-fireflies": "Living World",
  "starling-murmuration": "Living World",
  "mantis-shrimp-polarized-vision": "Mind",
  "comb-jelly-rainbow": "Forces & Energy",
  "blue-morpho-structural-color": "Matter",
  "antarctica-blood-falls": "Matter",
  "sea-ice-frost-flowers": "Matter",
  "grand-prismatic-living-thermometer": "Living World",
  "leidenfrost-vapor-skating": "Forces & Energy",
  "falkirk-rotating-boat-lift": "Design & Technology",
  "living-root-bridge": "Design & Technology",
  "atacama-fog-harvesting": "Design & Technology",
  "kelvin-helmholtz-cloud-waves": "Forces & Energy",
  "xochimilco-chinampa-living-grid": "Food & Agriculture",
  "fata-morgana-stacked-horizon": "Forces & Energy",
  "venice-submerged-timber-foundations": "Design & Technology",
  "lotus-effect-rolling-water": "Matter",
  "beaver-dam-wetland-engineer": "Living World",
  "thermokarst-methane-bubbles": "Matter",
  "aurora-gas-color-code": "Forces & Energy",
  "soap-bubble-pop-clock": "Matter",
  "radiolarian-glass-cathedral": "Living World",
  "leafcutter-ant-fungus-farm": "Living World",
  "bali-subak-water-temples": "Society",
  "dutch-sand-motor-coast": "Design & Technology",
  "nacreous-clouds-after-sunset": "Matter",
  "qanat-desert-dotted-line": "Design & Technology",
  "bubble-chamber-invisible-tracks": "Forces & Energy",
  "ladakh-ice-stupa-spring-water": "Food & Agriculture",
  "hair-ice-fungal-sculptor": "Living World",
  "chand-baori-changing-waterline": "Design & Technology",
  "penitentes-sun-carved-ice": "Forces & Energy",
  "yakhchal-desert-ice-house": "Design & Technology",
  "ijen-burning-blue-sulfur": "Matter",
  "whale-fall-deep-sea-succession": "Living World",
  "lichtenberg-frozen-lightning": "Forces & Energy",
  "salmon-carry-ocean-into-forest": "Living World",
  "green-flash-last-sunlight": "Forces & Energy",
  "roman-hypocaust-heated-floor": "Design & Technology",
  "light-pillars-floating-mirrors": "Forces & Energy",
  "living-root-bridge-stronger": "Design & Technology",
  "snow-rollers-wind-sculpture": "Forces & Energy",
  "fog-net-drinking-water": "Design & Technology",
  "romanesco-fibonacci-growth": "Numbers & Logic",
  "qeswachaka-annual-rebuild": "Society",
  "fallstreak-hole-aircraft": "Forces & Energy",
  "aflaj-water-by-time": "Society",
  "red-sprites-above-thunderstorms": "Forces & Energy",
  "naica-giant-gypsum-crystals": "Matter",
  "brocken-spectre-rainbow-shadow": "Forces & Energy",
  "rainbow-is-really-a-circle": "Forces & Energy",
  "dutch-sand-motor-moving-coast": "Design & Technology",
  "oyster-reef-filter-and-breakwater": "Living World",
  "slime-mold-designs-rail-network": "Living World",
};

const RULES = [
  ["Living World", /\b(animal|ant|bacter|beaver|bee|berry|bird|butterfl|clam|coral|ecosystem|fish|flower|forest|frog|fung|gecko|insect|leaf|living|mangrove|mantis|mold|mollusk|octopus|orchid|organism|oyster|plant|puffer|reef|salmon|seabird|seadragon|seahorse|shrimp|slug|spider|squid|starling|termite|tree|whale|wood frog)\w*/i],
  ["Planet Earth", /\b(antarctic|arctic|atmospher|cave|climate|cloud|coast|desert|dune|earth|fog|glacier|ice|island|lake|lava|ocean|rain|river|rock|sea|shore|snow|storm|volcano|water|watershed|wave|weather)\w*/i],
  ["Cosmos", /\b(asteroid|astronom|comet|cosmic|galax|mars|moon|nebula|planet|pulsar|rocket|saturn|solar|space|spacecraft|star(?!ling)|sun|telescope|universe)\w*/i],
  ["Matter", /\b(acrylic|aerogel|bronze|cellulose|chemical|clay|concrete|crystal|dye|glass|gold|gypsum|ice|iron|jade|material|metal|mineral|molecule|pigment|potter|sand|stone|sulfur|terracotta|textile|thread|water|wood)\w*/i],
  ["Forces & Energy", /\b(acoustic|aurora|bubble|cavitation|color|electric|energy|flash|fluid|force|gravity|heat|laser|light|magnet|motion|optical|pressure|refraction|sound|temperature|turbulence|vibration|wave|wind)\w*/i],
  ["Numbers & Logic", /\b(angle|circle|code|comput|fibonacci|geometry|grid|hexagon|logic|map|network|number|pattern|polygon|ring|software|spiral|symmetr|six-sided)\w*/i],
  ["Time & History", /\b(ancient|archaeolog|bronze age|centur|empire|excavat|historic|inca|jōmon|king|medieval|neolithic|oldest|preserv|roman|viking|years? ago|year-old)\b/i],
  ["Society", /\b(city|community|coffin|coordinate|custom|festival|identity|people|prestige|procession|ritual|society|tradition|women divers)\b/i],
  ["Art & Expression", /\b(art(?!ific)|carv|ceramic|cloth|costume|dance|dye|feather|glaze|image|lacquer|mosaic|paint|performance|photo|potter|sculpt|textile|thread|weav)\w*/i],
  ["Design & Technology", /\b(architect|bridge|build|chip|city|computer|concrete|engineer|furnace|infrastructure|internet|lens|machine|robot|software|structure|telescope|tower|transport|wall)\w*/i],
];

// Semantic lenses are deliberately allow-listed. Words such as "memory",
// "heart", "script", or "harvest" are too metaphorical for clean keyword
// classification (shape-memory metal is not Mind; Pluto's heart is not Body).
const CURATED_IDS = {
  Body: new Set([
    "axolotl-regeneration", "glass-frog-transparency", "mangrove-salt",
    "blue-dragon-upside-down", "gecko-dry-adhesive", "lung-on-chip-breathing-membrane",
    "thorny-devil-skin-straws", "radiolarian-glass-cathedral", "pompeii-ash-void-casts",
    "giant-clam-solar-farm", "corpse-flower-heat-and-scent", "frogfish-fin-fishing-rod",
    "resurrection-plant-rehydration", "giant-waterlily-floating-truss",
    "pistol-shrimp-flashing-cavitation", "siphonophore-colony-one-body",
    "wood-frog-freezes-and-restarts", "jeju-haenyeo-one-breath-harvest",
  ]),
  Mind: new Set([
    "pointillist-color", "archerfish-refraction", "mantis-shrimp-polarized-vision",
    "synchronous-fireflies", "starling-murmuration", "vampire-squid-glowing-defense",
    "holbein-hidden-skull", "orchid-mantis-flower-disguise", "leaf-tailed-gecko-dead-leaf",
    "blue-footed-booby-courtship-steps", "satin-bowerbird-blue-gallery",
    "pygmy-seahorse-coral-camouflage", "peacock-spider-rainbow-fan",
    "holbein-anamorphic-skull", "pufferfish-underwater-sand-garden",
    "brocken-spectre-rainbow-shadow", "sofi-soft-robotic-fish",
  ]),
  Language: new Set([
    "inca-quipu", "dunhuang-sealed-library-cave", "archimedes-palimpsest-hidden-math",
    "phaistos-disc-stamped-script", "apollo-core-rope-software",
    "cyrus-cylinder-buried-proclamation", "shipibo-kene-visual-language",
  ]),
  "Belief & Ideas": new Set([
    "gobekli-tepe-monuments", "lalibela-carved-downward", "bali-subak-water-temples",
    "han-jade-burial-suit", "sand-mandala-impermanence", "gelede-masks-oral-history",
    "egyptian-blue-hippo-lotus-rebirth", "liangzhu-jade-cong-enigma",
    "oxus-gold-chariot-protective-face", "babylon-processional-brick-lions",
    "djenne-mosque-annual-replastering", "theyyam-costume-living-deity",
  ]),
  "Food & Agriculture": new Set([
    "ifugao-water-staircase", "xochimilco-chinampa-living-grid",
    "leafcutter-ant-fungus-farm", "bali-subak-water-temples",
    "ladakh-ice-stupa-spring-water", "aflaj-water-by-time",
    "jeju-haenyeo-one-breath-harvest",
  ]),
};

const REVIEWED = {
  "sea-ice-frost-flowers": ["Matter", "Planet Earth"],
  "leidenfrost-vapor-skating": ["Forces & Energy", "Matter"],
  "aurora-gas-color-code": ["Forces & Energy", "Cosmos", "Matter"],
  "radiolarian-glass-cathedral": ["Living World", "Body", "Matter"],
  "nacreous-clouds-after-sunset": ["Matter", "Planet Earth", "Forces & Energy"],
  "hair-ice-fungal-sculptor": ["Living World", "Planet Earth", "Matter"],
  "penitentes-sun-carved-ice": ["Forces & Energy", "Planet Earth", "Matter"],
  "lichtenberg-frozen-lightning": ["Forces & Energy", "Matter"],
  "green-flash-last-sunlight": ["Forces & Energy", "Planet Earth"],
  "snow-rollers-wind-sculpture": ["Forces & Energy", "Planet Earth", "Matter"],
  "romanesco-fibonacci-growth": ["Numbers & Logic", "Living World"],
  "venice-submerged-timber-foundations": ["Design & Technology", "Matter", "Time & History"],
  "beaver-dam-wetland-engineer": ["Living World", "Planet Earth"],
  "dutch-sand-motor-coast": ["Design & Technology", "Planet Earth", "Forces & Energy"],
  "pufferfish-underwater-sand-garden": ["Living World", "Mind", "Numbers & Logic", "Planet Earth"],
  "pollia-berry-color-without-pigment": ["Living World", "Matter", "Forces & Energy"],
  "pistol-shrimp-flashing-cavitation": ["Living World", "Forces & Energy", "Matter"],
  "siphonophore-colony-one-body": ["Living World", "Planet Earth", "Body"],
  "wood-frog-freezes-and-restarts": ["Living World", "Body", "Matter"],
  "red-sprites-above-thunderstorms": ["Forces & Energy", "Planet Earth", "Cosmos"],
  "naica-giant-gypsum-crystals": ["Matter", "Planet Earth", "Time & History"],
  "brocken-spectre-rainbow-shadow": ["Forces & Energy", "Mind", "Planet Earth"],
  "rainbow-is-really-a-circle": ["Forces & Energy", "Numbers & Logic", "Planet Earth"],
  "egyptian-blue-hippo-lotus-rebirth": ["Time & History", "Belief & Ideas", "Art & Expression"],
  "liangzhu-jade-cong-enigma": ["Time & History", "Belief & Ideas", "Art & Expression", "Matter"],
  "oxus-gold-chariot-protective-face": ["Time & History", "Belief & Ideas", "Art & Expression", "Design & Technology"],
  "babylon-processional-brick-lions": ["Time & History", "Belief & Ideas", "Art & Expression", "Society"],
  "djenne-mosque-annual-replastering": ["Society", "Belief & Ideas", "Design & Technology", "Art & Expression"],
  "jeju-haenyeo-one-breath-harvest": ["Society", "Planet Earth", "Body", "Food & Agriculture"],
  "theyyam-costume-living-deity": ["Art & Expression", "Belief & Ideas", "Society"],
  "ikat-pattern-dyed-before-weaving": ["Art & Expression", "Matter", "Society", "Design & Technology"],
  "dutch-sand-motor-moving-coast": ["Design & Technology", "Planet Earth", "Forces & Energy"],
  "oyster-reef-filter-and-breakwater": ["Living World", "Planet Earth", "Forces & Energy"],
  "slime-mold-designs-rail-network": ["Living World", "Numbers & Logic", "Design & Technology"],
  "red-rectangle-nebula-ladder": ["Cosmos", "Forces & Energy", "Matter"],
  "miranda-patchwork-moon-cliffs": ["Cosmos", "Matter", "Forces & Energy"],
  "cosmic-hand-pulsar-wind-nebula": ["Cosmos", "Forces & Energy"],
  "comet-67p-rubber-duck-collision": ["Cosmos", "Matter", "Time & History"],
  "origami-solar-array-bloom": ["Design & Technology", "Cosmos", "Numbers & Logic"],
  "metal-foam-floats-on-water": ["Design & Technology", "Matter", "Forces & Energy"],
  "sofi-soft-robotic-fish": ["Design & Technology", "Living World", "Mind"],
  "millefiori-thousand-glass-flowers": ["Art & Expression", "Matter", "Design & Technology"],
  "martinez-black-on-black-pottery": ["Art & Expression", "Matter", "Society"],
  "reverse-glass-painting-backward": ["Art & Expression", "Matter", "Design & Technology"],
};

const files = (await fs.readdir(ROOT))
  .filter((name) => name.endsWith(".json"))
  .sort();
let changedFiles = 0;
let cardCount = 0;

for (const name of files) {
  const file = path.join(ROOT, name);
  const batch = JSON.parse(await fs.readFile(file, "utf8"));
  let changed = false;
  batch.recommendations = batch.recommendations.map((card) => {
    cardCount += 1;
    if (!force && Array.isArray(card.dimensions) && card.dimensions.length) return card;
    const dimensions = REVIEWED[card.id] ?? inferDimensions(card);
    changed = true;
    const { id, category, ...rest } = card;
    delete rest.dimensions;
    return { id, category, dimensions, ...rest };
  });
  if (!changed) continue;
  changedFiles += 1;
  if (write) await fs.writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
}

console.log(`${write ? "Curated" : "Would curate"} ${cardCount} cards across ${changedFiles} batch files.`);
if (!write && changedFiles) console.log("Run with --write to update the editorial batch files.");

function inferDimensions(card) {
  // Classify the question being asked, not every incidental noun in the teaser.
  // This keeps dimensions useful as editorial lenses rather than keyword soup.
  const text = `${card.id} ${card.question}`;
  const dimensions = [PRIMARY_DIMENSION[card.id] ?? BASE_DIMENSION[card.category]];
  for (const [dimension, ids] of Object.entries(CURATED_IDS)) {
    if (ids.has(card.id) && !dimensions.includes(dimension)) dimensions.push(dimension);
  }
  for (const [dimension, pattern] of RULES) {
    if (pattern.test(text) && !dimensions.includes(dimension)) dimensions.push(dimension);
  }
  return dimensions.slice(0, 4);
}
