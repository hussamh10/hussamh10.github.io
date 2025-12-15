# Markdown Snippets

Add lightweight narrative content for graph nodes here. For any node in
`graph-data.json`, set:

```json
"contentType": "markdown",
"markdownFile": "panels/markdown/example.md"
```

Then edit `panels/markdown/example.md` with regular Markdown. The site will pull
in the file automatically (with caching) and show it inside the detail panel.

