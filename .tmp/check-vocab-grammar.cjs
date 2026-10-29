const Database = require("better-sqlite3");
const db = new Database("dev.db", { readonly: true });
const row = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN grammar IS NULL THEN 0 ELSE 1 END) AS withGrammar FROM VocabularyItem").get();
console.log(JSON.stringify(row));
const recent = db.prepare("SELECT term, grammar FROM VocabularyItem ORDER BY updatedAt DESC LIMIT 5").all();
for (const item of recent) console.log(item.term, item.grammar ? Object.keys(JSON.parse(item.grammar)).join(",") : "NO GRAMMAR");
db.close();
