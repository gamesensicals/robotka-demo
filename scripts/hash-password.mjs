// Vytvorí Argon2id hash hesla pre WEBMASTER_PASSWORD_HASH v .env.
// Použitie:  npm run hash-password            (heslo sa opýta, nezobrazí sa)
//            npm run hash-password -- 'heslo' (heslo v príkaze – ostane v histórii shellu)
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { argon2id } from "hash-wasm";

async function ask() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes("Password")) process.stdout.write(s); };
  const answer = await new Promise((resolve) => rl.question("Webmaster password: ", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = process.argv[2] ?? (await ask());
if (!password || password.length < 12) {
  console.error("The password must be at least 12 characters.");
  process.exit(1);
}
const hash = await argon2id({ password, salt: randomBytes(16), parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: "encoded" });
console.log("\nPut this line into .env (base64, no $ characters):");
console.log(`WEBMASTER_PASSWORD_HASH=${Buffer.from(hash).toString("base64")}`);
console.log(`\n(the same hash in its original form: ${hash})`);
