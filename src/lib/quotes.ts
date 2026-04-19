import type { QuoteTone } from "./types";

export type Quote = {
  id: string;
  text: string;
  author: string;
  tone: QuoteTone;
};

export const QUOTE_TONES: { id: QuoteTone; label: string; blurb: string }[] = [
  { id: "stoic", label: "Stoic", blurb: "Calm, measured, built to last." },
  { id: "self-compassion", label: "Gentle", blurb: "Warm with yourself on hard days." },
  { id: "humor", label: "Playful", blurb: "A little wink to keep it light." },
  { id: "athletic", label: "Athletic", blurb: "Grit and quiet discipline." },
  { id: "creative", label: "Creative", blurb: "For the long, strange craft." },
];

export const QUOTES: Quote[] = [
  { id: "s1", text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius", tone: "stoic" },
  { id: "s2", text: "We suffer more often in imagination than in reality.", author: "Seneca", tone: "stoic" },
  { id: "s3", text: "Waste no more time arguing what a good person should be. Be one.", author: "Marcus Aurelius", tone: "stoic" },
  { id: "s4", text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus", tone: "stoic" },
  { id: "s5", text: "He who fears death will never do anything worthy of a living person.", author: "Seneca", tone: "stoic" },
  { id: "c1", text: "Talk to yourself like someone you love.", author: "Brené Brown", tone: "self-compassion" },
  { id: "c2", text: "You do not have to be good. You only have to let the soft animal of your body love what it loves.", author: "Mary Oliver", tone: "self-compassion" },
  { id: "c3", text: "Rest is a form of resistance.", author: "Tricia Hersey", tone: "self-compassion" },
  { id: "c4", text: "Be gentle with yourself, you are a child of the universe.", author: "Max Ehrmann", tone: "self-compassion" },
  { id: "c5", text: "You are allowed to be both a masterpiece and a work in progress.", author: "Sophia Bush", tone: "self-compassion" },
  { id: "h1", text: "The secret of getting ahead is getting started. And also snacks.", author: "Mostly Mark Twain", tone: "humor" },
  { id: "h2", text: "Discipline is remembering what you actually want when your couch is flirting with you.", author: "Anon", tone: "humor" },
  { id: "h3", text: "Showing up is 80% of life. The other 20% is coffee.", author: "Anon", tone: "humor" },
  { id: "h4", text: "You can do hard things. You can also do them badly. Both count.", author: "Anon", tone: "humor" },
  { id: "h5", text: "Do one small thing and tell nobody. That's the trick.", author: "Anon", tone: "humor" },
  { id: "a1", text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "James Clear", tone: "athletic" },
  { id: "a2", text: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong", tone: "athletic" },
  { id: "a3", text: "Every champion was once a contender who refused to give up.", author: "Rocky Balboa", tone: "athletic" },
  { id: "a4", text: "Do it again, a little better.", author: "Anon", tone: "athletic" },
  { id: "a5", text: "Small reps, every day. That's the whole secret.", author: "Anon", tone: "athletic" },
  { id: "r1", text: "Inspiration is for amateurs. The rest of us just show up and get to work.", author: "Chuck Close", tone: "creative" },
  { id: "r2", text: "The work will teach you how to do it.", author: "Estonian proverb", tone: "creative" },
  { id: "r3", text: "You can't think your way into a finished thing. You have to make it.", author: "Anon", tone: "creative" },
  { id: "r4", text: "Nulla dies sine linea. Not a day without a line.", author: "Pliny the Elder", tone: "creative" },
  { id: "r5", text: "Finish. Anything. That's the whole game.", author: "Anon", tone: "creative" },
];

export function pickQuoteForDate(date: string, tone: QuoteTone): Quote {
  const pool = QUOTES.filter((q) => q.tone === tone);
  const seed = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[seed % pool.length]!;
}

export function quoteById(id: string): Quote | undefined {
  return QUOTES.find((q) => q.id === id);
}
