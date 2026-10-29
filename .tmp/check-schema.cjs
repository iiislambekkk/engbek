const Database = require("better-sqlite3");
const db = new Database("dev.db", { readonly: true });
console.log("Example:", db.prepare("PRAGMA table_info(Example)").all().map(x => x.name).join(", "));
console.log("VocabularyChat:", db.prepare("PRAGMA table_info(VocabularyChat)").all().map(x => x.name).join(", "));
console.log("Chat unique index:", db.prepare("PRAGMA index_list(VocabularyChat)").all().map(x => x.name).join(", "));
db.close();
