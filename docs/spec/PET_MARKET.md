# Pet Market

The Market tab is part of the built-in `dsh-tauri-pet` React/TypeScript plugin. It uses the existing Desktop theme and locale. The installer contains the interface and catalog endpoint only; no pet artwork, previews, or archives are bundled. There is no default pet and no catalog request during startup.

Catalog: `https://seuwanglab.com/downloads/wanglab-harness/pets/catalog.json`

Opening Market fetches the catalog through the native bridge. Download checks the archive size and SHA-256 before atomically installing into `$DSH_HOME/pets/<id>`. Existing pets are preserved. Downloads continue after leaving settings; progress resumes when Market opens again. Enable selects the installed pet through the existing render-status handshake.

Both sprite layouts are supported: v1 has 8 columns and 9 rows; v2 has 8 columns and 11 rows. Unmarked original packages are inferred from image dimensions. Author names appear on cards; original attribution and license files remain in downloaded archives.

## Maintain the Library

The ordered source list is `marketplace/pets/sources.json`. No popularity or date sorting is applied. To prepare the server library, install Node.js 22+, `unzip`, `zip`, and FFmpeg with `libwebp_anim`, then run from this repository:

```bash
node scripts/prepare-pet-market.mjs
```

Source downloads are cached in `../release-packages/pet-market-source`. The generated catalog, packages, animated previews, and `SHA256SUMS` go into `../release-packages/site-staging-pets`. They are outside the repository and installer resource directories. Update the cached original ZIP and metadata together when reviewing a new source revision.

Serve the generated `downloads/wanglab-harness/pets` tree as static HTTPS files. Asset directories use content-derived revisions. Publish and verify assets first, then replace `catalog.json` atomically, keeping a backup. Preserve old asset revisions for clients with cached catalogs. The existing site's static downloads configuration is sufficient; no API service is required.

Catalog schema version 1 is defined in `src-tauri/src/bridge/pet_market.rs`. Asset URLs must be HTTPS under the catalog's own `/downloads/wanglab-harness/pets/` origin and path. JSON is limited to 1 MiB, archives to 32 MiB, and the native catalog cache lasts five minutes. The Refresh button bypasses that cache.

## Verification

Run the repository lint, typechecks, tests, and build. The Windows workflow also verifies upgrade readiness and native v1/v2 pet rendering. To validate the four original ZIPs and their adapted packages with the Rust installer:

```bash
WANGLAB_PET_FIXTURES="$(realpath ../release-packages)" \
  cargo test --manifest-path src-tauri/Cargo.toml --lib \
  market_original_and_adapted_packages_install -- --ignored --nocapture
```
