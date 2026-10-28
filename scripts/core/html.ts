// HTML and JSON escaping shared by every template and the shell.

export const escHtml = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Safe inside a <script type="application/json"> block — a file body or graph
// label can never break out of the script tag.
// `<` becomes \u003c, which JSON.parse reads back as `<`. Escaping only `</` is not enough: an embedded file
// holding `<!--` followed by `<script` puts the HTML parser in the "double escaped" state, where `</script>`
// no longer ends the block and everything after it, bundle included, is swallowed.
export const escJson = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

export const stripTags = (html: string) => String(html).replace(/<[^>]+>/g, " ");

export const escAttr = (s: string) => escHtml(s).replace(/"/g, "&quot;");
