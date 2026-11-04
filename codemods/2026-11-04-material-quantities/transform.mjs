import { SyntaxKind } from 'ts-morph';

export const metadata = Object.freeze({ id: '2026-11-04-material-quantities' });
const legacy =
  /(?:^|\.)material\.(?:deltaEOK|roughnessDifference|alphaDifference|metalnessDifference|textureTileFrequencyOctaves|texturePhysicalFrequencyOctaves|textureAmplitudeFractionDifference|textureAmplitudeMmDifference|lightingDirectionDegrees|exposureEvDifference)$/;

// The old spelling does not tell us whether the consumer wanted a residual or
// a material quantity. Preserve source and report semantic review sites only.
export function transform({ project }) {
  return {
    manualSites: project.getSourceFiles().flatMap((file) =>
      file.getDescendants().flatMap((node) => {
        if (
          node.getKind() === SyntaxKind.PropertyAccessExpression &&
          node.getName() === 'units'
        ) {
          const expression = node.getExpression();
          const readsResiduals =
            expression
              .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
              .some((access) => access.getName() === 'residuals') ||
            expression
              .getDescendantsOfKind(SyntaxKind.StringLiteral)
              .some((literal) => literal.getLiteralText() === 'residuals');
          if (readsResiduals)
            return [
              {
                file: file.getFilePath(),
                line: node.getStartLineNumber(),
                expression: node.getText(),
                action:
                  'Residual units are dimensionless; use descriptorUnits or scaleUnits for underlying units.',
              },
            ];
        }
        if (
          ![
            SyntaxKind.StringLiteral,
            SyntaxKind.NoSubstitutionTemplateLiteral,
          ].includes(node.getKind())
        )
          return [];
        const text = node.getLiteralText();
        if (!legacy.test(text) && text !== 'relational-kernels-v1') return [];
        return [
          {
            file: file.getFilePath(),
            line: node.getStartLineNumber(),
            expression: node.getText(),
            action:
              'Classify raw descriptor versus band residual; regenerate saved outputs and bindings from original inputs.',
          },
        ];
      }),
    ),
  };
}
