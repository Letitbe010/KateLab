/** Ask labels: the exam's own "a)" marker is dropped (the form adds its letter). */
import { stripMarker } from '../src/ui/describe';

describe('ask labels', () => {
  it('drops a leading exam marker only', () => {
    expect(stripMarker('a) Kalkulatu abiadura')).toBe('Kalkulatu abiadura');
    expect(stripMarker('2) Par transmitido')).toBe('Par transmitido');
    expect(stripMarker('Abiadura (rpm)')).toBe('Abiadura (rpm)');
    expect(stripMarker('n2 = n1 · i')).toBe('n2 = n1 · i');
  });
});
