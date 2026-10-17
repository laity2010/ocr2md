import {workspaceModule} from './workspace.js';
import {directoryModule} from './directory-service.js';
import {directoryContracts} from './directory-contracts.js';
export const modules=[directoryModule,workspaceModule];
export const contracts=directoryContracts;
