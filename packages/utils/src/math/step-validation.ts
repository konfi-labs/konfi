export const STEP_VALIDATION_SCALE_FACTOR = 1_000_000;

export const scaleForStepValidation = (value: number): number => {
  return Math.round(value * STEP_VALIDATION_SCALE_FACTOR);
};

export const isStepViolation = (
  value: number,
  minValue: number,
  stepValue: number,
): boolean => {
  const scaledStep = scaleForStepValidation(stepValue);
  if (scaledStep === 0) return false;
  const scaledDelta = scaleForStepValidation(value - minValue);
  const remainder = scaledDelta % scaledStep;
  return Math.abs(remainder) > 0.5; // Allow tiny rounding errors
};
