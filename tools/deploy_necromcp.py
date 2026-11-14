#!/usr/bin/env python3
"""Push NecroMCP Phase 3 files to fhria5/necromcp and enable GitHub Pages.
Uses the stored custom.github credential via the vault surrogate.
Run: python3 tools/deploy_necromcp.py
"""
import base64
import json
import sys
import urllib.request
import urllib.error

sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
import dynamic_credentials

OWNER, REPO, BRANCH = 'fhria5', 'necromcp', 'main'
BASE = '/home/hatch/workspace/necromcp/'
# Pages serves from /docs (GitHub Pages only allows '/' or '/docs' as source).
# docs/ is a build artifact: a verbatim copy of public/, regenerated each deploy.
FILES = [
    '.nojekyll',
    'README.md',
    'rencana-per-phase.md',
    'package.json',
    'tsconfig.json',
    'src/types/necro.ts',
    'src/engine/parser.ts',
    'src/engine/synthesizer.ts',
    'src/engine/translator.ts',
    'src/engine/simulator.ts',
    'src/engine/sentinel.ts',
    'src/engine/hitl.ts',
    'src/engine/exorcist-pbt.ts',
    'src/server.ts',
    'public/index.html',
    'public/styles.css',
    'public/app.js',
    'docs/index.html',
    'docs/styles.css',
    'docs/app.js',
    'tests/parser.test.ts',
    'tests/parser-sql.test.ts',
    'tests/parser-cobol.test.ts',
    'tests/translator.test.ts',
    'tests/translator-sql.test.ts',
    'tests/translator-cobol.test.ts',
    'tests/simulator.test.ts',
    'tests/simulator-phase2.test.ts',
    'tests/synthesizer.test.ts',
    'tests/sentinel.test.ts',
    'tests/hitl.test.ts',
    'tests/server.test.ts',
    'tests/exorcist.test.ts',
    'tests/exorcism-browser.test.ts',
    'tests/exorcise-server.test.ts',
    'tests/browser-engine.test.ts',
    'tests/e2e-phase2.cjs',
    'tests/e2e-phase3.cjs',
    'tools/deploy_necromcp.py',
    '.kiro/specs/necro-engine/tasks.md',
]


def req(method, path, body=None):
    r = urllib.request.Request(
        'https://api.github.com' + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Accept': 'application/vnd.github+json',
                 'Content-Type': 'application/json'},
    )
    dynamic_credentials.add_surrogate_to_request(
        r, 'custom.github', allowed_hosts=['api.github.com'])
    try:
        with urllib.request.urlopen(r) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, path, e.read().decode()[:300])
        raise


# 0. Regenerate docs/ (Pages artifact) from public/
import os
import shutil
os.makedirs(BASE + 'docs', exist_ok=True)
for _f in ('index.html', 'styles.css', 'app.js'):
    shutil.copyfile(BASE + 'public/' + _f, BASE + 'docs/' + _f)
print('docs/ regenerated from public/')

# 1. Repo exists?
repo = req('GET', f'/repos/{OWNER}/{REPO}')
print('REPO EXISTS:', repo['full_name'], repo['html_url'])

# 2. Push files
for f in FILES:
    data = open(BASE + f, 'rb').read()
    try:
        cur = req('GET', f'/repos/{OWNER}/{REPO}/contents/{f}?ref={BRANCH}')
        sha = cur['sha']
    except urllib.error.HTTPError as e:
        if e.code == 404:
            sha = None
        else:
            raise
    body = {
        'message': 'NecroMCP Phase 3: PBT Exorcism + Demon Bug + Auto-Patch, deck UI',
        'content': base64.b64encode(data).decode(),
        'branch': BRANCH,
    }
    if sha:
        body['sha'] = sha
    req('PUT', f'/repos/{OWNER}/{REPO}/contents/{f}', body)
    print('OK', f)

# 3. Enable Pages (main, /docs)
try:
    pages = req('POST', f'/repos/{OWNER}/{REPO}/pages',
                {'source': {'branch': BRANCH, 'path': '/docs'}})
    print('PAGES ENABLED:', pages.get('html_url'))
except urllib.error.HTTPError as e:
    if e.code == 409:
        pages = req('GET', f'/repos/{OWNER}/{REPO}/pages')
        print('PAGES ALREADY ON:', pages.get('html_url'))
    else:
        raise

print('DEPLOY-DONE')
