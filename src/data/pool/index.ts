/** The verified exercise pool (spec §9): OPE, adapted and pinned generated exercises. */
import { type KinExercise, type KinExerciseJSON, exerciseFromJSON } from '../../core/model';
import adapted from './adapted.json';
import basics from './basics.json';
import generated from './generated.json';
import ope from './ope-euskadi-2020.json';
import madrid from './ope-madrid-2025.json';
import murtzia from './ope-murtzia-2021.json';
import cyl from './ope-gaztela-leon-2020.json';

const RAW: KinExerciseJSON[] = [
  ...(basics.exercises as unknown as KinExerciseJSON[]),
  ...(adapted.exercises as unknown as KinExerciseJSON[]),
  ope as unknown as KinExerciseJSON,
  madrid as unknown as KinExerciseJSON,
  murtzia as unknown as KinExerciseJSON,
  cyl as unknown as KinExerciseJSON,
  ...(generated.exercises as unknown as KinExerciseJSON[]),
];

export const POOL: KinExercise[] = RAW.map(exerciseFromJSON);
export const poolById = (id: string) => POOL.find((e) => e.id === id);
