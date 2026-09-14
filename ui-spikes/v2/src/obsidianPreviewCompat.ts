export type ObsidianPreviewNormalization = {
  markdown: string;
  embedStartLines: ReadonlySet<number>;
};

export type ObsidianCalloutPreview = {
  sourceLine: number;
  quoteDepth: number;
  type: string;
  title: string;
  foldMarker?: "+" | "-";
  collapsed: boolean;
  bodySource: string;
};

const EMBED_END_RE = /^>\s*<embed\b[^>]*\bid\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)[^>]*>\s*<\/embed>\s*$/i;
const BLOCK_BREAK_RE = /^<br\s*\/?>\s*$/i;
const CALLOUT_HEAD_RE = /^\s*(>+)\s*\[!([^\]]*)\]([+-])?\s*(.*)$/;
const QUOTED_LINE_RE = /^\s*(>+)([ \t]?)(.*)$/;

export function scanObsidianCalloutsForPreview(
  text: string,
): ReadonlyMap<number, ObsidianCalloutPreview> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const callouts = new Map<number, ObsidianCalloutPreview>();

  for (let start = 0; start < lines.length; start += 1) {
    const head = CALLOUT_HEAD_RE.exec(lines[start]);
    if (!head) continue;

    const quoteDepth = head[1].length;
    const type = head[2].trim();
    const foldMarker = head[3] as "+" | "-" | undefined;
    const title = head[4].trim() || type || "Callout";
    const bodyLines: string[] = [];

    for (let index = start + 1; index < lines.length; index += 1) {
      const quoted = QUOTED_LINE_RE.exec(lines[index]);
      if (!quoted || quoted[1].length < quoteDepth) break;

      const extraQuotes = quoted[1].slice(quoteDepth);
      bodyLines.push(
        extraQuotes.length > 0
          ? `${extraQuotes}${quoted[2]}${quoted[3]}`
          : quoted[3],
      );
    }

    callouts.set(start + 1, {
      sourceLine: start + 1,
      quoteDepth,
      type,
      title,
      foldMarker,
      collapsed: foldMarker === "-",
      bodySource: bodyLines.join("\n").replace(/\s+$/, ""),
    });
  }

  return callouts;
}

export function normalizeObsidianEmbedBlocksForPreview(
  text: string,
): ObsidianPreviewNormalization {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const embedStartLines = new Set<number>();

  for (let start = 0; start < lines.length; start += 1) {
    if (lines[start].trim() !== ">") continue;

    let end = -1;
    for (let index = start + 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (EMBED_END_RE.test(trimmed)) {
        end = index;
        break;
      }
      if (BLOCK_BREAK_RE.test(trimmed)) break;
    }
    if (end < 0) continue;

    embedStartLines.add(start);
    for (let index = start + 1; index < end; index += 1) {
      if (/^\s*>/.test(lines[index])) continue;
      lines[index] = lines[index].trim().length === 0
        ? ">"
        : `> ${lines[index]}`;
    }

    // The <embed id=...> line is an internal boundary marker. Keep one source
    // line in the preview input so line maps remain aligned, but render it as an
    // empty quoted line instead of exposing the marker to Markdown/HTML output.
    lines[end] = ">";
    start = end;
  }

  return {
    markdown: lines.join("\n"),
    embedStartLines,
  };
}
