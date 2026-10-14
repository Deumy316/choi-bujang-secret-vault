import restoreHandler from '../notes/restore.js';
import { createRestorePathHandler } from '../../src/restore-route.mjs';

export default createRestorePathHandler(restoreHandler);
