// Resets a user's password. Never hardcode credentials here — this file is in git.
// Usage (PowerShell):
//   $env:LEVAV_USER_EMAIL = "user@example.com"
//   $env:LEVAV_NEW_PASSWORD = "<new password>"   # omit to generate a random one
//   node scripts/set-local-admin-temp-password.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const EMAIL = process.env.LEVAV_USER_EMAIL;
const GENERATED = !process.env.LEVAV_NEW_PASSWORD;
const NEW_PASSWORD = process.env.LEVAV_NEW_PASSWORD || crypto.randomBytes(15).toString("base64url");

async function main() {
  if (!EMAIL) throw new Error("Set LEVAV_USER_EMAIL");
  if (NEW_PASSWORD.length < 12) throw new Error("Password must be at least 12 characters");

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`User not found: ${EMAIL}`);

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  await prisma.user.update({ where: { email: EMAIL }, data: { passwordHash } });

  console.log(
    JSON.stringify(
      { email: EMAIL, role: user.role, updated: true, ...(GENERATED ? { generatedPassword: NEW_PASSWORD } : {}) },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
