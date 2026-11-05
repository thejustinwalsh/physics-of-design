// Editable semantic permutations, not different themes or universal aesthetics.
const orders = [
  {
    id: 'pulse',
    label: 'Pulse first',
    regions: ['summary', 'incident', 'latency'],
  },
  {
    id: 'response',
    label: 'Response first',
    regions: ['incident', 'summary', 'latency'],
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis first',
    regions: ['incident', 'latency', 'summary'],
  },
];
export const overviewVariants = orders.flatMap((order, orderIndex) =>
  [false, true].map((actionLead) => ({
    id: `${order.id}-${actionLead ? 'action' : 'context'}`,
    label: `${order.label} · ${actionLead ? 'action leads' : 'context leads'}`,
    orderIndex,
    actionLead,
    regions: order.regions,
  })),
);
export function resolveOverviewVariant(manual, selected) {
  const override = overviewVariants.find((variant) => variant.id === manual);
  const generated = overviewVariants.find((variant) => variant.id === selected);
  return {
    ...(override ?? generated ?? overviewVariants[0]),
    source: override
      ? 'manual'
      : generated
        ? 'generated'
        : 'historical-fallback',
  };
}
