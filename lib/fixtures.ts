import { PERFORMERS } from "./catalog";
import type {
  AnswerBlock,
  PerformerId,
  ResearchEvent,
  Source,
  TurnMedia,
} from "./contracts";

type FixtureSource = Omit<Source, "id" | "relation">;

type Theme = {
  key: string;
  label: string;
  keywords: string[];
  mechanism: string;
  tension: string;
  consequence: string;
  researchSummary: string;
  transition: string;
  media?: TurnMedia;
  sources: FixtureSource[];
  optionPairs: Array<[
    { question: string; angle: string },
    { question: string; angle: string },
  ]>;
};

const themes: Theme[] = [
  {
    key: "sound",
    label: "built sound",
    keywords: ["sound", "hear", "noise", "silence", "echo", "acoustic", "ocean"],
    mechanism:
      "A place does not have one voice. It behaves more like an instrument: surfaces reflect or absorb energy, volumes stretch reverberation, machinery adds a pulse, and people continuously retune the room by moving through it.",
    tension:
      "The interesting tension is that acoustic comfort and acoustic character are not identical. Removing every echo can improve intelligibility while also erasing the cues that tell a listener how large, public, intimate, or ceremonial a space feels.",
    consequence:
      "That changes the question from ‘what sound does this place make?’ to ‘which relationships between bodies, materials, and distance does the place make audible?’ Listening becomes a way of reading architecture without looking at it.",
    researchSummary:
      "Separated sound source, transmission path, surface behavior, and human perception; checked the difference between noise control and acoustic character.",
    transition:
      "Once a room is treated as an instrument, the next curiosity is whether we should tune the room—or tune the way we listen.",
    sources: [
      {
        title: "Understanding Sound",
        publisher: "U.S. National Park Service",
        url: "https://www.nps.gov/subjects/sound/understandingsound.htm",
      },
      {
        title: "Acoustic Comfort",
        publisher: "Whole Building Design Guide",
        url: "https://www.wbdg.org/resources/acoustic-comfort",
      },
      {
        title: "How does sound in air differ from sound in water?",
        publisher: "NOAA Ocean Service",
        url: "https://oceanservice.noaa.gov/facts/sound.html",
      },
    ],
    optionPairs: [
      [
        {
          question: "How do architects shape reverberation without making a room feel acoustically dead?",
          angle: "mechanism",
        },
        {
          question: "When does a building’s sound become part of a city’s memory?",
          angle: "culture",
        },
      ],
      [
        {
          question: "Could silence be designed as a public material rather than an absence?",
          angle: "provocation",
        },
        {
          question: "What can an ocean hear that a building cannot?",
          angle: "scale",
        },
      ],
      [
        {
          question: "Who gets to decide which urban sounds count as noise?",
          angle: "power",
        },
        {
          question: "Could a map preserve a sound without flattening it?",
          angle: "representation",
        },
      ],
    ],
  },
  {
    key: "maps",
    label: "maps and omission",
    keywords: ["map", "truth", "represent", "border", "route", "territory", "leave out"],
    mechanism:
      "A map is a decision system disguised as a picture. Scale, projection, symbols, categories, and the purpose of the map determine which features become legible and which disappear.",
    tension:
      "Every useful map must omit almost everything. The problem is not omission itself; it is whether the map makes its purpose and uncertainty visible enough for a reader to understand the bargain being made.",
    consequence:
      "So a map can be accurate and still mislead. Accuracy describes the relationship between selected marks and measured reality, while truthfulness also asks who selected the marks, for whom, and for what decision.",
    researchSummary:
      "Reviewed scale, projection, symbolization, and collection purpose; distinguished geometric accuracy from contextual truthfulness.",
    transition:
      "If every map is an argument about relevance, the next path can follow either its technical choices or the authority behind them.",
    sources: [
      {
        title: "Topographic Maps",
        publisher: "U.S. Geological Survey",
        url: "https://www.usgs.gov/programs/national-geospatial-program/topographic-maps",
      },
      {
        title: "Geography and Map Reading Room",
        publisher: "Library of Congress",
        url: "https://www.loc.gov/research-centers/geography-and-map-reading-room/",
      },
      {
        title: "Standards and Resources",
        publisher: "Open Geospatial Consortium",
        url: "https://www.ogc.org/standards/",
      },
    ],
    optionPairs: [
      [
        {
          question: "Which kinds of uncertainty can a map show without becoming unreadable?",
          angle: "evidence",
        },
        {
          question: "Who gains power when one map becomes the official map?",
          angle: "power",
        },
      ],
      [
        {
          question: "Could a map represent how a place feels without pretending feeling is measurable?",
          angle: "experience",
        },
        {
          question: "What disappears when a journey is reduced to its shortest route?",
          angle: "omission",
        },
      ],
      [
        {
          question: "Can a map remember the paths people chose not to take?",
          angle: "memory",
        },
        {
          question: "What would a map designed for listening look like?",
          angle: "translation",
        },
      ],
    ],
  },
  {
    key: "memory",
    label: "collective memory",
    keywords: ["memory", "remember", "forget", "archive", "history", "city", "ritual"],
    mechanism:
      "Collective memory is not stored in one civic container. It is rehearsed across street names, buildings, archives, ceremonies, family stories, demolition fights, and the routes people repeat until they feel inevitable.",
    tension:
      "Preservation can protect evidence, but it can also freeze one authorized version of the past. Living memory is less orderly: it changes when new witnesses speak, when a site is reused, or when a community refuses the name attached to it.",
    consequence:
      "A city therefore remembers through both endurance and revision. The most revealing sites are often not pristine monuments but places where competing memories remain visible at the same time.",
    researchSummary:
      "Compared institutional archives, public monuments, repeated routes, and contested names as different mechanisms of collective remembering.",
    transition:
      "Memory becomes especially interesting where the archive and the lived street disagree about what deserves to remain.",
    media: {
      imageUrl: "https://tile.loc.gov/image-services/iiif/service:gmd:gmd410:g4104:g4104c:ct002834/full/pct:25/0/default.jpg",
      sourcePageUrl: "https://www.loc.gov/item/2010587004/",
      caption: "Souvenir map of Jackson Park and Midway Plaisance, Chicago, 1892. Library of Congress.",
      alt: "Historic illustrated map of Jackson Park and the Midway Plaisance prepared for the World's Columbian Exposition.",
    },
    sources: [
      {
        title: "Research Our Records",
        publisher: "U.S. National Archives",
        url: "https://www.archives.gov/research",
      },
      {
        title: "Historic American Buildings Survey",
        publisher: "Library of Congress",
        url: "https://www.loc.gov/pictures/collection/hh/",
      },
      {
        title: "Teaching with Historic Places",
        publisher: "U.S. National Park Service",
        url: "https://www.nps.gov/subjects/teachingwithhistoricplaces/index.htm",
      },
    ],
    optionPairs: [
      [
        {
          question: "How does a repeated route turn into a shared memory?",
          angle: "behavior",
        },
        {
          question: "What should a city do when a monument and its community tell different stories?",
          angle: "conflict",
        },
      ],
      [
        {
          question: "Can demolition make a place more present in memory rather than less?",
          angle: "paradox",
        },
        {
          question: "What sounds survive after the place that made them is gone?",
          angle: "trace",
        },
      ],
      [
        {
          question: "Who is responsible for the absences in an archive?",
          angle: "power",
        },
        {
          question: "Could an unfinished map be a more honest memorial?",
          angle: "representation",
        },
      ],
    ],
  },
  {
    key: "systems",
    label: "systems and inevitability",
    keywords: ["system", "inevitable", "infrastructure", "network", "feedback", "idea", "technology"],
    mechanism:
      "Ideas feel inevitable when their alternatives become hard to see. Standards accumulate, infrastructure rewards compatible behavior, institutions train around one method, and each new dependency makes reversal more expensive.",
    tension:
      "This does not mean outcomes were predetermined. It means path dependence can transform a contingent choice into the background condition for every later choice.",
    consequence:
      "The practical way to study inevitability is to look for the earlier fork: the moment when several futures were still plausible, and the feedback loops that made one of them easier to repeat.",
    researchSummary:
      "Traced standards, installed infrastructure, training, and feedback loops as mechanisms that make contingent choices feel natural later.",
    transition:
      "Once inevitability is reframed as accumulated reinforcement, curiosity can move toward the forgotten fork or the machinery that closed it.",
    sources: [
      {
        title: "Standards Coordination Office",
        publisher: "National Institute of Standards and Technology",
        url: "https://www.nist.gov/standardsgov",
      },
      {
        title: "Technology and Innovation",
        publisher: "Smithsonian Institution",
        url: "https://www.si.edu/spotlight/technology-and-invention",
      },
      {
        title: "Digital Collections",
        publisher: "Library of Congress",
        url: "https://www.loc.gov/collections/",
      },
    ],
    optionPairs: [
      [
        {
          question: "How can we recognize a path-dependent system before alternatives disappear?",
          angle: "mechanism",
        },
        {
          question: "Which forgotten alternative would make the present look least inevitable?",
          angle: "counterfactual",
        },
      ],
      [
        {
          question: "When does convenience become a form of infrastructure?",
          angle: "behavior",
        },
        {
          question: "Can a standard preserve freedom instead of narrowing it?",
          angle: "design",
        },
      ],
      [
        {
          question: "What would it take to make an established system curious about its own assumptions?",
          angle: "provocation",
        },
        {
          question: "How would we map the people who pay for everyone else’s convenience?",
          angle: "power",
        },
      ],
    ],
  },
  {
    key: "light",
    label: "light and perception",
    keywords: ["light", "color", "see", "vision", "shadow", "visible", "night"],
    mechanism:
      "Visible light is a narrow portion of a much larger electromagnetic spectrum, and perception is an active interpretation of that limited signal rather than a camera-like copy of the world.",
    tension:
      "Design can use light to reveal form, but every act of illumination also hides something: glare reduces detail, bright foregrounds erase dim backgrounds, and uniform lighting can flatten the rhythms that signal time.",
    consequence:
      "Seeing more is therefore not the same as understanding more. The productive question is which contrast, duration, and adaptation a visual system needs in order to notice a meaningful difference.",
    researchSummary:
      "Connected the physical range of visible light with adaptation, contrast, glare, and the design trade-off between illumination and legibility.",
    transition:
      "Light becomes a guide not when it reveals everything, but when it preserves the differences worth noticing.",
    sources: [
      {
        title: "Visible Light",
        publisher: "NASA Science",
        url: "https://science.nasa.gov/ems/09_visiblelight/",
      },
      {
        title: "Light and the Electromagnetic Spectrum",
        publisher: "National Weather Service",
        url: "https://www.weather.gov/jetstream/color",
      },
      {
        title: "Night Skies",
        publisher: "U.S. National Park Service",
        url: "https://www.nps.gov/subjects/nightskies/index.htm",
      },
    ],
    optionPairs: [
      [
        {
          question: "Why can adding more light make a place harder to see?",
          angle: "mechanism",
        },
        {
          question: "How does artificial light change a city’s sense of time?",
          angle: "culture",
        },
      ],
      [
        {
          question: "Could a shadow be treated as useful information rather than missing light?",
          angle: "provocation",
        },
        {
          question: "What can night reveal that daylight systematically hides?",
          angle: "contrast",
        },
      ],
      [
        {
          question: "Who gets to define what counts as a well-lit public space?",
          angle: "power",
        },
        {
          question: "Can a map show how long it takes an eye to adapt?",
          angle: "translation",
        },
      ],
    ],
  },
];

