// New: Apple's "apple-app-site-association" file, served at /.well-known/apple-app-site-association
// (see vercel.json). It tells iPhones that gurubroker.app links may open in the Guru Broker app,
// and lets iCloud Keychain fill saved passwords in the app. Needs APPLE_TEAM_ID (or APNS_TEAM_ID)
// and APNS_BUNDLE_ID in Vercel; until then it lists no app, which is harmless.
export default async () => {
  const team = process.env.APPLE_TEAM_ID || process.env.APNS_TEAM_ID;
  const appId = team ? `${team}.${process.env.APNS_BUNDLE_ID || 'app.gurubroker.ios'}` : null;
  const body = {
    applinks: {
      details: appId ? [{
        appIDs: [appId],
        components: [
          { '/': '/api/*', exclude: true },
          { '/': '/portal*', exclude: true },  // client portal stays in the browser (clients don't have the app)
          { '/': '/sign*', exclude: true },    // signing links for clients too
          { '/': '/custom-sign*', exclude: true },
          { '/': '/review*', exclude: true },
          { '/': '/status*', exclude: true },
          { '/': '/verify*', exclude: true },
          { '/': '/*' },
        ],
      }] : [],
    },
    webcredentials: { apps: appId ? [appId] : [] },
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
};
