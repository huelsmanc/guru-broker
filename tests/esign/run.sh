#!/usr/bin/env bash
# End-to-end e-sign test: send -> sign in order -> signed PDF -> emails, with an
# in-memory database and fake email. Run: npm run test:esign
set -euo pipefail
cd "$(dirname "$0")"
rm -rf .build && mkdir -p .build/node_modules/@supabase/supabase-js
cp fake-supabase/index.js .build/node_modules/@supabase/supabase-js/index.js
echo '{"name":"@supabase/supabase-js","type":"module","main":"index.js"}' > .build/node_modules/@supabase/supabase-js/package.json
ln -s "$(cd ../.. && pwd)/node_modules/pdf-lib" .build/node_modules/pdf-lib
ln -s "$(cd ../.. && pwd)/node_modules/node-forge" .build/node_modules/node-forge
# Legacy PDF helpers are not exercised here; stub them so the bundle loads.
mkdir -p .build/node_modules/pdfjs-dist/build .build/node_modules/jspdf
echo 'export default {};' > .build/node_modules/pdfjs-dist/build/pdf.js
echo 'export class jsPDF {} export default jsPDF;' > .build/node_modules/jspdf/index.js
echo '{"name":"jspdf","type":"module","main":"index.js"}' > .build/node_modules/jspdf/package.json
echo '{"name":"pdfjs-dist","type":"module"}' > .build/node_modules/pdfjs-dist/package.json
npx esbuild "../../api/fn/[name].js" --bundle --packages=external --platform=node --format=esm --outfile=.build/fn.mjs --log-level=error
npx esbuild ../../api/file.js --bundle --packages=external --platform=node --format=esm --outfile=.build/file.mjs --log-level=error
npx esbuild ../../server/lib/importers.js --bundle --packages=external --platform=node --format=esm --outfile=.build/importers.mjs --log-level=error
cp flow.test.mjs esign2.test.mjs ai.test.mjs mls.test.mjs backoffice.test.mjs chat.test.mjs marketing.test.mjs files.test.mjs import.test.mjs twostep.test.mjs streetview.test.mjs leaderboardfn.test.mjs roleplay.test.mjs intake.test.mjs gearstore.test.mjs dealdelete.test.mjs payoutvoid.test.mjs clientportal.test.mjs sample.pdf sig.png .build/
node .build/flow.test.mjs
node .build/esign2.test.mjs
node .build/ai.test.mjs
node .build/mls.test.mjs
node .build/backoffice.test.mjs
node .build/chat.test.mjs
node .build/marketing.test.mjs
node .build/files.test.mjs
node .build/import.test.mjs
node .build/twostep.test.mjs
node .build/streetview.test.mjs
node .build/leaderboardfn.test.mjs
node .build/roleplay.test.mjs
node .build/intake.test.mjs
node .build/gearstore.test.mjs
node .build/dealdelete.test.mjs
node .build/payoutvoid.test.mjs
node .build/clientportal.test.mjs
node ../entities.test.mjs
node ../commission.test.mjs
node ../dealTimeline.test.mjs
node ../push.test.mjs
