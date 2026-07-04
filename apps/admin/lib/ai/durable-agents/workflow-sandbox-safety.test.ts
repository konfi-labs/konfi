import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const workflowAgentFiles = [
  join(currentDir, "workflow.ts"),
  join(currentDir, "order-workflow.ts"),
  join(currentDir, "product-workflow.ts"),
  join(currentDir, "../email-order-import/workflow.ts"),
];

const forbiddenStreamOptions = new Set(["abortSignal", "timeout"]);

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return undefined;
}

function collectForbiddenStreamOptions(
  sourceFile: ts.SourceFile,
): Array<string> {
  const failures: Array<string> = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "stream"
    ) {
      const [options] = node.arguments;

      if (options && ts.isObjectLiteralExpression(options)) {
        for (const property of options.properties) {
          if (
            ts.isPropertyAssignment(property) ||
            ts.isShorthandPropertyAssignment(property)
          ) {
            const name = getPropertyNameText(property.name);

            if (name && forbiddenStreamOptions.has(name)) {
              const { line, character } =
                sourceFile.getLineAndCharacterOfPosition(
                  property.name.getStart(sourceFile),
                );
              failures.push(
                `${sourceFile.fileName}:${line + 1}:${character + 1} ${name}`,
              );
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return failures;
}

describe("workflow sandbox safety", () => {
  it("does not pass AbortSignal-backed options to WorkflowAgent.stream", async () => {
    const failures: Array<string> = [];

    for (const filePath of workflowAgentFiles) {
      const source = await readFile(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        relative(currentDir, filePath),
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      failures.push(...collectForbiddenStreamOptions(sourceFile));
    }

    expect(failures).toEqual([]);
  });
});
