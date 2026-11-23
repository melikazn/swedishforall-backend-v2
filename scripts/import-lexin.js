/*
 * Imports reviewed Swedish definitions and Persian translations from LEXIN.
 * SVALex is used where available to calibrate the CEFR level; other LEXIN
 * entries are placed by LEXIN's frequency rank. Run with --execute.
 */
const fs = require("fs");
const xml2js = require("xml2js");
const pool = require("../config/db");

const LEXIN_SWE = "/private/tmp/swe_swe.xml";
const LEXIN_PER = "/private/tmp/swe_per.xml";
const SVALEX = "/private/tmp/SVALex_v2.tsv";
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const TARGETS = { A1: 687, A2: 1400, B1: 2500, B2: 3500, C1: 3913 };
const TOTALS = [5554.4792, 7563.1945, 3993.9285, 6220.0986, 5742.0021];

const normalise = (word) => word.normalize("NFC").trim().toLocaleLowerCase("sv-SE");
const value = (node) => typeof node === "string" ? node.trim() : (node?._ || "").trim();
const all = (nodes) => (nodes || []).map(value).filter(Boolean);

function classFor(type = "") {
  if (type.startsWith("verb")) return "verb";
  if (type.startsWith("subst")) return "substantiv";
  if (type.startsWith("adj")) return "adjektiv";
  if (type.startsWith("adv")) return "adverb";
  if (type.startsWith("pron")) return "pronomen";
  if (type.startsWith("prep")) return "preposition";
  if (type.startsWith("konj")) return "konjunktion";
  if (type.startsWith("räkne")) return "räkneord";
  return "övrigt";
}

function svalexLevels() {
  const result = new Map();
  for (const line of fs.readFileSync(SVALEX, "utf8").trimEnd().split(/\r?\n/).slice(1)) {
    const fields = line.split("\t");
    const word = (fields[0] || "").trim();
    if (!word) continue;
    const scores = fields.slice(2, 7).map(Number).map((score, index) => score / TOTALS[index]);
    const best = Math.max(...scores);
    if (best > 0) result.set(normalise(word), LEVELS[scores.indexOf(best)]);
  }
  return result;
}

async function lexinEntries() {
  const [swedish, persian] = await Promise.all([
    xml2js.parseStringPromise(fs.readFileSync(LEXIN_SWE, "utf8")),
    xml2js.parseStringPromise(fs.readFileSync(LEXIN_PER, "utf8")),
  ]);
  const translations = new Map();
  for (const lexeme of persian.TargetLangContainer.Lexeme || []) {
    const text = all(lexeme.Translation).join("; ");
    if (text) translations.set(lexeme.$.ID, text);
  }

  const entries = new Map();
  for (const article of swedish.Dictionary.Article || []) for (const lemma of article.Lemma || []) {
    const word = (lemma.$?.Value || "").trim();
    if (!word) continue;
    for (const lexeme of lemma.Lexeme || []) {
      const translation = translations.get(lexeme.$?.ID);
      const meaning = value(lexeme.Definition?.[0]);
      if (!translation || !meaning) continue;
      const example = value(lexeme.Example?.[0]);
      const forms = all(lemma.Inflection);
      const candidate = {
        word, translation, meaning, example, forms,
        tag: lemma.$?.Type || "", rank: Number(lemma.$?.Rank) || 999999,
      };
      const key = normalise(word);
      const current = entries.get(key);
      // Prefer a source example, then the more frequent spelling/sense.
      if (!current || (!current.example && example) || (Boolean(current.example) === Boolean(example) && candidate.rank < current.rank)) entries.set(key, candidate);
    }
  }
  return [...entries.values()];
}

function pick(entries, counts, levels) {
  const selected = [];
  const chosen = new Set();
  for (const level of ["A2", "B1", "B2", "C1"]) {
    const needed = Math.max(0, TARGETS[level] - counts[level]);
    const matching = entries.filter((entry) => levels.get(normalise(entry.word)) === level).sort((a, b) => a.rank - b.rank);
    for (const entry of matching.slice(0, needed)) { selected.push({ ...entry, level }); chosen.add(normalise(entry.word)); }
  }
  const rest = entries.filter((entry) => !chosen.has(normalise(entry.word))).sort((a, b) => a.rank - b.rank);
  let cursor = 0;
  for (const level of ["A2", "B1", "B2", "C1"]) {
    const required = Math.max(0, TARGETS[level] - counts[level] - selected.filter((entry) => entry.level === level).length);
    for (const entry of rest.slice(cursor, cursor + required)) selected.push({ ...entry, level });
    cursor += required;
  }
  return selected;
}

async function main() {
  if (![LEXIN_SWE, LEXIN_PER, SVALEX].every(fs.existsSync)) throw new Error("En nödvändig källfil saknas i /private/tmp.");
  const execute = process.argv.includes("--execute");
  const [existingRows, countRows] = await Promise.all([
    pool.query("SELECT word FROM vocabulary"), pool.query("SELECT level, COUNT(*) AS count FROM vocabulary GROUP BY level"),
  ]);
  const existing = new Set(existingRows[0].map(({ word }) => normalise(word)));
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const row of countRows[0]) if (Object.hasOwn(counts, row.level)) counts[row.level] = row.count;
  const entries = (await lexinEntries()).filter((entry) => !existing.has(normalise(entry.word)));
  const plan = pick(entries, counts, svalexLevels());
  for (const level of ["A2", "B1", "B2", "C1"]) {
    const expected = Math.max(0, TARGETS[level] - counts[level]);
    const actual = plan.filter((entry) => entry.level === level).length;
    if (actual !== expected) throw new Error(`${level}: behöver ${expected} poster men kunde bara välja ${actual}.`);
  }
  console.table(LEVELS.map((level) => ({ level, finns: counts[level], mål: TARGETS[level], läggsTill: plan.filter((entry) => entry.level === level).length })));
  console.log(`Totalt att lägga till: ${plan.length}; slutligt antal: ${Object.values(TARGETS).reduce((a, b) => a + b, 0)}.`);
  if (!execute) return;

  const sql = `INSERT INTO vocabulary
    (word, first_letter, word_class, article, forms, meaning, synonyms, translation, example, level, source, review_status)
    VALUES ?`;
  for (let start = 0; start < plan.length; start += 200) {
    const batch = plan.slice(start, start + 200);
    const values = batch.map((entry) => [
      entry.word, entry.word.charAt(0).toLocaleUpperCase("sv-SE"), classFor(entry.tag), null,
      JSON.stringify(entry.forms), entry.meaning, "[]", entry.translation,
      entry.example || `${entry.word}: ${entry.meaning}.`, entry.level,
      "LEXIN (ISOF) 2020; SVALex nivåkalibrering", entry.example ? "approved" : "needs_review",
    ]);
    await pool.query(sql, [values]);
    console.log(`Importerade ${Math.min(start + batch.length, plan.length)}/${plan.length}`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
