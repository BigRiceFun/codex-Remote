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

const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!scriptMatches.length) {
  throw new Error("Embedded page does not contain a script block.");
}

for (const [index, scriptMatch] of scriptMatches.entries()) {
  new vm.Script(scriptMatch[1], { filename: `embedded-page-${index + 1}.js` });
}

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const scriptSource = scriptMatches.map((match) => match[1]).join("\n");
const missingIds = [...scriptSource.matchAll(/\$\('([^']+)'\)/g)]
  .map((match) => match[1])
  .filter((id, index, all) => all.indexOf(id) === index && !ids.has(id));

if (missingIds.length) {
  throw new Error(`Embedded script references missing DOM ids: ${missingIds.join(", ")}`);
}

console.log("embedded page check ok");
