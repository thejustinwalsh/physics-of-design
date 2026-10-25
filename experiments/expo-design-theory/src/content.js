export const probeText = 'Pressure drift at the northern inlet needs a second reading before the next shift.';
export const candidates = [
  { id: 'compact', fontSize: 16, lineHeight: 1.4, trackingEm: 0 },
  { id: 'open', fontSize: 18, lineHeight: 1.5, trackingEm: 0 },
];
export const records = [
  { id: 'inlet', title: 'Northern inlet', value: '2.8 bar', category: 'Pressure', note: probeText, reviewed: false, time: '09:42' },
  { id: 'reservoir', title: 'Upper reservoir', value: '71%', category: 'Capacity', note: 'The overnight refill is complete. The next reading is scheduled for the afternoon.', reviewed: true, time: '09:18' },
  { id: 'station', title: 'West pumping station', value: '18.4 °C', category: 'Temperature', note: 'Temperature is stable after the cooling cycle. Inspect the seal at the next visit.', reviewed: false, time: '08:55' },
];
