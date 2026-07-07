const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    const admins = users.filter((u) =>
      ["admin", "superadmin", "owner"].includes((u.role || "").toLowerCase())
    );

    const moduleCounts = {
      trips: await prisma.trip.count(),
      payments: await prisma.payment.count(),
      clients: await prisma.client.count(),
      carriers: await prisma.carrier.count(),
    };

    const tableCountRows = await prisma.$queryRawUnsafe(
      "select count(*)::int as table_count from information_schema.tables where table_schema='public'"
    );

    console.log(
      JSON.stringify(
        {
          usersCount: users.length,
          adminsCount: admins.length,
          admins,
          moduleCounts,
          tableCount: tableCountRows?.[0]?.table_count ?? null,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
