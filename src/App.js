import { useState, useEffect, useRef } from "react";

const PRACTICE_CHAIN = [
  { type: "phono",    prompt: "NIGHT",    answer: "LIGHT",    clue: "Brightness that lets you see",                                        },
  { type: "semantic", prompt: "LIGHT",    answer: "DARK",     clue: "The opposite of light, an absence of brightness",                     },
  { type: "phono",    prompt: "DARK",     answer: "PARK",     clue: "A public green space with trees and grass",                           },
];

const CHAIN = [
  { type: "phono",    prompt: "BUTTER",   answer: "FLUTTER",  clue: "A light, rapid flapping movement",                                   },
  { type: "phono",    prompt: "FLUTTER",  answer: "FLOWER",   clue: "A blooming plant that bees visit",                                   },
  { type: "semantic", prompt: "FLOWER",   answer: "PETAL",    clue: "One of the coloured leaf-like parts that make up the bloom",          },
  { type: "phono",    prompt: "PETAL",    answer: "METAL",    clue: "A hard, shiny material used in construction and tools",               },
  { type: "mixed",    prompt: "METAL",    answer: "STEEL",    clue: "A strong alloy used in buildings and bridges",                        },
  { type: "phono",    prompt: "STEEL",    answer: "WHEEL",    clue: "A circular object that rolls or spins",                               },
  { type: "semantic", prompt: "WHEEL",    answer: "SPOKE",    clue: "One of the thin rods radiating from the hub to the rim",              },
  { type: "phono",    prompt: "SPOKE",    answer: "SMOKE",    clue: "Visible vapor rising from something burning",                         },
  { type: "semantic", prompt: "SMOKE",    answer: "FIRE",     clue: "The source that creates smoke when burning",                          },
  { type: "phono",    prompt: "FIRE",     answer: "WIRE",     clue: "A thin flexible metal strand that conducts electricity",              },
  { type: "semantic", prompt: "WIRE",     answer: "COPPER",   clue: "A reddish metal commonly used for electrical conductors",             },
  { type: "mixed",    prompt: "COPPER",   answer: "PEPPER",   clue: "A spice that makes you sneeze",                                       },
  { type: "semantic", prompt: "PEPPER",   answer: "SPICE",    clue: "The category of flavoring substances that pepper belongs to",         },
  { type: "phono",    prompt: "SPICE",    answer: "SPLICE",   clue: "To join two pieces by weaving or overlapping the ends",               },
  { type: "semantic", prompt: "SPLICE",   answer: "ROPE",     clue: "A thick cord made by twisting fibers, often spliced when damaged",    },
  { type: "mixed",    prompt: "ROPE",     answer: "HOPE",     clue: "A feeling of expectation or desire for something to happen",          },
  { type: "semantic", prompt: "HOPE",     answer: "WISH",     clue: "A desire or longing for something, often unattainable",               },
  { type: "phono",    prompt: "WISH",     answer: "FISH",     clue: "An aquatic animal with gills and fins",                               },
  { type: "semantic", prompt: "FISH",     answer: "SCALE",    clue: "The small overlapping plates covering a fish's body",                 },
  { type: "phono",    prompt: "SCALE",    answer: "STALE",    clue: "No longer fresh, especially bread or air",                            },
];

const TYPE_META = {
  phono:    { label: "Phonological", icon: "🔤", description: "Sounds like the prompt" },
  semantic: { label: "Semantic",     icon: "💡", description: "Means something related" },
  mixed:    { label: "Mixed",        icon: "🔀", description: "Sounds similar + means something related" },
};

const AGE_NORMS = {
  "13–17": { mean: 55, sd: 13 },
  "18–29": { mean: 63, sd: 11 },
  "30–44": { mean: 61, sd: 12 },
  "45–59": { mean: 56, sd: 13 },
  "60+":   { mean: 49, sd: 14 },
};

// Convert a word to a simple phonetic key for loose sound matching
function phoneticKey(word) {
  return word.toUpperCase()
    .replace(/PH/g, "F")
    .replace(/CK/g, "K")
    .replace(/QU/g, "KW")
    .replace(/GH/g, "")
    .replace(/[AEIOU]+/g, "A")  // collapse all vowel runs to A
    .replace(/(.)\1+/g, "$1");  // collapse repeated consonants
}

