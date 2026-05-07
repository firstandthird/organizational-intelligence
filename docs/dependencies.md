# Dependency Sources

## `ai-agent-framework`

This repository vendors `ai-agent-framework` as
`vendor/ai-agent-framework-0.1.0.tgz` so CI and deploys do not need direct
GitHub package or SSH access to the private framework source repository during
`npm ci`.

The current tarball was packed from:

- Repository: `firstandthird/agents`
- Commit: `8cc812e7db040d70eb3b35f481107ab4999b699e`
- Package version: `0.1.0`

To refresh it:

```sh
gh repo clone firstandthird/agents /tmp/oi-agents-src -- --depth 1
cd /tmp/oi-agents-src
npm ci
npm pack --pack-destination /path/to/organizational-intelligence/vendor
```

After replacing the tarball, run `npm install --package-lock-only` in this
repository and commit the updated tarball, `package.json`, and
`package-lock.json` together.
