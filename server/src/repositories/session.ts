import { db } from "../database/db";

export function findSessionByRefreshHash(refreshHash: string) {
  return db.session.findUnique({ where: { refreshHash } });
}
export function revokeSession(id: string) {
  return db.session.update({ where: { id }, data: { revokedAt: new Date() } });
}
