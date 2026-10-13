// Run from a scheduler every minute. Each invocation resumes durable progress.
const appUrl = process.env.APP_URL;
const secret = process.env.CRON_SECRET;
if (!appUrl || !secret) throw new Error("Configura APP_URL y CRON_SECRET");
const response = await fetch(new URL("/api/cierre/sync", appUrl), {
  method: "POST", headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(180_000),
});
const result = await response.json();
console.log(JSON.stringify({ status: response.status, ...result }));
if (!response.ok) process.exitCode = 1;
