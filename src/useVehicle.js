// React hook: re-render the component whenever the vehicle's state changes.
import { useEffect, useReducer } from 'react';
import { vehicle } from './vehicle.js';

export function useVehicle() {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => vehicle.subscribe(bump), []);
  return vehicle;
}
