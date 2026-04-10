'use client';

const BASE_Z_INDEX = 1000;
const Z_INDEX_STEP = 50;

const activeZ = new Set<number>();

const getMaxFromActive = () => {
  if (!activeZ.size) return BASE_Z_INDEX;
  let max = BASE_Z_INDEX;
  activeZ.forEach(value => {
    if (value > max) max = value;
  });
  return max;
};

export function allocateZIndex(parentZ?: number): number {
  const base = parentZ != null ? parentZ : getMaxFromActive();
  const next = base + Z_INDEX_STEP;
  activeZ.add(next);
  return next;
}

export function releaseZIndex(z?: number | null) {
  if (z == null) return;
  activeZ.delete(z);
}

export function getCurrentMaxZ(): number {
  return getMaxFromActive();
}

export { BASE_Z_INDEX, Z_INDEX_STEP };

