/** Node authoring only. Keep search/identity dependencies out of portable
 * composition geometry used directly by Fieldwork's browser/native clients. */
import { z } from 'zod';
import { CompositionPlanSchema, planComposition } from './composition-plan.js';
import { BentoOptionsSchema, planBento } from './bento.js';
import { hash } from './identity.js';
export const CompositionAuthoringSchema = CompositionPlanSchema.extend({
  bento: BentoOptionsSchema.optional(),
});
export function planCompositionWithBento(
  input: z.input<typeof CompositionAuthoringSchema>,
) {
  const { bento, ...request } = CompositionAuthoringSchema.parse(input);
  const base = planComposition(request);
  if (!bento) return base;
  return {
    ...base,
    request: { ...base.request, bento },
    bento: planBento({
      ...bento,
      width: base.contentWidth,
      gap: base.gap,
      identity: { ...bento.identity, 'composition-plan': hash(base.request) },
    }),
  };
}
