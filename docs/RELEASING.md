# Maintainer: publish a release

The GitHub Actions release workflow tests and packages the extension whenever a version tag beginning with `v` is pushed. A maintainer can also run it manually by selecting the version tag under **Actions → Release → Run workflow**. Before publishing, it verifies that the tag matches `package.json` and `manifest.json` `version_name`, and that the numeric base version matches `manifest.json` `version`. Chromium requires the manifest `version` field to contain only one to four dot-separated integers; prerelease text belongs in `version_name`.

1. Review `README.md`, `README.de.md`, `CHANGELOG.md`, and the version in `package.json` and `manifest.json`.
2. Run local checks from the repository root:

   ```sh
   npm run check
   npm test
   ```

3. Commit and push the release-ready branch to GitHub.
4. Create and push a tag matching the package version exactly. For the current `0.6.0-beta.2` prerelease:

   ```sh
   git tag v0.6.0-beta.2
   git push origin v0.6.0-beta.2
   ```

   For a different beta or release candidate, set the full prerelease version in `package.json`, `manifest.json` `version_name`, the UI/export version and the documentation. Keep `manifest.json` `version` at the numeric base (for example `0.6.0`) and tag it with the full version (for example `v0.6.1-beta.1`).
5. The workflow creates a GitHub Release with a ZIP asset. Tags containing a hyphen (for example, `v0.6.0-beta.2`) create a pre-release; a plain tag such as `v0.6.0` creates a stable release. Verify the workflow and release page before announcing it.

## Security notes

- Keep repository and workflow permissions minimal. The release job needs `contents: write` only to create a release.
- Never commit `node_modules`, local `.env` files, or mixer credentials.
- Mixer control happens through the browser website. Review requested host permissions carefully and never commit private mixer credentials.
