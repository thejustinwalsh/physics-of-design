import { SyntaxKind } from 'ts-morph';
export const metadata = Object.freeze({ id: '2026-10-25-nullable-glyph-ink' });
export function scan(project) {
  return project.getSourceFiles().flatMap((file) =>
    file
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter(
        (node) =>
          node.getExpression().getKind() ===
            SyntaxKind.PropertyAccessExpression &&
          node.getExpression().getName() === 'inkBounds' &&
          !node.hasQuestionDotToken(),
      )
      .map((node) => ({
        file: file.getFilePath(),
        line: node.getStartLineNumber(),
        expression: node.getText(),
        action:
          'Inspect producer and guard nullable glyph bounds without skipping its advance.',
      })),
  );
}
// No mechanically safe rewrite exists for arbitrary numeric geometry consumers.
export function transform({ project }) {
  return { manualSites: scan(project) };
}
