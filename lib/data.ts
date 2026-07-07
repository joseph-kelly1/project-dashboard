import { redis } from "./redis";
import type {
  Project,
  Service,
  SharedSubscription,
  StripeAccount,
} from "./types";

// Key scheme (per BUILD_BRIEF):
//   project:<id>            Project JSON
//   service:<id>            Service JSON
//   subscription:<id>       SharedSubscription JSON
//   stripeAccount:<id>      StripeAccount JSON
//   index:projects          set of project ids
//   index:subscriptions     set of subscription ids
//   index:stripeAccounts    set of stripe account ids
//   project:<id>:services   set of service ids
// Redis enforces nothing; every relationship rule lives in actions.ts.

async function mgetJson<T>(keys: string[]): Promise<T[]> {
  if (keys.length === 0) return [];
  const values = await redis().mget<(T | null)[]>(...keys);
  return values.filter((v): v is T => v !== null);
}

export async function listProjects(): Promise<Project[]> {
  const ids = await redis().smembers("index:projects");
  const projects = await mgetJson<Project>(ids.map((id) => `project:${id}`));
  return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getProject(id: string): Promise<Project | null> {
  return redis().get<Project>(`project:${id}`);
}

export async function saveProject(p: Project): Promise<void> {
  await redis().set(`project:${p.id}`, p);
  await redis().sadd("index:projects", p.id);
}

export async function listServices(projectId: string): Promise<Service[]> {
  const ids = await redis().smembers(`project:${projectId}:services`);
  const services = await mgetJson<Service>(ids.map((id) => `service:${id}`));
  return services.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

export async function getService(id: string): Promise<Service | null> {
  return redis().get<Service>(`service:${id}`);
}

export async function saveService(s: Service): Promise<void> {
  await redis().set(`service:${s.id}`, s);
  await redis().sadd(`project:${s.projectId}:services`, s.id);
}

export async function deleteService(s: Service): Promise<void> {
  await redis().del(`service:${s.id}`);
  await redis().srem(`project:${s.projectId}:services`, s.id);
}

// Cascade: services go with the project. Shared-subscription splits need no
// cleanup — they are always computed live from current data, never stored.
export async function deleteProjectCascade(id: string): Promise<void> {
  const serviceIds = await redis().smembers(`project:${id}:services`);
  if (serviceIds.length)
    await redis().del(...serviceIds.map((sid) => `service:${sid}`));
  await redis().del(`project:${id}:services`, `project:${id}`);
  await redis().srem("index:projects", id);
}

export async function listSubscriptions(): Promise<SharedSubscription[]> {
  const ids = await redis().smembers("index:subscriptions");
  const subs = await mgetJson<SharedSubscription>(
    ids.map((id) => `subscription:${id}`),
  );
  return subs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSubscription(
  id: string,
): Promise<SharedSubscription | null> {
  return redis().get<SharedSubscription>(`subscription:${id}`);
}

export async function saveSubscription(s: SharedSubscription): Promise<void> {
  await redis().set(`subscription:${s.id}`, s);
  await redis().sadd("index:subscriptions", s.id);
}

export async function deleteSubscription(id: string): Promise<void> {
  await redis().del(`subscription:${id}`);
  await redis().srem("index:subscriptions", id);
}

export async function listStripeAccounts(): Promise<StripeAccount[]> {
  const ids = await redis().smembers("index:stripeAccounts");
  const accounts = await mgetJson<StripeAccount>(
    ids.map((id) => `stripeAccount:${id}`),
  );
  return accounts.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getStripeAccount(
  id: string,
): Promise<StripeAccount | null> {
  return redis().get<StripeAccount>(`stripeAccount:${id}`);
}

export async function saveStripeAccount(a: StripeAccount): Promise<void> {
  await redis().set(`stripeAccount:${a.id}`, a);
  await redis().sadd("index:stripeAccounts", a.id);
}

export async function deleteStripeAccount(id: string): Promise<void> {
  await redis().del(`stripeAccount:${id}`);
  await redis().srem("index:stripeAccounts", id);
}

export interface AllData {
  projects: Project[];
  servicesByProject: Map<string, Service[]>;
  subscriptions: SharedSubscription[];
  stripeAccounts: StripeAccount[];
}

// Data volume is tiny; load everything and compute in memory (per spec).
export async function loadAll(): Promise<AllData> {
  const [projects, subscriptions, stripeAccounts] = await Promise.all([
    listProjects(),
    listSubscriptions(),
    listStripeAccounts(),
  ]);
  const serviceLists = await Promise.all(
    projects.map((p) => listServices(p.id)),
  );
  const servicesByProject = new Map(
    projects.map((p, i) => [p.id, serviceLists[i]]),
  );
  return { projects, servicesByProject, subscriptions, stripeAccounts };
}
