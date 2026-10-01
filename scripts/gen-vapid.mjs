#!/usr/bin/env node
// Optional. The app makes its own push keys automatically. Use this only if you want to
// set them yourself (e.g. to keep the same keys across two Supabase projects):
//   node scripts/gen-vapid.mjs
// then add both values in Vercel -> Settings -> Environment Variables.
import { makeVapidKeys } from '../server/lib/push.js';
const k = makeVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
