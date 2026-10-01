#!/usr/bin/env node
// Makes the key pair for phone/desktop push notifications. Run once:
//   node scripts/gen-vapid.mjs
// then add both values in Vercel -> Settings -> Environment Variables.
import { makeVapidKeys } from '../server/lib/push.js';
const k = makeVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
