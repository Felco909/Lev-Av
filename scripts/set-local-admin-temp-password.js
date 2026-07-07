const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ADMIN_EMAIL = "john@doe.com";
const TEMP_PASSWORD = "LevAV@2026Temp!";

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
  }

  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);

  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { passwordHash },
  });

  console.log(
    JSON.stringify(
      {
        email: ADMIN_EMAIL,
        tempPassword: TEMP_PASSWORD,
        role: admin.role,
        updated: true,
      },
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
