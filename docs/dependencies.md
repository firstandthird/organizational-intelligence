# Dependency Sources

## `ai-agent-framework`

This repository vendors `ai-agent-framework` as
`vendor/ai-agent-framework-0.2.0.tgz` so CI and deploys do not need direct
GitHub package or SSH access to the private framework source repository during
`npm ci`.

The current tarball was packed from:

- Repository: `firstandthird/agents`
- Branch: `feature-mcp-prompt-providers`
- Commit: `698b343ba6dcaf0fc17bfadca7d84b696b5ad959`
- Package version: `0.2.0`

To refresh it:

```sh
gh repo clone firstandthird/agents /tmp/oi-agents-src -- --depth 1
cd /tmp/oi-agents-src
git fetch origin feature-mcp-prompt-providers
git switch feature-mcp-prompt-providers
npm ci
npm pack --pack-destination /path/to/organizational-intelligence/vendor
```

After replacing the tarball, run `npm install --package-lock-only` in this
repository and commit the updated tarball, `package.json`, and
`package-lock.json` together.