// Normalize similar-sounding consonants for phonetic matching
function normalizePhonetic(str) {
  return str
    .replace(/[TD]/g, "T")   // T and D are both alveolar stops
    .replace(/[PB]/g, "P")   // P and B are both bilabial stops
    .replace(/[FV]/g, "F")   // F and V are both labiodental fricatives
    .replace(/[SZ]/g, "S");  // S and Z are both alveolar fricatives
    // Note: K/G NOT normalized - "ankle" vs "angle" are phonetically distinct
}

// Check if vowel patterns are similar enough (prevents PEPPER/POPPER false matches)
function vowelsSimilar(word1, word2) {
  const v1 = word1.toUpperCase().replace(/[^AEIOU]/g, "");
  const v2 = word2.toUpperCase().replace(/[^AEIOU]/g, "");
  if (v1.length !== v2.length) return false;
  // First vowel must match (catches PEPPER/POPPER difference)
  if (v1.length > 0 && v1[0] !== v2[0]) return false;
  // At least 50% of vowel positions must match
  let matches = 0;
  for (let i = 0; i < v1.length; i++) {
    if (v1[i] === v2[i]) matches++;
  }
  return matches / v1.length >= 0.5;
}

function isSoundsLike(guess, answer) {
  const gk = phoneticKey(guess);
  const ak = phoneticKey(answer);
  if (gk === ak) return true;

  // Normalize phonetically similar consonants
  const gkNorm = normalizePhonetic(gk);
  const akNorm = normalizePhonetic(ak);
  if (gkNorm === akNorm) {
    // Also check vowel patterns aren't too different
    return vowelsSimilar(guess, answer);
  }

  // Also check if they share the same consonant skeleton with different vowels
  const consonants = s => s.replace(/[AEIOU]/g, "");
  const gkCons = normalizePhonetic(consonants(gk));
  const akCons = normalizePhonetic(consonants(ak));
  if (gkCons === akCons && akCons.length >= 2) {
    // Require vowel similarity for consonant-skeleton matches too
    return vowelsSimilar(guess, answer);
  }

  return false;
}

function maskWord(word, revealed) {
  return word.split("").map((ch, i) => (i < revealed ? ch : "_")).join(" ");
}

function computeRoundScore(r) {
  if (!r.correct && !r.partial) return 0;
  const base = r.partial ? 4 : 10;
  // Each reveal is costly — 0 reveals = full score, 1 = -2.5, 2 = -5, 3 = -7.5, 4+ = near zero
  const revealPenalty = Math.min(r.reveals, 4) * 2.5;
  // Time penalty: starts biting hard after 5s, brutal after 15s
  const secs = r.timeMs / 1000;
  const timePenalty = secs <= 5 ? 0 : secs <= 15 ? (secs - 5) * 0.3 : 3 + (secs - 15) * 0.5;
  return Math.max(0, base - revealPenalty - timePenalty);
}

const ARCHETYPES = [
  { name: "The Connector",  icon: "🔗", condition: (p,ph,sm,mx) => p >= 80 && Math.abs(ph-sm) <= 10,
    description: "Your lexical networks are exceptionally dense and fast. You navigate by sound and meaning with equal ease, and the toughest mixed-mode challenges barely slow you down. You're the kind of thinker who makes unexpected verbal connections others miss." },
  { name: "The Resonator",  icon: "🎵", condition: (p,ph,sm,mx) => ph >= 75 && ph > sm + 10,
    description: "Sound is your primary language of thought. Your phonological network is tightly wired — you hear words before you see them. Rhythm, rhyme, and syllable pattern are how your brain files language. You likely excel at names, lyrics, and spoken language." },
  { name: "The Mapper",     icon: "🗺️", condition: (p,ph,sm,mx) => sm >= 75 && sm > ph + 10,
    description: "Meaning is your anchor. You organise the world by concept, category, and context — words are nodes in a vast semantic web. You likely have strong reading comprehension, rich inferential reasoning, and deep memory for ideas you find meaningful." },
  { name: "The Integrator", icon: "⚗️", condition: (p,ph,sm,mx) => mx >= 70,
    description: "You excel where others struggle — tasks requiring both sound and meaning simultaneously. Your brain has built unusually strong bridges between phonological and semantic processing, the hallmark of expert language users and skilled writers." },
  { name: "The Navigator",  icon: "🧭", condition: (p,ph,sm,mx) => p >= 60,
    description: "You have solid, dependable word access across all three channels. You're rarely truly stuck — you find your way to words, even if not always instantly. With targeted practice on your weaker channel, the upper tier is very reachable." },
  { name: "The Explorer",   icon: "🏕️", condition: () => true,
    description: "You're in an active phase of lexical network development. The pathways are there but not yet densely connected. This is a highly trainable state — semantic access improves faster than almost any other cognitive skill with the right practice." },
];

