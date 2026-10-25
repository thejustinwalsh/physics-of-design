/** Authored field vocabulary shared by numeric programs and portable UI. */
export const DESIGN_FIELD_MOTION_ROLES = [
  'Quiet',
  'Settle',
  'Rebound',
] as const;

export const DESIGN_FIELD_VARIABLE_LABELS = {
  titleSize: 'Title size',
  bodySize: 'Body size',
  contentMax: 'Content cap',
  gap: 'Gap',
  leading: 'Body leading',
  imageAspect: 'Image aspect',
  imageShare: 'Image share',
  roughness: 'Finish A roughness',
  counterRoughness: 'Finish B roughness',
  motionRole: 'Motion role',
} as const;
