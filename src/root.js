// Absolute paths inside the kit, independent of the current working directory.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const kitPath = (...parts) => path.join(KIT_ROOT, ...parts);
