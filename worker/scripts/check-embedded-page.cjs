const fs = require("fs");
const ts = require("typescript");
const vm = require("vm");

const source = fs.readFileSync("src/worker.ts", "utf8");
if (source.includes("\ufffd")) {
  throw new Error("src/worker.ts contains replacement characters (U+FFFD). Check file encoding.");
}

const sourceFile = ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true);
let initializer = null;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "HTML_PAGE") {
    initializer = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);

if (!initializer) {
  throw new Error("Cannot find HTML_PAGE template.");
}

let template = initializer;
if (ts.isTaggedTemplateExpression(template)) {
  template = template.template;
}
if (!ts.isNoSubstitutionTemplateLiteral(template)) {
  throw new Error("HTML_PAGE must be a single template literal.");
}

const html = template.rawText ?? template.text;

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error("Embedded page does not contain a script block.");
}

new vm.Script(scriptMatch[1], { filename: "embedded-page.js" });

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const missingIds = [...scriptMatch[1].matchAll(/\$\('([^']+)'\)/g)]
  .map((match) => match[1])
  .filter((id, index, all) => all.indexOf(id) === index && !ids.has(id));

if (missingIds.length) {
  throw new Error(`Embedded script references missing DOM ids: ${missingIds.join(", ")}`);
}

console.log("embedded page check ok");
