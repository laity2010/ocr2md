/*
 * Obsidian Everforest dark Markdown source highlighting for CodeMirror 6.
 * Do not create or hold editor state here: this is only a CM6 extension.
 * Keep the family and 12pt editor baseline in styles.css unchanged.
 */
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

export const obsidianMarkdown = syntaxHighlighting(HighlightStyle.define([
  // Obsidian Everforest --h1-color through --h6-color.
  {tag: t.heading1, color: '#da6362', fontWeight: '500'},
  {tag: t.heading2, color: '#d77f48', fontWeight: '500'},
  {tag: t.heading3, color: '#bf983d', fontWeight: '500'},
  {tag: t.heading4, color: '#899c40', fontWeight: '500'},
  {tag: t.heading5, color: '#569d79', fontWeight: '500'},
  {tag: t.heading6, color: '#b87b9d', fontWeight: '500'},
  {tag: t.strong, fontWeight: '700', color: '#d3c6aa'},
  {tag: t.emphasis, fontStyle: 'italic', color: '#d3c6aa'},
  {tag: t.link, color: '#569d79'},
  {tag: t.url, color: '#7fbbb3', textDecoration: 'underline'},
  {tag: t.monospace, color: '#d3c6aa', backgroundColor: '#272f34'},
  {tag: t.quote, color: '#9aa79d'},
  {tag: t.list, color: '#569d79'},
  {tag: t.meta, color: '#859289'},
  {tag: t.comment, color: '#859289'},
  {tag: t.invalid, color: '#e67e80'},
]));