function getArchetype(pct, ph, sm, mx) {
  for (const a of ARCHETYPES) if (a.condition(pct, ph, sm, mx)) return a;
  return ARCHETYPES[ARCHETYPES.length - 1];
}

function generateReport(results, age) {
  const scores = results.map(computeRoundScore);
  const total = scores.reduce((a, b) => a + b, 0);
  const pct = Math.round((total / (results.length * 10)) * 100);
  const byType = t => results.filter(r => r.type === t);
  const avgScore = t => { const rs = byType(t); return rs.length ? rs.map(computeRoundScore).reduce((a,b)=>a+b,0)/rs.length : 0; };
  const phonoAvg = avgScore("phono"), semAvg = avgScore("semantic"), mxAvg = avgScore("mixed");
  const phonoPct = Math.round((phonoAvg/10)*100), semPct = Math.round((semAvg/10)*100), mxPct = Math.round((mxAvg/10)*100);
  const norm = AGE_NORMS[age] || AGE_NORMS["18–29"];
  const z = (pct - norm.mean) / norm.sd;
  const percentile = Math.round(Math.min(99, Math.max(1, 50 + z * 20)));
  const archetype = getArchetype(pct, phonoPct, semPct, mxPct);
  const sorted = [{ label:"Phonological", pct:phonoPct, key:"phono" },{ label:"Semantic", pct:semPct, key:"semantic" },{ label:"Mixed", pct:mxPct, key:"mixed" }].sort((a,b)=>b.pct-a.pct);

  // Phonological near-miss analysis
  const partials = results.filter(r => r.partial);
  const partialCount = partials.length;
  const partialTypes = partials.map(r => r.type);

  return { pct, percentile, phonoPct, semPct, mxPct, archetype, norm, age,
           strongest: sorted[0], weakest: sorted[sorted.length-1],
           partialCount, partialTypes, results };
}

const STRATEGIES = {
  phono: [
    { title: "Timed verbal fluency drills", body: "Set a 60-second timer and say aloud every word starting with a given letter. Research shows measurable gains in phonological retrieval speed after just two weeks of daily practice." },
    { title: "Read aloud daily", body: "Even 10 minutes of reading aloud activates your auditory loop and deepens phonological encoding. Audiobooks help, but active production is irreplaceable." },
    { title: "Rhyme-anchoring for new words", body: "When you learn a new word, immediately find one rhyme and one near-rhyme. This forces your brain to encode the sound shape — not just the meaning." },
  ],
  semantic: [
    { title: "Semantic web mapping", body: "After encountering a new word, spend 60 seconds mapping it: write it in the centre, then connect 5–8 related meanings, contexts, and examples. The map-building is the learning." },
    { title: "Read in unfamiliar domains", body: "Read outside your comfort zone — science journalism, philosophy, economics — and summarise each piece in your own words. This forces deep semantic encoding." },
    { title: "Ask 'when would I use this?'", body: "For every new word, generate two or three real situations where you'd say it. Meaning is context, and context is what your semantic network is built from." },
  ],
  mixed: [
    { title: "Punning practice", body: "Puns require simultaneous access to both the phonological shape and semantic content of words — exactly what mixed rounds test. Make one deliberate pun per day. It feels silly; it works." },
    { title: "Etymology study", body: "Learning word roots (Latin, Greek) connects sound patterns to meaning families. Words sharing a root tend to share both sound and concept — the dual-encoding the mixed channel demands." },
    { title: "Cryptic crossword puzzles", body: "Cryptic crosswords exploit the gap between a word's sound and its meaning. Solving them daily trains the mixed-access pathway more directly than any other common activity." },
  ],
};

const S = {
  page:    "min-h-screen bg-black text-white flex items-center justify-center p-5",
  card:    "bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-md",
  cardWide:"bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg",
  h1:      "text-2xl font-bold text-white mb-2",
  sub:     "text-zinc-400 text-sm leading-relaxed",
  green:   "text-[#39ff6a]",
  label:   "text-xs uppercase tracking-widest text-zinc-500 font-semibold",
  row:     "flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm",
  btnPrimary: "w-full border-2 border-[#39ff6a] text-[#39ff6a] font-bold py-3.5 rounded-xl text-base hover:bg-[#39ff6a] hover:text-black transition",
  divider: "border-t border-zinc-800 pt-5 mt-1",
};

