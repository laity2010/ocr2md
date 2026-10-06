/* Compatibility entry point for the old WP6 audit smoke.
 * The modal was replaced by the in-pane AG audit table.
 * The maintained browser test now checks the original PDF as well, so a
 * dedicated /tmp fixture MUST include one cloned original PDF attachment.
 *
 * Examples:
 *   OCR2MD_AG_BASE_URL=http://127.0.0.1:4298 \
 *   OCR2MD_AG_PROJECT=/tmp/ocr2md-ag-audit-XXXX/book \
 *   node tests/mineruAnnotationAuditSmoke.cjs
 */
process.env.OCR2MD_AG_BASE_URL ||= process.env.OCR2MD_WP6_BASE_URL;
process.env.OCR2MD_AG_PROJECT ||= process.env.OCR2MD_WP6_PROJECT;
require("./mineruAuditAgGridSmoke.cjs");
