'use strict';

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.GCLOUD_PROJECT || 'aurorafall-4cfc5';
const email = process.argv[2];
if (!email) {
  console.error('Usage: node functions/set-admin.cjs you@example.com');
  process.exit(1);
}

initializeApp({ projectId, credential: applicationDefault() });

(async () => {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  console.log(`Granted admin to ${email} (${user.uid}). Sign out and back in to refresh the ID token.`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
