/**
 * The NFT pieces shown to agents (free, at /api/agent/nfts). Only pieces the owner has said were made with ChatGPT (OpenAI
 * image tools). Pieces on hold (the shark ones, the overlays, Four Skylines) are deliberately not here: see the owner's
 * draft folder. Sold on Rarible, never through this server, which holds no wallet.
 */
export interface NftPiece { slug: string; title: string; description: string; attributes: { trait_type: string; value: string }[]; file: string }

export const NFT_COLLECTION = {
  name: "Cryptic Future",
  soldAt: process.env.NFT_URL?.trim() || "https://rarible.com/thesmurfetfuturenft",
  note: "Art, not an investment: nothing here suggests a piece will keep or gain value, and Safehubby gives no financial advice. Every piece is made with AI. Pictures made this way usually cannot be protected by copyright, so a buyer gets the file and the story, not the exclusive right to the image. Sold on Rarible, not through this site. Questions: contact@safehubby.com.",
};

export const NFT_PIECES: NftPiece[] = [
  {
    "slug": "green-dolphin-city",
    "title": "Green Dolphin City",
    "description": "A lime-green dolphin leaps in front of a crowded, colour-soaked fantasy city of mismatched towers, with a sunbeam cutting across the sky. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Dolphin"
      },
      {
        "trait_type": "Setting",
        "value": "Fantasy city"
      },
      {
        "trait_type": "Palette",
        "value": "Lime green, magenta, blue"
      },
      {
        "trait_type": "Mood",
        "value": "Playful"
      }
    ],
    "file": "green-dolphin-city.jpg"
  },
  {
    "slug": "bitcoin-shark",
    "title": "Bitcoin Shark",
    "description": "A silver robot shark with glowing red eyes holds a Bitcoin coin between its open jaws, set against a swirling galaxy. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Robot shark"
      },
      {
        "trait_type": "Setting",
        "value": "Deep space"
      },
      {
        "trait_type": "Palette",
        "value": "Silver, navy, copper"
      },
      {
        "trait_type": "Mood",
        "value": "Bold"
      }
    ],
    "file": "bitcoin-shark.jpg"
  },
  {
    "slug": "meet-the-robos",
    "title": "Meet the Robos",
    "description": "A small family of robots stands in a green glow beneath a taller robot that hovers above them. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Robots"
      },
      {
        "trait_type": "Setting",
        "value": "Glowing clearing"
      },
      {
        "trait_type": "Palette",
        "value": "Green, teal, red"
      },
      {
        "trait_type": "Mood",
        "value": "Warm"
      }
    ],
    "file": "meet-the-robos.jpg"
  },
  {
    "slug": "the-brass-turtle",
    "title": "The Brass Turtle",
    "description": "A bronze-shelled sea turtle swims in the foreground while an old lighthouse town and tall ships rise from a stormy green sea behind it. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Sea turtle"
      },
      {
        "trait_type": "Setting",
        "value": "Flooded harbour"
      },
      {
        "trait_type": "Palette",
        "value": "Bronze, teal, black"
      },
      {
        "trait_type": "Mood",
        "value": "Moody"
      }
    ],
    "file": "the-brass-turtle.jpg"
  },
  {
    "slug": "overgrown-towers",
    "title": "Overgrown Towers",
    "description": "Sunlit towers swallowed by jungle plants, with a striped animal walking through the undergrowth in the foreground. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Striped animal"
      },
      {
        "trait_type": "Setting",
        "value": "Overgrown city"
      },
      {
        "trait_type": "Palette",
        "value": "Green, gold, black"
      },
      {
        "trait_type": "Mood",
        "value": "Calm"
      }
    ],
    "file": "overgrown-towers.jpg"
  },
  {
    "slug": "waterfront-spires",
    "title": "Waterfront Spires",
    "description": "Red and pink spires rise over a calm lake where animals wade and small craft drift, under a soft turquoise sky. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Spires and animals"
      },
      {
        "trait_type": "Setting",
        "value": "Lakeside city"
      },
      {
        "trait_type": "Palette",
        "value": "Coral, turquoise"
      },
      {
        "trait_type": "Mood",
        "value": "Dreamy"
      }
    ],
    "file": "waterfront-spires.jpg"
  },
  {
    "slug": "sky-garden-towers",
    "title": "Sky Garden Towers",
    "description": "Glass towers with gardens on their roofs stand together in bright light, with a winged creature flying overhead. Made with AI (OpenAI image tools), then edited by the artist.",
    "attributes": [
      {
        "trait_type": "Subject",
        "value": "Towers"
      },
      {
        "trait_type": "Setting",
        "value": "Sky city"
      },
      {
        "trait_type": "Palette",
        "value": "Glass, sage, sky blue"
      },
      {
        "trait_type": "Mood",
        "value": "Hopeful"
      }
    ],
    "file": "sky-garden-towers.jpg"
  }
];
