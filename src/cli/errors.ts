import type { Node } from '@syntax/ast.js';
import type { LumenErrorWithSource } from '../loader.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

export function printError(error: LumenErrorWithSource) {
  const { originalError, sourceCode, filePath } = error;

  const nodeWithError =
    'node' in originalError && originalError.node ? (originalError.node as Node) : undefined;
  const token = nodeWithError ? nodeWithError.token : undefined;

  console.error(`\n${colors.bold}${colors.red}error: ${originalError.message}${colors.reset}`);

  if (token && filePath !== 'unknown') {
    const { line, literal } = token;
    const column = Math.max(1, token.column);
    const sourceLines = sourceCode.split('\n');

    console.error(`   ${colors.blue}--> ${filePath}:${line}:${column}${colors.reset}`);

    const contextLines = 2;
    const startLine = Math.max(1, line - contextLines);
    const endLine = Math.min(sourceLines.length, line + contextLines);

    const gutterWidth = String(endLine).length;

    console.error(` ${' '.repeat(gutterWidth)} ${colors.blue}|${colors.reset}`);

    for (let i = startLine; i <= endLine; i++) {
      const lineContent = sourceLines[i - 1];
      if (lineContent === undefined) continue;

      const gutter = `${String(i).padStart(gutterWidth)} ${colors.blue}|${colors.reset}`;

      if (i === line) {
        console.error(`${gutter} ${lineContent}`);

        const pointerLength = literal.length || 1;
        const pointer = `${'^'.repeat(pointerLength)} Here`;
        console.error(
          ` ${' '.repeat(gutterWidth)} ${colors.blue}|${colors.reset} ${' '.repeat(column - 1)}${colors.bold}${colors.red}${pointer}${colors.reset}`,
        );
      } else {
        console.error(`${gutter} ${lineContent}`);
      }
    }
    console.error(` ${' '.repeat(gutterWidth)} ${colors.blue}|${colors.reset}\n`);
  }
}
