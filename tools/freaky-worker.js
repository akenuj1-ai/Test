/**
 * Thread de simulacao do Freaky Zoo. Recebe uma tarefa, devolve acumuladores.
 *
 * Um motor por combinacao de calibragem, reaproveitado entre tarefas: montar as
 * fitas e os sorteadores custa mais do que muitas rodadas.
 */

import { parentPort } from 'node:worker_threads';
import { createEngine } from '../src/freaky/round.js';
import { simulate } from '../src/freaky/sim.js';

/** @type {Map<string, import('../src/freaky/round.js').Engine>} */
const engines = new Map();

if (!parentPort) throw new Error('freaky-worker.js so roda como worker_thread.');
const port = parentPort;

port.on('message', (/** @type {any} */ task) => {
  const key = JSON.stringify(task.calibration ?? {});
  let engine = engines.get(key);
  if (!engine) {
    engine = createEngine({ calibration: task.calibration });
    engines.set(key, engine);
  }
  const stats = simulate({
    rounds: task.rounds, mode: task.mode, seed: task.seed, engine, freeSpins: task.freeSpins,
  });
  port.postMessage({ id: task.id, stats });
});
