<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Commits and pull requests are public

This repository is public. Anything written into a commit message, a pull request
body, or a code comment is world-readable and permanent.

Do not put Claude Code session links in commit messages or pull request bodies.
They are noise to every reader but the one person who can open them.
`Co-Authored-By:` attribution is fine.

Claude Code has a setting for this, which is more reliable than remembering:

```json
{ "attribution": { "sessionUrl": false } }
```

Put it in `~/.claude/settings.json` to cover every project, or in this repo's
`.claude/settings.json` to bind anyone who clones it. This note exists for the
case where neither is set.
