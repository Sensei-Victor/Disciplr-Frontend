import { describe, it, expect } from 'vitest';
import { movingAverage } from '../movingAverage';

describe('movingAverage', () => {
  it('should return an empty array when given an empty array', () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  it('should handle a single value', () => {
    expect(movingAverage([5], 3)).toEqual([5]);
  });

  it('should act as identity when window is 1', () => {
    const values = [1, 2, 3, 4, 5];
    expect(movingAverage(values, 1)).toEqual(values);
  });

  it('should treat window <= 0 as window = 1', () => {
    const values = [10, 20, 30];
    expect(movingAverage(values, 0)).toEqual(values);
    expect(movingAverage(values, -2)).toEqual(values);
  });

  it('should handle window greater than array length', () => {
    const values = [2, 4, 6];
    // Window 5 on [2, 4, 6]:
    // i=0: [2] -> 2
    // i=1: [2, 4] -> 3
    // i=2: [2, 4, 6] -> 4
    expect(movingAverage(values, 5)).toEqual([2, 3, 4]);
  });

  it('should compute a typical multi-point series with partial windows at the start', () => {
    const values = [10, 20, 30, 40, 50, 60];
    // Window 3 on [10, 20, 30, 40, 50, 60]:
    // i=0: [10] -> 10
    // i=1: [10, 20] -> 15
    // i=2: [10, 20, 30] -> 20
    // i=3: [20, 30, 40] -> 30
    // i=4: [30, 40, 50] -> 40
    // i=5: [40, 50, 60] -> 50
    expect(movingAverage(values, 3)).toEqual([10, 15, 20, 30, 40, 50]);
  });
});
