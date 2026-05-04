import webpush from "web-push";

// Generate a VAPID keypair and print env-var lines for .env. Run once at
// install or rotate-time:
//
//   npx tsx server/scripts/generate-vapid.ts
//
// Append the printed lines to .env (or set them in your deployment env).

const keys = webpush.generateVAPIDKeys();
process.stdout.write(`VAPID_PUBLIC_KEY=${keys.publicKey}\n`);
process.stdout.write(`VAPID_PRIVATE_KEY=${keys.privateKey}\n`);
process.stdout.write(`VAPID_SUBJECT=mailto:guardians@example.org\n`);
