# Releasing

The desktop app updates itself from **GitHub Releases**, not from this repo. Code
on `main` reaches nobody until it is inside a published release.

## The steps

```bash
node -e "const f='app/package.json',fs=require('fs');const j=JSON.parse(fs.readFileSync(f,'utf8'));j.version='0.1.9';fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
git commit -am "Bump to 0.1.9" && git push origin main
npm run release -w app
gh release edit v0.1.9 --draft=false
```

## Why that last line exists

**`electron-builder` publishes as a DRAFT by default, and `electron-updater`
cannot see drafts.** The build succeeds, the installer uploads, the release
appears on GitHub — and every installed app reports "up to date", because as far
as the update feed is concerned the release does not exist.

This has bitten us twice. It produces no error anywhere: the publish log says
`creating GitHub release`, the exit code is 0, and the failure only shows up as
users not receiving an update they were told to expect. **A release is not
shipped until `gh release list` shows it as `Latest` rather than `Draft`.**

Verify, every time:

```bash
gh release list --limit 3
```

## Other things worth knowing

- **Do not edit `package.json` with PowerShell's `Set-Content -Encoding utf8`.**
  It writes a BOM, which breaks vite. Use `node -e` as above.
- The engine is **staged** into `app/build/engine` by `scripts/stage-engine.mjs`
  before packaging. npm workspace hoisting means the top-level `engine/` folder
  does not contain its own `node_modules`, so pointing `extraResources` at
  `../engine` ships an app whose renderer cannot find `remotion`.
- Silent upgrade-in-place has hung before. Uninstalling first is the reliable
  path if an update refuses to apply.
