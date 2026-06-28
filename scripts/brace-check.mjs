import ts from "typescript";
import fs from "node:fs";

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const diags = sf.parseDiagnostics ?? [];
for (const d of diags) {
  const pos = d.start != null ? sf.getLineAndCharacterOfPosition(d.start) : null;
  const loc = pos ? `${pos.line + 1}:${pos.character + 1}` : "?";
  const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
  console.log(`${loc}  ${msg}`);
}
console.log(`total parse diagnostics: ${diags.length}`);
