import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
const subject =
  String(process.env.WEB_PUSH_SUBJECT || "").trim() ||
  "mailto:admin@conectamos.app";

console.log("Claves VAPID nuevas (guardalas como variables de Railway):");
console.log(`WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${keys.privateKey}`);
console.log(`WEB_PUSH_SUBJECT=${subject}`);
console.log(
  "Este comando solo imprime las claves; no modifica archivos ni variables."
);
