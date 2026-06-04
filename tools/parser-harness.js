#!/usr/bin/env node
// Extract the pure parser region from index.html and expose it for tests.
// Usage: const { parseMatch, SAMPLE, isPlaceholderLabel } = require("./parser-harness");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.split(/<script type="text\/babel"[^>]*>/)[1].split("</script>")[0];
const lines = script.split("\n");

// pure region: helpers (gpTotal) .. just before the CSS/JSX section, plus isPlaceholderLabel
const start = lines.findIndex((l) => l.startsWith("function gpTotal"));
const end = lines.findIndex((l) => l.startsWith("const CSS"));
const extra = lines.filter((l) => l.startsWith("const isPlaceholderLabel"));
const chunk = lines.slice(start, end).concat(extra).join("\n");

module.exports = new Function(chunk + "\n; return { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG };")();
