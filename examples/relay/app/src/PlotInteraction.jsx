import { forwardRef } from 'react';
import { html } from 'react-strict-dom';
export default forwardRef(/** @param {import('react').ComponentProps<typeof html.div> & {onSelectFraction: (fraction: number) => void}} input */ function PlotInteraction(input, ref) {
  const { onSelectFraction, ...props } = input;
  return <html.div {...props} ref={ref} />;
});
