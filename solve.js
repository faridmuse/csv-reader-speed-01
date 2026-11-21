// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly what csv-reader 1.0.0 returns for every {text, header}:
// {columns, rows, errors}. Semantics (mirrored from the reference):
//   - U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next non-doubled quote ("" = one
//     quote, CRLF/lone CR inside read as LF); text after the closing quote up
//     to the next comma or line break is appended as-is (quote_junk, when the
//     field ends); a quote that never closes is a literal char and the text
//     after it is re-read as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is literal; fields stay strings;
//   - columns = first record when header, else null; rows padded with ""
//     (short_row) or cut (long_row) to the first record's width;
//   - errors {code, line, row} in the order met; line is the 1-based line the
//     record starts on, row its index in rows (null for the header).
//
// Speed: most records in the drawn sets are clean (no quotes, no stray CRs),
// so each record is first tried on a fast path — slice the line, split on
// commas — and only records holding a quote or a stray CR fall through to the
// exact field-by-field reader below. Both paths push identical errors.

const RE_UNQUOTED = /[,\r\n]/g;
const RE_QUOTED = /["\r\n]/g;

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns {value, ended, added}; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      let i = pos;
      while (i < n) {
        const cc = text.charCodeAt(i);
        if (cc === 44 || cc === 10 || cc === 13) break;
        i++;
      }
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      if (i >= n) {
        pos = n;
        return { value, ended: END, added };
      }
      const c = text[i];
      if (c === ',') {
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === '\n') {
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // '\r'
      if (text[i + 1] === '\n') {
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error('stray_cr');
      pos = i + 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      let i = pos;
      while (i < n) {
        const cc = text.charCodeAt(i);
        if (cc === 34 || cc === 10 || cc === 13) break;
        i++;
      }
      if (i > pos) value += text.slice(pos, i);
      if (i >= n) {
        pos = n;
        break;
      }
      const c = text[i];
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          pos = i + 2;
          continue;
        }
        pos = i + 1;
        closed = true;
        break;
      }
      if (c === '\r') {
        // CRLF and a lone CR inside quotes are each one LF.
        value += '\n';
        line += 1;
        pos = text[i + 1] === '\n' ? i + 2 : i + 1;
        continue;
      }
      // '\n'
      line += 1;
      value += '\n';
      pos = i + 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Finishes a record: header, padding/cutting, and the rows push.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record runs to the next LF (or the end). When the slice holds no quote and no CR
    // (or only the CR of a CRLF ending), it is a plain comma-split record.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    const seg = text.slice(pos, end);
    if (seg.indexOf('"') === -1) {
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        const fields = seg.split(',');
        pos = nl === -1 ? n : nl + 1;
        if (nl !== -1) line += 1;
        if (!(fields.length === 1 && fields[0] === '')) finishRecord(fields);
        continue;
      }
      if (ri === seg.length - 1 && nl !== -1) {
        const fields = seg.slice(0, -1).split(',');
        pos = nl + 1;
        line += 1;
        if (!(fields.length === 1 && fields[0] === '')) finishRecord(fields);
        continue;
      }
      // A stray CR inside the record: the slow path.
    }

    // Slow path: field by field, exactly as the reference reads them.
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text[pos] === '"';
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
