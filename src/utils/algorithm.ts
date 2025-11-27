export interface SavedNote {
  id: string;
  content: string;
  timestamp: number;
  tags: string[];
}

export function tokenizeAndNormalize(text: string): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') 
    .split(/\s+/); 
  const stopWords = new Set([
    'i', 'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'by', 'for', 'from', 'in', 'of',
    'on', 'to', 'with', 'and', 'but', 'or', 'so', 'if', 'about', 'at', 'it',
    'my', 'me', 'you', 'your'
  ]);
  return new Set(words.filter(word => word.length > 1 && !stopWords.has(word)));
}

export function computeIDF(savedNotes: SavedNote[]): Map<string, number> {
  const df = new Map<string, number>();
  const N = savedNotes.length;

  for (const note of savedNotes) {
    const tokens = tokenizeAndNormalize(note.content);
    for (const t of tokens) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, freq] of df.entries()) {
    idf.set(token, Math.log((N + 1) / (freq + 1)) + 1);
  }
  return idf;
}

export function findSuggestions(sentence: string, savedNotes: SavedNote[]): SavedNote[] {
  const searchTokens = tokenizeAndNormalize(sentence);
  if (searchTokens.size === 0) return [];

  const idf = computeIDF(savedNotes);
  const queryVec: Map<string, number> = new Map();

  for (const t of searchTokens) {
    const weight = idf.get(t) || 0;
    queryVec.set(t, weight);
  }

  const queryNorm = Math.sqrt(
    Array.from(queryVec.values()).reduce((sum, v) => sum + v * v, 0)
  );

  const scored = savedNotes.map(note => {
    const noteTokens = tokenizeAndNormalize(note.content);
    const tfMap: Map<string, number> = new Map();

    for (const t of noteTokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    const noteVec: Map<string, number> = new Map();
    for (const [t, tf] of tfMap.entries()) {
      noteVec.set(t, tf * (idf.get(t) || 0));
    }

    const noteNorm = Math.sqrt(
      Array.from(noteVec.values()).reduce((sum, v) => sum + v * v, 0)
    );

    let dot = 0;
    for (const t of searchTokens) {
      dot += (queryVec.get(t) || 0) * (noteVec.get(t) || 0);
    }

    let score = dot / (queryNorm * noteNorm || 1);

    if (note.content.toLowerCase().includes(sentence.toLowerCase())) {
      score += 2.0;
    }

    const age = Date.now() - note.timestamp;
    const recencyWeight = 1 / (1 + age / (1000 * 60 * 60 * 24 * 30)); 
    score += 0.1 * recencyWeight;

    return { note, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.map(s => s.note);
}