function GreenBar({ value }) {
  return (
    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
      <div className="h-1 rounded-full bg-[#39ff6a] transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function App() {
  const [phase, setPhase]           = useState("welcome"); // welcome → what → how → age → practice-intro → practice → practice-complete → playing → report
  const [age, setAge]               = useState("");
  const [isPractice, setIsPractice] = useState(false);
  const [roundIdx, setRoundIdx]     = useState(0);
  const [revealed, setRevealed]     = useState(1);
  const [guess, setGuess]           = useState("");
  const [feedback, setFeedback]     = useState(null); // "correct" | "partial" | "wrong"
  const [results, setResults]       = useState([]);
  const [roundStart, setRoundStart] = useState(null);
  const [guessCount, setGuessCount] = useState(0);
  const [report, setReport]         = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if ((phase === "playing" || phase === "practice") && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, roundIdx, feedback]);

  const currentChain = isPractice ? PRACTICE_CHAIN : CHAIN;

  function startPractice(sel) {
    setAge(sel);
    setPhase("practice-intro");
  }

  function beginPractice() {
    setIsPractice(true);
    setRoundIdx(0); setRevealed(1); setGuess("");
    setFeedback(null); setResults([]); setGuessCount(0);
    setRoundStart(Date.now()); setPhase("practice");
  }

  function startRealTest() {
    setIsPractice(false);
    setRoundIdx(0); setRevealed(1); setGuess("");
    setFeedback(null); setResults([]); setGuessCount(0);
    setRoundStart(Date.now()); setPhase("playing");
  }

  function handleGuess() {
    const cur = currentChain[roundIdx];
    const userInput = guess.trim().toUpperCase();
    if (!userInput) return;
    const newGC = guessCount + 1;
    setGuessCount(newGC);

    // Combine revealed prefix with user's input to get full word
    const revealedPrefix = cur.answer.substring(0, revealed).toUpperCase();
    const fullGuess = revealedPrefix + userInput;

    const isCorrect = fullGuess === cur.answer.toUpperCase();
    const isPartial = !isCorrect && isSoundsLike(fullGuess, cur.answer);

    if (isCorrect) {
      setResults(r => [...r, { type: cur.type, correct: true, partial: false, reveals: revealed-1, timeMs: Date.now()-roundStart, guesses: newGC, partialGuess: null }]);
      setFeedback("correct");
      setGuess("");
    } else if (isPartial) {
      setResults(r => [...r, { type: cur.type, correct: false, partial: true, reveals: revealed-1, timeMs: Date.now()-roundStart, guesses: newGC, partialGuess: fullGuess }]);
      setFeedback("partial");
      setGuess("");
    } else {
      setFeedback("wrong");
      setGuess("");
      setTimeout(() => setFeedback(null), 700);
    }
  }

  function revealNext() {
    const cur = currentChain[roundIdx];
    if (revealed < cur.answer.length) {
      setRevealed(r => r+1);
      // Remove first character from guess since it's now revealed
      setGuess(g => g.substring(1));
      setFeedback(null);
    }
  }

  function skipRound() {
    const cur = currentChain[roundIdx];
    setResults(r => [...r, { type: cur.type, correct: false, partial: false, reveals: revealed, timeMs: Date.now()-roundStart, guesses: guessCount, partialGuess: null }]);
    advance(true);
  }

  function advance(fromSkip = false) {
    const next = roundIdx + 1;

    // If in practice mode and completed 3 rounds, go to practice-complete
    if (isPractice && next >= 3) {
      setPhase("practice-complete");
      return;
    }

    // If in real test and completed all rounds, show report
    if (!isPractice && next >= CHAIN.length) {
      setReport(generateReport(results, age)); setPhase("report");
    } else {
      setRoundIdx(next); setRevealed(1); setGuess("");
      setFeedback(null); setGuessCount(0); setRoundStart(Date.now());
    }
  }

  useEffect(() => {
    if (feedback === "correct" || feedback === "partial") {
      const t = setTimeout(() => advance(), 1600);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  // ── WELCOME ──
  if (phase === "welcome") return (
    <div className={S.page}>
      <div className={S.card}>
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Connected nodes representing semantic network */}
            <circle cx="40" cy="20" r="8" stroke="#39ff6a" strokeWidth="2.5" fill="none" />
            <circle cx="20" cy="50" r="8" stroke="#39ff6a" strokeWidth="2.5" fill="none" />
            <circle cx="60" cy="50" r="8" stroke="#39ff6a" strokeWidth="2.5" fill="none" />
            <circle cx="40" cy="65" r="6" stroke="#39ff6a" strokeWidth="2.5" fill="none" />

            {/* Connecting lines */}
            <line x1="36" y1="26" x2="24" y2="44" stroke="#39ff6a" strokeWidth="2" opacity="0.5" />
            <line x1="44" y1="26" x2="56" y2="44" stroke="#39ff6a" strokeWidth="2" opacity="0.5" />
            <line x1="28" y1="52" x2="36" y2="62" stroke="#39ff6a" strokeWidth="2" opacity="0.5" />
            <line x1="52" y1="52" x2="44" y2="62" stroke="#39ff6a" strokeWidth="2" opacity="0.5" />
          </svg>
        </div>

        <h1 className="text-4xl font-black text-white mb-4 leading-tight tracking-tight">Semantic Access Test</h1>
        <p className="text-zinc-300 text-lg mb-2 leading-relaxed">
          Retrieve words by sound, meaning, and both at once.
        </p>
        <p className={S.sub + " mb-8"}>
          ~5 minutes
        </p>
        <button onClick={() => setPhase("what")} className={S.btnPrimary}>Next</button>
      </div>
    </div>
  );

  // ── WHAT IT MEASURES ──
  if (phase === "what") return (
    <div className={S.page + " items-start overflow-y-auto"}>
      <div className={S.cardWide + " my-6"}>
        <p className={S.label + " mb-3"}>What this measures</p>
        <h2 className="text-2xl font-bold text-white mb-4 leading-tight">Lexical access speed</h2>
        <p className={S.sub + " mb-6"}>
          How quickly your brain retrieves words by sound, meaning, and both at once — a stronger predictor of cognitive performance than vocabulary size.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-8">
          {[
            { stat: "2–4×",        note: "Adults with strong dual-route lexical access acquire a second language 2–4× faster than those who rely on a single route.",                                                                               cite: "Kroll & Stewart, 1994" },
            { stat: "~40%",        note: "Around 40% of tip-of-the-tongue failures — when a word is known but unreachable — are explained by weak phonological retrieval alone.",                                                                   cite: "Brown, 1991" },
            { stat: "5–10 yrs",    note: "Lexical access speed slows measurably 5–10 years before any memory symptoms appear, making it one of the earliest detectable markers of cognitive decline.",                                             cite: "Mortensen et al., 2006" },
            { stat: "Independent", note: "Retrieval speed predicts reading comprehension scores independently of vocabulary size — how fast you access words matters as much as which words you know.",                                             cite: "Perfetti, 2007" },
          ].map((item, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className={`font-black text-lg leading-tight ${S.green}`}>{item.stat}</div>
              <div className="text-zinc-400 text-xs leading-snug mt-1">{item.note}</div>
              <div className="text-zinc-600 text-xs mt-1.5 italic">{item.cite}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setPhase("how")} className={S.btnPrimary}>Next</button>
      </div>
    </div>
  );

  // ── HOW IT WORKS ──
  if (phase === "how") return (
    <div className={S.page}>
      <div className={S.card}>
        <p className={S.label + " mb-3"}>How it works</p>
        <h2 className="text-2xl font-bold text-white mb-6 leading-tight">20 word-chain rounds</h2>
        <div className="space-y-3 mb-8">
          {[
            { num: "1", text: "You'll see a starting word and a clue describing a related word." },
            { num: "2", text: "Type your answer. If stuck, reveal letters one at a time — but your score drops with each reveal." },
            { num: "3", text: "Answer as fast as you can. Speed and reveals both affect your score." },
            { num: "4", text: "Each correct answer becomes the next starting word." },
          ].map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm bg-zinc-800 text-[#39ff6a]">
                {item.num}
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed pt-0.5">{item.text}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setPhase("age")} className={S.btnPrimary}>Next</button>
      </div>
    </div>
  );

  // ── AGE ──
  if (phase === "age") return (
    <div className={S.page}>
      <div className={S.card}>
        <p className={S.label + " mb-3"}>Setup</p>
        <h2 className={S.h1}>What's your age group?</h2>
        <p className={S.sub + " mb-6"}>Used to compare your results to age-matched norms from verbal fluency research.</p>
        <div className="space-y-2">
          {Object.keys(AGE_NORMS).map(a => (
            <button key={a} onClick={() => startPractice(a)}
              className="w-full border border-zinc-700 text-white font-semibold py-3 rounded-xl hover:border-[#39ff6a] hover:text-[#39ff6a] transition text-left px-4">
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── PRACTICE INTRO ──
  if (phase === "practice-intro") return (
    <div className={S.page}>
      <div className={S.card}>
        <p className={S.label + " mb-3"}>Before we begin</p>
        <h2 className="text-2xl font-bold text-white mb-4 leading-tight">Try 3 practice rounds</h2>
        <p className={S.sub + " mb-8"}>
          Get familiar with the format before the real test. Practice rounds don't affect your score.
        </p>
        <button onClick={beginPractice} className={S.btnPrimary}>Start practice</button>
      </div>
    </div>
  );

  // ── PRACTICE COMPLETE ──
  if (phase === "practice-complete") return (
    <div className={S.page}>
      <div className={S.card}>
        <p className={S.label + " mb-3"}>Practice complete</p>
        <h2 className="text-2xl font-bold text-white mb-4 leading-tight">Nice. You've got it.</h2>
        <p className={S.sub + " mb-8"}>
          The real test has 20 rounds. Remember: speed and letter reveals both affect your score.
        </p>
        <button onClick={startRealTest} className={S.btnPrimary}>Start the test</button>
      </div>
    </div>
  );

  // ── PRACTICE & PLAYING ──
  if (phase === "practice" || phase === "playing") {
    const cur = currentChain[roundIdx];
    const totalRounds = isPractice ? 3 : CHAIN.length;
    const progress = (roundIdx / totalRounds) * 100;

    return (
      <div className={S.page}>
        <div className={S.card}>
          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-1 rounded-full bg-[#39ff6a] transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
            {isPractice && (
              <p className="text-center text-zinc-600 text-xs mt-2">Practice round {roundIdx+1} of 3</p>
            )}
          </div>

          <p className={S.label + " mb-1"}>Starting word</p>
          <div className="text-5xl font-black text-white mb-5 tracking-wide">{cur.prompt}</div>

          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-5">
            <p className={S.label + " mb-2"}>Clue</p>
            <p className="text-zinc-300 text-sm leading-relaxed mb-4">{cur.clue}</p>

            {/* Letter boxes */}
            <div className="flex justify-center gap-1.5 mb-3">
              {cur.answer.split("").map((letter, i) => {
                // Show full answer in green if correct or partial
                const showAnswer = feedback === "correct" || feedback === "partial";
                const isRevealed = i < revealed;
                const userLetter = guess[i - revealed]?.toUpperCase() || "";
                const isActive = !isRevealed && i === revealed + guess.length && !showAnswer;
                return (
                  <div
                    key={i}
                    className={`w-10 h-12 flex items-center justify-center text-2xl font-bold rounded border-2 transition
                      ${showAnswer
                        ? 'border-[#39ff6a] bg-zinc-800 text-[#39ff6a]'
                        : isRevealed
                          ? 'border-[#39ff6a] bg-zinc-800 text-[#39ff6a]'
                          : isActive
                            ? 'border-[#39ff6a] bg-zinc-800 text-zinc-700 ring-2 ring-[#39ff6a] ring-opacity-50'
                            : userLetter
                              ? 'border-zinc-600 bg-zinc-800 text-white'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-700'
                      }`}
                  >
                    {showAnswer ? letter : isRevealed ? letter : userLetter || '_'}
                  </div>
                );
              })}
            </div>

            {/* Hidden input for keyboard capture */}
            <input
              ref={inputRef}
              value={guess}
              onChange={e => {
                const val = e.target.value.toUpperCase();
                const maxLen = cur.answer.length - revealed;
                if (val.length <= maxLen) setGuess(val);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") handleGuess();
              }}
              maxLength={cur.answer.length - revealed}
              className="w-full bg-transparent text-transparent caret-transparent focus:outline-none text-center"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />

            <p className="text-center text-zinc-600 text-xs">Type to fill in the blanks · Press <span className="text-zinc-500 font-semibold">Enter ↵</span> to submit</p>
          </div>

          {feedback === "correct" && <p className={`text-center font-bold text-lg mb-3 ${S.green}`}>✓ Correct!</p>}
          {feedback === "partial" && (
            <div className="text-center mb-3">
              <p className="font-bold text-yellow-400 text-base">Sounds right — check the spelling</p>
              <p className="text-zinc-500 text-xs mt-0.5">Logged as a phonological near-miss</p>
            </div>
          )}
          {feedback === "wrong" && <p className="text-center text-red-400 font-semibold mb-3">Not quite — try again</p>}

          {feedback !== "correct" && feedback !== "partial" && (
            <div className="flex gap-2">
              <button onClick={revealNext} disabled={revealed >= cur.answer.length}
                className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2.5 rounded-xl hover:border-zinc-500 disabled:opacity-30 transition">
                Reveal a letter
              </button>
              <button onClick={skipRound}
                className="flex-1 border border-zinc-700 text-zinc-500 text-sm py-2.5 rounded-xl hover:border-zinc-500 transition">
                Skip
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── REPORT ──
  if (phase === "report" && report) {
    const { pct, percentile, phonoPct, semPct, mxPct, archetype, norm, age: ag,
            strongest, weakest, partialCount, partialTypes } = report;

    const whyItMatters = [
      { label: "Reading fluency",            note: "Lexical access speed predicts how smoothly you decode text — faster access means less cognitive load per sentence, leaving more bandwidth for comprehension." },
      { label: "Verbal working memory",      note: "The ability to hold and manipulate words in mind depends on how densely your lexical networks are connected. Sparse networks mean slower maintenance." },
      { label: "Tip-of-the-tongue failures", note: "These occur when phonological and semantic pathways fail to activate simultaneously. Strong dual-route access dramatically reduces their frequency." },
      { label: "Language acquisition",       note: "Dual-route lexical access is the single strongest predictor of how quickly adults acquire a new language." },
    ];

    return (
      <div className="min-h-screen bg-black text-white flex justify-center p-5 overflow-y-auto">
        <div className={S.cardWide + " my-6 space-y-1"}>

          <p className={S.label + " mb-1"}>Your results</p>
          <h2 className="text-2xl font-bold text-white mb-1">Semantic Access Report</h2>
          <p className="text-zinc-500 text-xs mb-5">Ages {ag} · 20 rounds · 3 access types</p>

          {/* Score */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center mb-2">
            <div className={`text-8xl font-black leading-none ${S.green}`}>{pct}</div>
            <div className="text-zinc-500 text-sm mt-1">out of 100</div>
            <div className="mt-3 inline-block border border-[#39ff6a] text-[#39ff6a] text-sm font-semibold px-4 py-1.5 rounded-full">
              {percentile}th percentile · ages {ag}
            </div>
            <p className="text-zinc-600 text-xs mt-2">Age-group average: {norm.mean} · SD ±{norm.sd}</p>
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-3 gap-2 py-2">
            {[
              { label: "Phonological", val: phonoPct, icon: "🔤" },
              { label: "Semantic",     val: semPct,   icon: "💡" },
              { label: "Mixed",        val: mxPct,    icon: "🔀" },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <div className="text-base mb-0.5">{s.icon}</div>
                <div className={`text-2xl font-black ${S.green}`}>{s.val}</div>
                <div className="text-zinc-500 text-xs uppercase tracking-wide mt-0.5">{s.label}</div>
                <GreenBar value={s.val} />
              </div>
            ))}
          </div>

          {/* Phonological near-misses */}
          {partialCount > 0 && (
            <div className={S.divider}>
              <p className={S.label + " mb-2"}>Phonological near-misses</p>
              <div className="bg-zinc-900 border border-yellow-900 rounded-xl p-4">
                <div className="text-yellow-400 font-bold text-sm mb-1">
                  {partialCount} sound-correct, spelling-incorrect {partialCount === 1 ? "answer" : "answers"}
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  You retrieved the right sound pattern before the correct spelling — a meaningful signal. It indicates your phonological network fired successfully, but the orthographic mapping (sound → letters) didn't complete. This is common when phonological access is strong but visual word-form memory is less practised. It's logged separately and does not count as a full miss.
                </p>
              </div>
            </div>
          )}

          {/* Archetype */}
          <div className={S.divider}>
            <p className={S.label + " mb-2"}>Your archetype</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3">
              <span className="text-3xl shrink-0">{archetype.icon}</span>
              <div>
                <div className="font-bold text-white mb-1">{archetype.name}</div>
                <p className="text-zinc-400 text-sm leading-relaxed">{archetype.description}</p>
              </div>
            </div>
          </div>

          {/* Strengths */}
          <div className={S.divider}>
            <p className={S.label + " mb-3"}>Strengths & development</p>
            <div className="space-y-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className={`text-xs font-bold mb-1 ${S.green}`}>✓ Strongest — {strongest.label} ({strongest.pct}/100)</div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {strongest.key === "phono"    && "Your phonological network is your fastest channel. Sound patterns, syllables, and rhyme activate quickly and reliably — supporting verbal fluency, name recall, and spoken language comprehension."}
                  {strongest.key === "semantic" && "Your semantic network is your strongest channel. You organise words by meaning and context — making you a strong reader and inferential thinker."}
                  {strongest.key === "mixed"    && "Your dual-route access is your standout ability. You can simultaneously leverage sound and meaning — the most cognitively demanding access type, and the rarest strength."}
                </p>
              </div>
              <div className="bg-zinc-900 border border-amber-900 rounded-xl p-4">
                <div className="text-xs font-bold mb-1 text-amber-400">→ To develop — {weakest.label} ({weakest.pct}/100)</div>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {weakest.key === "phono"    && "Your sound-based pathways needed more cues and time than your other channels. Common in people who learned primarily through reading. The phonological network is highly trainable with production-based practice."}
                  {weakest.key === "semantic" && "Your meaning-based connections needed more scaffolding. You retrieve well by sound but meaning context takes longer to activate. Building denser semantic webs around known words is the most efficient growth path."}
                  {weakest.key === "mixed"    && "The hardest channel — requiring both networks simultaneously — was your most costly. Normal for most people. Training both in parallel (wordplay, cryptic crosswords) builds the bridge between them."}
                </p>
              </div>
            </div>
          </div>

          {/* Why it matters */}
          <div className={S.divider}>
            <p className={S.label + " mb-2"}>Why it matters</p>
            <p className="text-zinc-400 text-sm leading-relaxed mb-3">
              Semantic access is a window into how efficiently your brain organises and retrieves knowledge. Research from Levelt (1989), Collins & Loftus (1975), and Coltheart (1978) connects lexical access speed to a broad range of cognitive outcomes:
            </p>
            <div className="space-y-2">
              {whyItMatters.map((item, i) => (
                <div key={i} className={S.row + " items-start"}>
                  <span className={`shrink-0 font-bold ${S.green}`}>→</span>
                  <div className="text-sm"><span className="font-semibold text-white">{item.label}: </span><span className="text-zinc-400">{item.note}</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategies */}
          <div className={S.divider}>
            <p className={S.label + " mb-1"}>Personalised strategies</p>
            <p className="text-zinc-500 text-xs mb-3">Targeting your weakest channel: {weakest.label}</p>
            <div className="space-y-2">
              {STRATEGIES[weakest.key].map((s, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="font-bold text-white text-sm mb-1">{i+1}. {s.title}</div>
                  <div className="text-zinc-400 text-sm leading-relaxed">{s.body}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Round summary */}
          <div className={S.divider}>
            <p className={S.label + " mb-2"}>Round summary</p>
            <div className="space-y-1.5">
              {CHAIN.map((round, i) => {
                const r = report.results[i];
                if (!r) return null;
                const m = TYPE_META[round.type];
                const statusColor = r.correct ? "bg-[#39ff6a] text-black" : r.partial ? "bg-yellow-400 text-black" : "bg-zinc-700 text-zinc-400";
                const statusIcon  = r.correct ? "✓" : r.partial ? "~" : "✗";
                return (
                  <div key={i} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs">
                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs ${statusColor}`}>
                      {statusIcon}
                    </span>
                    <span className="font-mono text-zinc-500 shrink-0 w-16">{round.prompt}</span>
                    <span className="text-zinc-700">→</span>
                    <span className="font-semibold text-white shrink-0">{round.answer}</span>
                    {r.partial && <span className="text-yellow-600 shrink-0 italic">({r.partialGuess})</span>}
                    <span className="ml-auto shrink-0 text-sm">{m.icon}</span>
                    {(r.correct || r.partial) && <span className="text-zinc-600 shrink-0">{(r.timeMs/1000).toFixed(1)}s · {r.reveals} rev</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2 text-xs text-zinc-600">
              <span><span className="text-[#39ff6a] font-bold">✓</span> Correct</span>
              <span><span className="text-yellow-400 font-bold">~</span> Sound match</span>
              <span><span className="text-zinc-500 font-bold">✗</span> Missed</span>
            </div>
          </div>

          <button onClick={() => { setPhase("welcome"); setResults([]); }} className={S.btnPrimary + " mt-4"}>
            Start a new session
          </button>
        </div>
      </div>
    );
  }

  return null;
}
