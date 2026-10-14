/** One-time OCR2MD composition; WCP sees only generic contracts and module descriptors. */
import {contracts} from './contracts.js';
import {documentService} from './document.js';
import {media} from './media.js';
import {review} from './review.js';
export {contracts};
export const modules=[documentService,media,review];
