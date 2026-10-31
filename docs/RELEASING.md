# Maintainer: publish a beta release

The repository includes a GitHub Actions workflow that tests and packages a beta pre-release. It does not publish anything until a maintainer pushes a beta tag to the repository.

1. Review `README.md` and `CHANGELOG.md`, and verify that the beta version is appropriate.
2. Run local checks from the repository root:

   ```sh
   npm run check
   npm test
   ```

3. Commit the files and push the branch to the GitHub repository.
4. Create and push a version tag matching `v*.*.*-beta*`, for example:

   ```sh
   git tag v0.5.0-beta.14
   git push origin v0.5.0-beta.14
   ```

5. The GitHub Actions workflow runs checks and creates a GitHub **pre-release** with a ZIP artifact. Check the workflow and release page before announcing it.
6. For a later beta, update `package.json`, the controller footer, and `CHANGELOG.md`, then tag the matching version (for example `v0.5.0-beta.14`). The Chrome manifest version must remain a three-part numeric version (`0.5.0`) because Chrome requires a three-part numeric version in the manifest field.

## Security notes

- Keep repository and workflow permissions minimal. The release job needs `contents: write` only to create a release.
- Never commit `node_modules`, local `.env` files, or mixer credentials.
- Mixer control happens through the browser website. Review requested host permissions carefully and never commit private mixer credentials.
