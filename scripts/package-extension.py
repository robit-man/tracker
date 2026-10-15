#!/usr/bin/env python3
"""Reproducible unsigned browser packages. --check verifies committed assets."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ('protocol.js', 'background.js', 'content.js', 'popup.html', 'popup.js', 'README.md', 'install.html')


def packages():
    source = json.loads((ROOT / 'extension/manifest.json').read_text())
    outputs = {}
    metadata = {'version': source['version'], 'signed': False, 'packages': {}}
    for browser in ('chromium', 'firefox'):
        manifest = json.loads(json.dumps(source))
        if browser == 'chromium':
            manifest.pop('browser_specific_settings')
            manifest['background'] = {'service_worker': 'background.js'}
        else:
            manifest.pop('minimum_chrome_version')
            manifest['background'] = {'scripts': ['protocol.js', 'background.js']}
        contents = {name: (ROOT / 'extension' / name).read_bytes() for name in FILES}
        contents['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(contents.items()):
                entry = zipfile.ZipInfo(name, (2026, 10, 15, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o644 << 16
                archive.writestr(entry, data)
        name = f'tracker-storage-{browser}.zip'
        outputs[name] = buffer.getvalue()
        metadata['packages'][browser] = {'file': name, 'bytes': len(outputs[name]), 'sha256': hashlib.sha256(outputs[name]).hexdigest()}
    outputs['extension-packages.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
    return outputs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    directory = ROOT / 'downloads'
    for name, data in packages().items():
        destination = directory / name
        if args.check:
            if not destination.exists() or destination.read_bytes() != data:
                raise SystemExit(f'STALE: {destination}; run python3 scripts/package-extension.py')
        else:
            directory.mkdir(exist_ok=True)
            destination.write_bytes(data)
    print('PASS: browser packages match source' if args.check else 'Built unsigned Chromium and Firefox packages')
