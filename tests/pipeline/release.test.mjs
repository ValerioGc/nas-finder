import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { addChangelogEntry, extractChangelog } from '../../scripts/pipeline/extract-changelog.cjs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const verifier = fileURLToPath(
  new URL('../../scripts/pipeline/verify_release.mjs', import.meta.url),
);

test('extracts the current changelog section', () => {
  assert.match(
    extractChangelog(version),
    new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`),
  );
  assert.throws(() => extractChangelog('999.999.999'), /No changelog entry/);
});

test('accepts matching release metadata and rejects a mismatched tag', () => {
  const valid = spawnSync(process.execPath, [verifier, `v${version}`], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);

  const invalid = spawnSync(process.execPath, [verifier, 'v999.999.999'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /expected 999\.999\.999/);
});

test('rejects a Cargo version with a missing closing quote without reading the next line', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'nas-finder-release-metadata-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, 'backend'));
  for (const file of ['package.json', 'package-lock.json', 'backend/tauri.conf.json']) {
    copyFileSync(file, join(project, file));
  }

  for (const newline of ['\n', '\r\n']) {
    writeFileSync(
      join(project, 'backend/Cargo.toml'),
      `[package]${newline}version = "${version}${newline}edition = "2021"${newline}`,
    );
    const result = spawnSync(process.execPath, [verifier, `v${version}`], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /backend\/Cargo\.toml has no valid package version/);
    assert.doesNotMatch(result.stderr, /edition/);
  }
});

test('adds the new version section from the commits since the last tag', () => {
  const changelog = '# Changelog\n\n## [0.1.1]\n\n### Added\n\n- First release.\n';
  const updated = addChangelogEntry(changelog, '0.1.2', [
    'feat: add zoom presets',
    'fix(viewer): keep the crop inside the image',
    'test: cover the release script',
    'chore: release v0.1.1',
    'wip',
  ]);

  assert.equal(
    updated,
    '# Changelog\n\n## [0.1.2]\n\n### Added\n\n- Add zoom presets.\n\n### Fixed\n\n' +
      '- Keep the crop inside the image.\n\n### Changed\n\n- Cover the release script.\n\n' +
      '## [0.1.1]\n\n### Added\n\n- First release.\n',
  );
  assert.equal(addChangelogEntry(updated, '0.1.2', ['feat: again']), updated);
});

test('renames an unreleased section instead of adding a new one', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n- Pending.\n\n## [0.1.1]\n';
  assert.equal(
    addChangelogEntry(changelog, '0.1.2', ['feat: ignored']),
    '# Changelog\n\n## [0.1.2]\n\n- Pending.\n\n## [0.1.1]\n',
  );
});
