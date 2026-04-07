/**
 * Generate test file stubs from source code analysis.
 * Run with: deno run --allow-read --allow-write generate-stubs.ts <source-file> --output <test-file> [--framework vitest|jest|mocha]
 */

import { parse as parsePath } from "https://deno.land/std@0.224.0/path/mod.ts";

interface FunctionInfo {
  name: string;
  params: string[];
  returnType: string;
  async: boolean;
  exported: boolean;
}

interface ClassInfo {
  name: string;
  methods: string[];
  exported: boolean;
}

interface AnalysisResult {
  file: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
}

function parseArgs(args: string[]): { source: string; output: string; framework: string } {
  let source = "";
  let output = "";
  let framework = "vitest";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && i + 1 < args.length) {
      output = args[++i];
    } else if (args[i] === "--framework" && i + 1 < args.length) {
      framework = args[++i];
    } else if (args[i] === "--help") {
      console.error(
        "Usage: deno run --allow-read --allow-write generate-stubs.ts <source-file> --output <test-file> [--framework vitest|jest|mocha]"
      );
      Deno.exit(0);
    } else if (!source) {
      source = args[i];
    }
  }

  if (!source) {
    console.error("Error: source file is required");
    Deno.exit(1);
  }
  if (!output) {
    const parsed = parsePath(source);
    output = `${parsed.dir}/${parsed.name}.test${parsed.ext}`;
  }

  return { source, output, framework };
}

function generateImports(framework: string, sourceFile: string, analysis: AnalysisResult): string {
  const exportedFns = analysis.functions.filter((f) => f.exported).map((f) => f.name);
  const exportedClasses = analysis.classes.filter((c) => c.exported).map((c) => c.name);
  const names = [...exportedFns, ...exportedClasses];

  const relativePath = `./${parsePath(sourceFile).name}`;
  const importLine =
    names.length > 0
      ? `import { ${names.join(", ")} } from "${relativePath}";`
      : `// No exports found in ${sourceFile}`;

  switch (framework) {
    case "vitest":
      return `import { describe, it, expect } from "vitest";\n${importLine}`;
    case "jest":
      return importLine;
    case "mocha":
      return `import { expect } from "chai";\n${importLine}`;
    default:
      return importLine;
  }
}

function generateFunctionTests(fn: FunctionInfo, framework: string): string {
  const asyncPrefix = fn.async ? "async " : "";
  const expectFn = framework === "mocha" ? "expect" : "expect";
  const lines: string[] = [];

  lines.push(`  describe("${fn.name}", () => {`);
  lines.push(`    it("should return a value", ${asyncPrefix}() => {`);

  // Generate param placeholders
  const paramValues = fn.params.map((p) => {
    const name = p.split(":")[0].trim().replace("?", "");
    const type = p.includes(":") ? p.split(":")[1].trim() : "unknown";
    if (type.includes("string")) return `"test-${name}"`;
    if (type.includes("number")) return "1";
    if (type.includes("boolean")) return "true";
    if (type.includes("Date")) return "new Date()";
    return `undefined /* ${name}: ${type} */`;
  });

  const call = fn.async ? `await ${fn.name}(${paramValues.join(", ")})` : `${fn.name}(${paramValues.join(", ")})`;
  lines.push(`      const result = ${call};`);
  lines.push(`      ${expectFn}(result).toBeDefined();`);
  lines.push(`    });`);

  lines.push(`\n    it("should handle edge cases", ${asyncPrefix}() => {`);
  lines.push(`      // TODO: Add edge case tests`);
  lines.push(`    });`);
  lines.push(`  });`);

  return lines.join("\n");
}

function generateClassTests(cls: ClassInfo): string {
  const lines: string[] = [];
  lines.push(`  describe("${cls.name}", () => {`);
  lines.push(`    let instance: ${cls.name};`);
  lines.push("");
  lines.push(`    beforeEach(() => {`);
  lines.push(`      instance = new ${cls.name}(/* TODO: constructor args */);`);
  lines.push(`    });`);

  for (const method of cls.methods) {
    lines.push("");
    lines.push(`    it("${method} should work correctly", () => {`);
    lines.push(`      const result = instance.${method}(/* TODO: args */);`);
    lines.push(`      expect(result).toBeDefined();`);
    lines.push(`    });`);
  }

  lines.push(`  });`);
  return lines.join("\n");
}

// Main
const { source, output, framework } = parseArgs(Deno.args);

// Run analysis inline (read the source)
const content = Deno.readTextFileSync(source);

// Quick inline analysis (simplified — for full analysis use analyze-source.ts)
const analysis: AnalysisResult = { file: source, functions: [], classes: [] };

const funcRegex =
  /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?\s*\{/gm;
let match;
while ((match = funcRegex.exec(content)) !== null) {
  analysis.functions.push({
    name: match[3],
    params: match[4] ? match[4].split(",").map((p: string) => p.trim()).filter(Boolean) : [],
    returnType: match[5] || "void",
    async: !!match[2],
    exported: !!match[1],
  });
}

const classRegex = /^(export\s+)?class\s+(\w+)/gm;
while ((match = classRegex.exec(content)) !== null) {
  analysis.classes.push({ name: match[2], methods: [], exported: !!match[1] });
}

// Generate test file
const parts: string[] = [];
parts.push(generateImports(framework, source, analysis));
parts.push("");
parts.push(`describe("${parsePath(source).name}", () => {`);

for (const fn of analysis.functions.filter((f) => f.exported)) {
  parts.push(generateFunctionTests(fn, framework));
  parts.push("");
}

for (const cls of analysis.classes.filter((c) => c.exported)) {
  parts.push(generateClassTests(cls));
  parts.push("");
}

parts.push(`});`);
parts.push("");

const testContent = parts.join("\n");
Deno.writeTextFileSync(output, testContent);
console.log(JSON.stringify({ generated: output, functions: analysis.functions.length, classes: analysis.classes.length }, null, 2));
