---
name: Large single-file HTML app edit corruption
description: Why sequential Edit-tool calls on this project's index.html silently corrupted it twice, and the workflow that avoids it.
---

Repeated sequential `Edit` tool calls against a single large HTML file (1000+ lines, containing both markup and a large inline `<script>` with big embedded JSON blobs) produced silent corruption twice across different work sessions on this project: fragments of one section spliced into the middle of another (e.g. a stray `</html>` landing inside a JS string literal deep in a function body), plus duplicated function blocks. The failures were not caught immediately because the file still had valid-looking structure nearby.

**Why:** old_string matches that are technically unique can still land at a slightly wrong position when the file has long, near-repetitive or minified blocks (e.g. giant embedded JSON), and multiple edits applied in sequence compound the risk — each edit changes line offsets the next one implicitly assumes.

**How to apply:** for any multi-part change to this kind of file, write ONE atomic Node/JS script that reads the file, applies all replacements with a helper that asserts `old_string` occurs exactly once before replacing (throw otherwise), then writes the result once. After writing, verify structural integrity before moving on: syntax-check the inline script (e.g. `new Function(scriptText)`), confirm exactly one closing tag of each kind (`</html>`, `</body>`), and grep for known function/section names to confirm no duplicates. If corruption is ever found, don't try to patch it — restore the file from the last known-good git commit and redo the change as one atomic script.
