# Chapter 5 revision bound to v3.1 evidence

The revised DOCX updates Chapter 5 (5.1–5.6), including eleven tables (3–13).
Other chapters retain their supplied draft content. CJK family names are made
explicit for rendering, table paragraphs are detached from the body text grid,
and trailing empty paragraphs are removed. The original input is unchanged.

`paper85-section5-claims.json` binds the input DOCX, generator, sealed run,
historical v2.1 input files, output DOCX, paragraph sources and table cells.
The source input SHA-256 is
`1515cd7f87995759b4a2f047aa314e23aae9cd378e25ae80b5790a446fca252e`.
The generator rejects another input until its indexed edits have been reviewed.

From the repository root:

```sh
python tools/revise-paper85-section5.py /path/to/original-v11-Section5.docx docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac docs/manuscript/paper85-v3.1/From_Tokenization_to_Lifecycle_Execution_v11_Section5_Revised.docx
```

Use python-docx 1.2.0 and the bundled document renderer for visual QA. The local
headless renderer requires Songti SC / Heiti SC fonts on its font search path;
the fonts themselves are supplied by macOS and are not redistributed here.
The rendering intermediates are intentionally excluded from the deliverable.

The manuscript is explicit about simulated rejections, the post-review NAV
criterion, case-policy assumptions, sequential scale limits, current host and
rebuild deployment gas. It does not claim expert validation, production
operation, complete legal applicability, or per-operation history independence.
