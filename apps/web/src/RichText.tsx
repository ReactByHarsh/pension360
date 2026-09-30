import { Fragment, type ReactNode } from "react";

// Small, dependency-free renderer for the Markdown subset Copilot returns:
// paragraphs, headings, bullet/numbered lists and pipe tables, plus **bold**,
// *italic* and `code`. It builds React elements only (never raw HTML).

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\s][^*]*\*(?!\w))/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyBase}-${index++}`;
    if (token.startsWith("**"))
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}
const isSeparator = (line: string) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) &&
  line.includes("-");
const isTableRow = (line: string) => line.includes("|") && line.trim().length > 1;

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h4 key={key++} className="rt-heading">
          {inline(heading[2], `h${key}`)}
        </h4>,
      );
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div className="rt-table-wrap" key={key++}>
          <table className="rt-table">
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{inline(cell, `th${key}-${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, c) => (
                    <td key={c}>{inline(row[c] ?? "", `td${key}-${r}-${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        let item = lines[i].replace(pattern, "");
        i++;
        // A wrapped continuation line belongs to the previous item.
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s{2,}\S/.test(lines[i]) &&
          !bullet.test(lines[i]) &&
          !numbered.test(lines[i])
        ) {
          item += ` ${lines[i].trim()}`;
          i++;
        }
        items.push(item);
      }
      const children = items.map((item, n) => (
        <li key={n}>{inline(item, `li${key}-${n}`)}</li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key++} className="rt-list">
            {children}
          </ol>
        ) : (
          <ul key={key++} className="rt-list">
            {children}
          </ul>
        ),
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1]))
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="rt-paragraph">
        {paragraph.map((p, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(p, `p${key}-${n}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}
