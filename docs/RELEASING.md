# Maintainer: publish a release

The GitHub Actions release workflow tests and packages the extension whenever a version tag beginning with `v` is pushed. A maintainer can also run it manually by selecting the version tag under **Actions → Release → Run workflow**. Before publishing, it verifies that the tag, `package.json`, and `manifest.json` versions match.

1. Review `README.md`, `README.de.md`, `CHANGELOG.md`, and the version in `package.json` and `manifest.json`.
2. Run local checks from the repository root:

   ```sh
   npm run check
   npm test
   ```

3. Commit and push the release-ready branch to GitHub.
4. Create and push a tag matching the version exactly. For the stable 0.6.0 release:

   ```sh
   git tag v0.6.0
   git push origin v0.6.0
   ```

   For a beta or release candidate, use a matching prerelease version in all version files and a tag such as `v0.6.1-beta.1`.
5. The workflow creates a GitHub Release with a ZIP asset. Tags containing a hyphen (for example, `v0.6.1-beta.1`) create a pre-release; a plain tag such as `v0.6.0` creates a stable release. Verify the workflow and release page before announcing it.

## Security notes

- Keep repository and workflow permissions minimal. The release job needs `contents: write` only to create a release.
- Never commit `node_modules`, local `.env` files, or mixer credentials.
- Mixer control happens through the browser website. Review requested host permissions carefully and never commit private mixer credentials.
