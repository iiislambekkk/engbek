const Database = require("better-sqlite3");
const db = new Database("dev.db", { readonly: true });
console.log(db.prepare("PRAGMA table_info(VocabularyItem)").all().map(column => column.name).includes("grammar") ? "VocabularyItem.grammar is present" : "VocabularyItem.grammar is missing");
db.close();
