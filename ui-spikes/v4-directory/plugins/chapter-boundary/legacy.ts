/** Self-contained V3 chapter boundary UI snapshot; preserved algorithms and IDs.
 * Future chapter-boundary behavior fixes stay within this plugin's directory.
 * Shared domain-level DIRjson transforms remain central pure libraries, and
 * Vault access is authorized exclusively by WCP CQE's filesystem service. */
export {IrWorkbenchPanel} from './irWorkbenchPanel';
export {V3PdfPreview} from './pdfPreview';
export {DEFAULT_DIRECTORY_SETTINGS} from './settings';
export {MacVaultHttpFS} from '../../../../src/v3HttpWorkspaceFs';