const fallbackTheme: Theme = {
  key: "questions",
  label: "the shape of a question",
  keywords: [],
  mechanism:
    "A strong question is not only a request for information. It selects a boundary, assumes a scale, and quietly proposes what kind of evidence would count as an answer.",
  tension:
    "Questions become more generative when they are specific enough to investigate but open enough to let evidence change the frame. Too broad and nothing can be tested; too narrow and the answer cannot surprise the questioner.",
  consequence:
    "The useful move is to inspect the question’s hidden nouns and verbs: what is being treated as stable, who is allowed to act, and which timescale has disappeared from view.",
  researchSummary:
    "Examined the question’s boundary, scale, implied actors, and evidence standard; identified where a reframing could create a more investigable path.",
  transition:
    "The question now has enough shape to choose between investigating its mechanism and challenging the boundary it started with.",
  sources: [
    {
      title: "Library of Congress Subject Headings",
      publisher: "Library of Congress",
      url: "https://www.loc.gov/aba/publications/FreeLCSH/freelcsh.html",
    },
    {
      title: "Research Guides",
      publisher: "Library of Congress",
      url: "https://guides.loc.gov/",
    },
    {
      title: "Smithsonian Learning Lab",
      publisher: "Smithsonian Institution",
      url: "https://learninglab.si.edu/",
    },
  ],
  optionPairs: [
    [
      {
        question: "What hidden assumption is doing the most work inside this question?",
        angle: "mechanism",
      },
      {
        question: "How would the question change if we moved it to a much longer timescale?",
        angle: "scale",
      },
    ],
    [
      {
        question: "Whose experience would make the current framing feel incomplete?",
        angle: "perspective",
      },
      {
        question: "What evidence could genuinely force us to ask a different question?",
        angle: "evidence",
      },
    ],
    [
      {
        question: "Could the apparent answer actually be a symptom of a larger system?",
        angle: "systems",
      },
      {
        question: "What would this question sound like if a place—not a person—were asking it?",
        angle: "provocation",
      },
    ],
  ],
};

