import request from "supertest";

export async function registerAndLogin(
  app: Parameters<typeof request>[0],
  data: { username: string; email: string; password: string },
  fixtureIp?: string,
) {
  const registration = request(app).post("/api/auth/register");
  if (fixtureIp) registration.set("X-Forwarded-For", fixtureIp);
  const registered = await registration.send(data);
  if (registered.status !== 200)
    throw Error("Test account registration failed: " + registered.status);
  const login = request(app).post("/api/auth/login");
  if (fixtureIp) login.set("X-Forwarded-For", fixtureIp);
  return login.send({
    identifier: data.username,
    password: data.password,
  });
}
