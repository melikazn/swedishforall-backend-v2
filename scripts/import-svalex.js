/*
 * Builds the vocabulary up to 12,000 entries from SVALex CEFR frequency data.
 * Run: GOOGLE_TRANSLATE_API_KEY=... node scripts/import-svalex.js --execute
 * The script is restart-safe: it never inserts an existing normalized word.
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const pool = require("../config/db");

const SVALEX_PATH = process.env.SVALEX_PATH || "/private/tmp/SVALex_v2.tsv";
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const CORPUS_TOTALS = [5554.4792, 7563.1945, 3993.9285, 6220.0986, 5742.0021];
// A1 already contains more than its approximate 600-word goal. The remaining
// targets total exactly 12,000 without deleting existing, user-curated data.
const TARGETS = { A1: 687, A2: 1400, B1: 2500, B2: 3500, C1: 3913 };
const WORD_PATTERN = /^[A-Za-zÅÄÖåäöÉéÜü][A-Za-zÅÄÖåäöÉéÜü -]*$/;

function normalise(word) {
  return word.normalize("NFC").trim().toLocaleLowerCase("sv-SE");
}

function wordClass(tag) {
  if (tag.startsWith("VB")) return "verb";
  if (tag.startsWith("NN")) return "substantiv";
  if (tag.startsWith("JJ")) return "adjektiv";
  if (tag.startsWith("AB")) return "adverb";
  if (tag.startsWith("PN")) return "pronomen";
  if (tag.startsWith("RG")) return "räkneord";
  if (tag.startsWith("PP")) return "preposition";
  if (tag.startsWith("KN")) return "konjunktion";
  return "övrigt";
}

function article(tag) {
  if (tag.startsWith("NN_UTR")) return "en";
  if (tag.startsWith("NN_NEU")) return "ett";
  return null;
}

function candidates(existing) {
  const lines = fs.readFileSync(SVALEX_PATH, "utf8").trimEnd().split(/\r?\n/);
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
  const seen = new Set(existing);

  for (const line of lines.slice(1)) {
    const columns = line.split("\t");
    const word = (columns[0] || "").trim();
    if (!WORD_PATTERN.test(word) || word.length > 48) continue;
    const key = normalise(word);
    if (seen.has(key)) continue;

    const scores = columns.slice(2, 7).map(Number).map((value, index) => value / CORPUS_TOTALS[index]);
    const highest = Math.max(...scores);
    if (!(highest > 0)) continue;
    const level = LEVELS[scores.indexOf(highest)];
    byLevel[level].push({ word, tag: columns[1] || "" });
    seen.add(key);
  }
  return byLevel;
}

async function translateBatch(words) {
  if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY saknas. En officiell översättningsnyckel krävs för att importera persiska översättningar.");
  }
  const response = await axios.post("https://translation.googleapis.com/language/translate/v2", {
    q: words,
    source: "sv",
    target: "fa",
    format: "text",
  }, {
    params: { key: process.env.GOOGLE_TRANSLATE_API_KEY },
    timeout: 30000,
  });
  const translated = response.data.data.translations.map(({ translatedText }) => translatedText.trim());
  if (translated.length !== words.length || translated.some((text) => !text)) {
    throw new Error(`Översättningssvaret kunde inte delas upp i ${words.length} poster.`);
  }
  return translated;
}

async function ensureImportColumns() {
  for (const sql of [
    "ALTER TABLE vocabulary ADD COLUMN source VARCHAR(80) NULL",
    "ALTER TABLE vocabulary ADD COLUMN review_status VARCHAR(30) NOT NULL DEFAULT 'approved'",
  ]) {
    try { await pool.query(sql); } catch (error) {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }
}

async function main() {
  if (!fs.existsSync(SVALEX_PATH)) throw new Error(`SVALex-filen saknas: ${SVALEX_PATH}`);
  const execute = process.argv.includes("--execute");
  const [words] = await pool.query("SELECT word FROM vocabulary");
  const [countRows] = await pool.query("SELECT level, COUNT(*) AS count FROM vocabulary GROUP BY level");
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const row of countRows) if (Object.hasOwn(counts, row.level)) counts[row.level] = row.count;
  const selected = candidates(new Set(words.map(({ word }) => normalise(word))));

  const plan = [];
  for (const level of LEVELS) {
    const needed = Math.max(0, TARGETS[level] - counts[level]);
    if (selected[level].length < needed) throw new Error(`${level}: bara ${selected[level].length} unika kandidater för ${needed} behövs.`);
    plan.push(...selected[level].slice(0, needed).map((entry) => ({ ...entry, level })));
  }

  console.table(LEVELS.map((level) => ({ level, finns: counts[level], mål: TARGETS[level], läggsTill: plan.filter((entry) => entry.level === level).length })));
  console.log(`Totalt att lägga till: ${plan.length}. Slutmål: ${Object.values(TARGETS).reduce((sum, count) => sum + count, 0)}.`);
  if (!execute) return;

  await ensureImportColumns();
  const sql = `INSERT INTO vocabulary
    (word, first_letter, word_class, article, forms, meaning, synonyms, translation, example, level, source, review_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const chunkSize = 40;
  let inserted = 0;
  for (let start = 0; start < plan.length; start += chunkSize) {
    const batch = plan.slice(start, start + chunkSize);
    const translations = await translateBatch(batch.map(({ word }) => word));
    const rows = batch.map((entry, index) => [
      entry.word,
      entry.word.charAt(0).toLocaleUpperCase("sv-SE"),
      wordClass(entry.tag),
      article(entry.tag),
      "[]",
      "SVALex-nivåord. Betydelse granskas redaktionellt.",
      "[]",
      translations[index],
      "Exempel läggs till vid redaktionell granskning.",
      entry.level,
      "SVALex 2016 + maskinöversättning",
      "needs_review",
    ]);
    await pool.query(sql, rows);
    inserted += rows.length;
    console.log(`Importerade ${inserted}/${plan.length}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
