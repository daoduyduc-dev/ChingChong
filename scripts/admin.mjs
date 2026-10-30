import "../server/env.mjs";
import { PrismaClient } from "@prisma/client";
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/admin.mjs <registered-email>");
  process.exit(1);
}
const db = new PrismaClient();
const user = await db.user.findUnique({
  where: { email: email.toLowerCase() },
});
if (!user || user.deletedAt || user.status !== "ACTIVE") {
  console.error("Active registered account not found.");
  process.exitCode = 1;
} else {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await tx.audit.create({
      data: {
        actor: "local-operator",
        action: "ADMIN_BOOTSTRAP",
        entityId: user.id,
      },
    });
  });
  console.log("Admin role granted. Sign in again to refresh role.");
}
await db.$disconnect();
