import type { ScriptRequest } from "./request.ts";
import type { Beat, KidsScript, ScriptLine } from "./script.ts";

/**
 * The offline generator: a search-and-find episode built on the method's
 * beat sheet. It needs no API key and always passes `reviewScript`, so it is
 * a reliable first draft — Claude mode is where the writing gets original.
 */
interface TopicPack {
  match: RegExp;
  /** What the character lost, e.g. "ball". */
  goal: string;
  /** What they find on the way, one per loop. */
  items: string[];
  /** The goal as finally found, carrying the topic, e.g. "yellow ball". */
  finale: string;
  /** Asked about every item so each loop teaches the topic. */
  question: string;
  lesson: string;
}

const PACKS: TopicPack[] = [
  {
    match: /colou?r/i,
    goal: "ball",
    items: ["red sock", "blue hat", "green frog"],
    finale: "yellow ball",
    question: "What color is it?",
    lesson: "Red, blue, green and yellow!",
  },
  {
    match: /count|number/i,
    goal: "star",
    items: ["one apple", "two ducks", "three drums"],
    finale: "four stars",
    question: "How many can YOU count?",
    lesson: "One, two, three, four!",
  },
  {
    match: /animal|farm|sound/i,
    goal: "friend",
    items: ["moo cow", "quack duck", "oink pig"],
    finale: "baa lamb",
    question: "What sound does it make?",
    lesson: "Every animal has its own sound!",
  },
  {
    match: /shape/i,
    goal: "star",
    items: ["round circle", "square box", "triangle hat"],
    finale: "shiny star",
    question: "What shape is it?",
    lesson: "Circle, square, triangle, star!",
  },
  {
    match: /bed|sleep|night/i,
    goal: "teddy",
    items: ["soft pajamas", "little toothbrush", "story book"],
    finale: "sleepy teddy",
    question: "Do we need it for bed?",
    lesson: "Pajamas, brush, story, and sleep!",
  },
  {
    match: /teeth|brush|tooth/i,
    goal: "toothbrush",
    items: ["bath duck", "hair comb", "wash cloth"],
    finale: "blue toothbrush",
    question: "Do we brush teeth with it?",
    lesson: "Brush, brush, brush, two minutes a day!",
  },
];

const PLACES = ["under the bed", "in the toy box", "behind the tree", "in the bath", "under the table", "in the garden"];

function fallbackPack(topic: string): TopicPack {
  return {
    match: /$^/,
    goal: "surprise",
    items: ["big drum", "red balloon", "bouncy ball"],
    finale: `${topic} surprise`,
    question: "What is it?",
    lesson: `We learned about ${topic}!`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleCase(text: string): string {
  return text.split(/\s+/).map(capitalize).join(" ");
}

function line(speaker: string, text: string, extra: Partial<Pick<ScriptLine, "pause" | "cue">> = {}): ScriptLine {
  return { speaker, text, pause: extra.pause ?? false, cue: extra.cue ?? "" };
}

export function pickPack(topic: string): TopicPack {
  return PACKS.find((pack) => pack.match.test(topic)) ?? fallbackPack(topic.trim());
}

export function buildTemplateScript(req: ScriptRequest): KidsScript {
  const pack = pickPack(req.topic);
  const items = req.items?.length ? req.items.map((i) => i.trim()) : pack.items;
  const character = req.character.trim();
  // "Pip the Puppy" speaks as "PIP" — a short name is what toddlers repeat.
  const speaker = (character.split(/\s+/)[0] ?? character).toUpperCase();
  const narrator = "NARRATOR";
  const goal = pack.goal;
  const catchphrase = `That's not my ${goal}!`;
  const total = req.minutes * 60;
  const at = (fraction: number) => Math.round(total * fraction);

  const beats: Beat[] = [
    {
      at: 0,
      label: "Hook",
      lines: [line(speaker, `Oh no! My ${goal} is gone!`, { cue: "sad trombone" })],
    },
    {
      at: Math.max(at(0.03), 5),
      label: "Setup",
      lines: [
        line(narrator, `Let's help ${capitalize(speaker.toLowerCase())}! Are you ready?`, { pause: true }),
        line(speaker, `Where is my ${goal}?`),
      ],
    },
  ];

  // Loops share the span between setup and the twist so any length stays evenly paced.
  const loopStart = 0.1;
  const loopEnd = 0.58;
  items.forEach((item, i) => {
    const place = PLACES[i % PLACES.length]!;
    beats.push({
      at: at(loopStart + ((loopEnd - loopStart) * i) / items.length),
      label: `Loop ${i + 1}`,
      lines: [
        line(narrator, `Is it ${place}? Let's look!`, { cue: "whoosh" }),
        line(narrator, "Can YOU see it?", { pause: true, cue: `${item} pops out` }),
        line(narrator, pack.question, { pause: true }),
        line(speaker, `${capitalize(item)}, ${item}! ${catchphrase}`, { cue: "boing!" }),
      ],
    });
  });

  beats.push(
    {
      at: at(0.6),
      label: "Twist",
      lines: [
        line(speaker, "Wait! What is that noise?", { cue: "rustle rustle" }),
        line(narrator, `Is it the ${goal}?`, { pause: true }),
        line(speaker, "No! It's a silly kitty!", { cue: "meow! kitty giggles" }),
      ],
    },
    {
      at: at(0.74),
      label: "Solution",
      lines: [
        line(narrator, "Look up high! Can YOU find it?", { pause: true }),
        line(speaker, `My ${pack.finale}! You found it!`, { cue: "sparkle" }),
        line(speaker, "Thank you, friend!"),
      ],
    },
    {
      at: at(0.86),
      label: "Sing-along",
      lines: [
        line("ALL", `${items.map(capitalize).join(", ")}...`, { cue: "music starts" }),
        line("ALL", "We looked and looked for you!"),
        line("ALL", pack.lesson),
        line("ALL", `Hooray, my ${goal} is here!`),
      ],
    },
    {
      at: at(0.97),
      label: "Ending",
      lines: [line(speaker, "Bye bye, friends! See you next time!", { cue: "wave" })],
    },
  );

  const finale = titleCase(pack.finale);
  const topic = titleCase(req.topic.trim());
  return {
    title: `${character} Finds the ${finale}! | Learn ${topic} for Kids`,
    titleIdeas: [
      `Where Is ${character}'s ${titleCase(goal)}? | ${topic} for Toddlers`,
      `${character} Learns ${topic}! | Sing-Along for Kids`,
      `Can YOU Help ${character}? | Learn ${topic} with Songs`,
    ],
    thumbnailIdeas: [
      `${character} with a big surprised face, the ${pack.finale} glowing behind them`,
      `Split image: ${items[0] ?? "a toy"} vs the ${pack.finale}, big "?" in the middle`,
      `${character} peeking out of a toy box, bright background, 2-3 words max`,
    ],
    catchphrase,
    beats,
  };
}