export type FixtureTurnDraft = {
  fixtureKey: string;
  topicLabel: string;
  answer: string;
  answerBlocks: AnswerBlock[];
  media: TurnMedia[];
  transition: string;
  researchSummary: string;
  researchHandoff: {
    discoveries: string[];
    uncertainties: string[];
    unresolvedThreads: string[];
    sourceLeads: string[];
  };
  preferredPosition: 0 | 1;
  options: Array<{ question: string; angle: string }>;
  sources: FixtureSource[];
  researchEvents: Omit<ResearchEvent, "id" | "sourceId">[];
};

export function buildFixtureTurn(input: {
  question: string;
  depth: number;
  performerId: PerformerId;
  rejectionCount?: number;
  adventure?: number;
}): FixtureTurnDraft {
  const theme = classifyTheme(input.question);
  const performer = PERFORMERS.find((candidate) => candidate.id === input.performerId)!;
  const pairIndex = optionPairIndex({
    question: input.question,
    depth: input.depth,
    rejectionCount: input.rejectionCount ?? 0,
    adventure: input.adventure ?? 50,
    pairCount: theme.optionPairs.length,
  });
  const selectedPair = theme.optionPairs[pairIndex];
  const sourceKeys = theme.sources.map((source) => stableKey(source.url));
  const opening = `${performer.name} begins by changing the scale of “${normalizeQuestion(input.question)}”. ${theme.mechanism}`;
  const blocks: AnswerBlock[] = [
    { text: opening, sourceIds: [sourceKeys[0]] },
    { text: theme.tension, sourceIds: [sourceKeys[0], sourceKeys[1]] },
    { text: theme.consequence, sourceIds: [sourceKeys[1], sourceKeys[2]] },
  ];

  return {
    fixtureKey: `${theme.key}:${pairIndex}:v1`,
    topicLabel: theme.label,
    answer: blocks.map((block) => block.text).join("\n\n"),
    answerBlocks: blocks,
    media: theme.media ? [theme.media] : [],
    transition: theme.transition,
    researchSummary: theme.researchSummary,
    researchHandoff: {
      discoveries: [theme.mechanism, theme.consequence],
      uncertainties: [theme.tension],
      unresolvedThreads: selectedPair.map((option) => option.question),
      sourceLeads: theme.sources.map((source) => source.url),
    },
    preferredPosition: stableHash(`${input.question}:${input.depth}:${performer.id}`) % 2 as 0 | 1,
    options: selectedPair.map((option) => ({ ...option })),
    sources: theme.sources,
    researchEvents: [
      {
        sequence: 0,
        kind: "search",
        label: `Framed a fixture search around ${theme.label}`,
      },
      {
        sequence: 1,
        kind: "source",
        label: `Opened ${theme.sources[0].publisher}: ${theme.sources[0].title}`,
      },
      {
        sequence: 2,
        kind: "source",
        label: `Cross-checked ${theme.sources[1].publisher}`,
      },
      {
        sequence: 3,
        kind: "check",
        label: "Separated supported observations from the performance framing",
      },
      {
        sequence: 4,
        kind: "synthesis",
        label: "Composed the answer and validated exactly two distinct paths",
      },
    ],
  };
}

export function stableKey(value: string): string {
  return `src_${stableHash(value).toString(36)}`;
}

function classifyTheme(question: string): Theme {
  const normalized = question.toLowerCase();
  let bestTheme = fallbackTheme;
  let bestScore = 0;
  for (const theme of themes) {
    const score = theme.keywords.reduce(
      (total, keyword) => total + (normalized.includes(keyword) ? keyword.length : 0),
      0,
    );
    if (score > bestScore) {
      bestTheme = theme;
      bestScore = score;
    }
  }
  return bestTheme;
}

function optionPairIndex(input: {
  question: string;
  depth: number;
  rejectionCount: number;
  adventure: number;
  pairCount: number;
}): number {
  const base = stableHash(`${input.question}:${input.depth}`) % input.pairCount;
  if (input.rejectionCount > 0) {
    const step = input.adventure >= 66 ? 2 : 1;
    const replacement = (base + input.rejectionCount * step) % input.pairCount;
    return replacement === base && input.pairCount > 1
      ? (base + 1) % input.pairCount
      : replacement;
  }
  return base;
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").replace(/[?!.]+$/, "");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
