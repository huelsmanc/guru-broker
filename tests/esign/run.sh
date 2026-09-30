#!/usr/bin/env bash
# End-to-end e-sign test: send -> sign in order -> signed PDF -> emails, with an
# in-memory database and fake email. Run: npm run test:esign
set -euo pipefail
cd "$(dirname "$0")"
rm -rf .build && mkdir -p .build/node_modules/@supabase/supabase-js
cp fake-supabase/index.js .build/node_modules/@supabase/supabase-js/index.js
echo '{"name":"@supabase/supabase-js","type":"module","main":"index.js"}' > .build/node_modules/@supabase/supabase-js/package.json
for dep in pdf-lib jspdf pdfjs-dist; do ln -s "$(cd ../.. && pwd)/node_modules/$dep" .build/node_modules/$dep; done
npx esbuild "../../api/fn/[name].js" --bundle --packages=external --platform=node --format=esm --outfile=.build/fn.mjs --log-level=error
cp flow.test.mjs ai.test.mjs mls.test.mjs sample.pdf sig.png .build/
node .build/flow.test.mjs
node .build/ai.test.mjs
node .build/mls.test.mjs
node ../entities.test.mjs
