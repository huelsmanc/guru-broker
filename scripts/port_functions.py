"""One-time port of base44/functions/*/entry.ts into server/functions/*.ts.
The logic is left untouched; only the Base44/Deno plumbing is swapped."""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'base44/functions'); DST = os.path.join(ROOT, 'server/functions')
DROP = {'deleteDocusealEnvelope','docusealCreateEnvelope','docusealDownloadDocument','docusealGetEnvelope',
        'docusealPublicSign','docusealSendSubmission','docusealWebhookHandler','generateDocusealBuilderToken'}
ported = []
for name in sorted(os.listdir(SRC)):
    if name in DROP: continue
    s = open(os.path.join(SRC, name, 'entry.ts')).read()
    s = re.sub(r"from ['\"]npm:@base44/sdk@[\d.]+['\"]", "from '../lib/base44.js'", s)
    s = re.sub(r"from ['\"]npm:(@?[^@'\"]+)@[\d.]+(/[^'\"]*)?['\"]", lambda m: f"from '{m.group(1)}{m.group(2) or ''}'", s)
    n = s.count('Deno.serve(')
    if n != 1: sys.exit(f'{name}: expected one Deno.serve, found {n}')
    s = s.replace('Deno.serve(', 'export default (', 1)
    header = f"// Ported from Base44 function `{name}`. Logic unchanged.\n"
    open(os.path.join(DST, f'{name}.js'), 'w').write(header + s)
    ported.append(name)
print(len(ported), 'ported')
