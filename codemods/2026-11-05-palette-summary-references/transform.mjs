export const metadata = Object.freeze({
  id: '2026-11-05-palette-summary-references',
});
export function transform({ project }) {
  // A host runner may own a different compiler version. Named node kinds avoid
  // interpreting its AST with numeric SyntaxKind values from another version.
  return {
    manualSites: project.getSourceFiles().flatMap((file) =>
      file
        .getDescendants()
        .filter(
          (node) =>
            node.getKindName() === 'PropertyAccessExpression' &&
            node.getName() === 'tokens' &&
            node.getExpression().getKindName() === 'PropertyAccessExpression' &&
            node.getExpression().getName() === 'system',
        )
        .map((node) => ({
          file: file.getFilePath(),
          line: node.getStartLineNumber(),
          expression: node.getText(),
          action:
            'Classify full result versus compact palette summary; compact display uses tokenPreview and downstream commands keep the exact system reference.',
        })),
    ),
  };
}
