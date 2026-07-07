"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { encrypt, keyHint } from "@/lib/crypto";
import {
  deleteProjectCascade,
  deleteService,
  deleteStripeAccount,
  deleteSubscription,
  getProject,
  getService,
  getStripeAccount,
  getSubscription,
  listProjects,
  listServices,
  loadAll,
  saveProject,
  saveService,
  saveStripeAccount,
  saveSubscription,
} from "@/lib/data";
import type { Cost, Project } from "@/lib/types";
import { CATEGORIES, CYCLES, LOGIN_METHODS, STATUSES } from "@/lib/types";
import {
  centsFromDollars,
  oneOf,
  optIsoDate,
  optStr,
  optUrl,
  reqStr,
  ValidationError,
} from "@/lib/validate";

export async function doSignIn(): Promise<void> {
  await signIn("github", { redirectTo: "/" });
}

export async function doSignOut(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}

// Every mutation: session required, validation errors surface as ?error=,
// anything else bubbles to the error boundary.
async function run(returnPath: string, fn: () => Promise<void>): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  let errorMessage: string | null = null;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    errorMessage = e.message;
  }
  if (errorMessage)
    redirect(`${returnPath}?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath("/", "layout");
  redirect(returnPath);
}

// Spec rule: when two or more projects point at the same Stripe account,
// every one of them must carry a revenueTag — otherwise attribution is
// ambiguous. Enforced on every project write, including the one that turns
// a sole account into a shared one.
async function assertRevenueTagRule(candidate: Project): Promise<void> {
  if (!candidate.stripeAccountId) return;
  const others = (await listProjects()).filter(
    (p) =>
      p.id !== candidate.id &&
      p.stripeAccountId === candidate.stripeAccountId,
  );
  if (others.length === 0) return;
  const missing = [...others, candidate]
    .filter((p) => !p.revenueTag)
    .map((p) => p.name);
  if (missing.length)
    throw new ValidationError(
      `That Stripe account is shared by ${others.length + 1} projects, so each needs a revenue tag. Missing on: ${missing.join(", ")}`,
    );
}

async function projectFromForm(fd: FormData, id: string, createdAt: string) {
  const stripeAccountId = optStr(fd.get("stripeAccountId"), "Stripe account", 100) || null;
  if (stripeAccountId && !(await getStripeAccount(stripeAccountId)))
    throw new ValidationError("That Stripe account no longer exists");
  const p: Project = {
    id,
    name: reqStr(fd.get("name"), "Name"),
    url: optUrl(fd.get("url"), "Link"),
    notes: optStr(fd.get("notes"), "Notes"),
    stripeAccountId,
    revenueTag: optStr(fd.get("revenueTag"), "Revenue tag", 100) || null,
    createdAt,
  };
  await assertRevenueTagRule(p);
  return p;
}

export async function createProject(fd: FormData): Promise<void> {
  await run("/", async () => {
    const p = await projectFromForm(fd, crypto.randomUUID(), new Date().toISOString());
    await saveProject(p);
  });
}

export async function updateProject(fd: FormData): Promise<void> {
  const id = reqStr(fd.get("id"), "Project id", 100);
  await run(`/projects/${id}`, async () => {
    const existing = await getProject(id);
    if (!existing) throw new ValidationError("Project not found");
    await saveProject(await projectFromForm(fd, id, existing.createdAt));
  });
}

export async function removeProject(fd: FormData): Promise<void> {
  await run("/", async () => {
    const id = reqStr(fd.get("id"), "Project id", 100);
    await deleteProjectCascade(id);
  });
}

async function costFromForm(fd: FormData): Promise<Cost> {
  const type = oneOf(fd.get("costType"), ["specific", "shared"] as const, "Cost source");
  if (type === "specific") {
    return {
      type,
      amountCents: centsFromDollars(fd.get("amount"), "Amount"),
      cycle: oneOf(fd.get("cycle"), CYCLES, "Billing cycle"),
    };
  }
  const subscriptionId = reqStr(fd.get("subscriptionId"), "Shared subscription", 100);
  if (!(await getSubscription(subscriptionId)))
    throw new ValidationError("That shared subscription no longer exists");
  return { type, subscriptionId };
}

async function serviceFromForm(
  fd: FormData,
  id: string,
  projectId: string,
  sortOrder: number,
) {
  const loginMethod = oneOf(fd.get("loginMethod"), LOGIN_METHODS, "Login method");
  return {
    id,
    projectId,
    sortOrder,
    name: reqStr(fd.get("name"), "Name"),
    url: optUrl(fd.get("url"), "Link"),
    loginMethod,
    loginOther: loginMethod === "other" ? optStr(fd.get("loginOther"), "Login details", 200) : "",
    category: oneOf(fd.get("category"), CATEGORIES, "Category"),
    status: oneOf(fd.get("status"), STATUSES, "Status"),
    renewalDate: optIsoDate(fd.get("renewalDate"), "Renewal date"),
    cost: await costFromForm(fd),
    notes: optStr(fd.get("notes"), "Notes"),
  };
}

export async function createService(fd: FormData): Promise<void> {
  const projectId = reqStr(fd.get("projectId"), "Project id", 100);
  await run(`/projects/${projectId}`, async () => {
    if (!(await getProject(projectId)))
      throw new ValidationError("Project not found");
    const existing = await listServices(projectId);
    const nextOrder =
      existing.reduce((max, s) => Math.max(max, s.sortOrder ?? 0), -1) + 1;
    await saveService(
      await serviceFromForm(fd, crypto.randomUUID(), projectId, nextOrder),
    );
  });
}

export async function updateService(fd: FormData): Promise<void> {
  const id = reqStr(fd.get("id"), "Service id", 100);
  const existing = await getService(id);
  const returnPath = existing ? `/projects/${existing.projectId}` : "/";
  await run(returnPath, async () => {
    if (!existing) throw new ValidationError("Service not found");
    await saveService(
      await serviceFromForm(fd, id, existing.projectId, existing.sortOrder ?? 0),
    );
  });
}

// Called directly from the drag-and-drop tabs (not a form). Persists the
// dropped order as sortOrder = array index; ids not in the project ignored.
export async function reorderServices(
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const services = await listServices(projectId);
  const byId = new Map(services.map((s) => [s.id, s]));
  let index = 0;
  for (const id of orderedIds) {
    const svc = byId.get(id);
    if (svc) await saveService({ ...svc, sortOrder: index++ });
  }
  revalidatePath(`/projects/${projectId}`);
}

export async function removeService(fd: FormData): Promise<void> {
  const id = reqStr(fd.get("id"), "Service id", 100);
  const existing = await getService(id);
  const returnPath = existing ? `/projects/${existing.projectId}` : "/";
  await run(returnPath, async () => {
    if (existing) await deleteService(existing);
  });
}

function subscriptionFromForm(fd: FormData, id: string) {
  return {
    id,
    name: reqStr(fd.get("name"), "Name"),
    url: optUrl(fd.get("url"), "Link"),
    notes: optStr(fd.get("notes"), "Notes"),
    amountCents: centsFromDollars(fd.get("amount"), "Amount"),
    cycle: oneOf(fd.get("cycle"), CYCLES, "Billing cycle"),
    renewalDate: optIsoDate(fd.get("renewalDate"), "Renewal date"),
    status: oneOf(fd.get("status"), STATUSES, "Status"),
  };
}

export async function createSubscription(fd: FormData): Promise<void> {
  await run("/subscriptions", async () => {
    await saveSubscription(subscriptionFromForm(fd, crypto.randomUUID()));
  });
}

export async function updateSubscription(fd: FormData): Promise<void> {
  await run("/subscriptions", async () => {
    const id = reqStr(fd.get("id"), "Subscription id", 100);
    if (!(await getSubscription(id)))
      throw new ValidationError("Subscription not found");
    await saveSubscription(subscriptionFromForm(fd, id));
  });
}

// Never leave services pointing at a dead subscription id (spec). Either the
// delete is blocked with the list of users, or — with the explicit detach
// box ticked — each referencing service becomes a $0 specific cost flagged
// in its notes for follow-up.
export async function removeSubscription(fd: FormData): Promise<void> {
  await run("/subscriptions", async () => {
    const id = reqStr(fd.get("id"), "Subscription id", 100);
    const sub = await getSubscription(id);
    if (!sub) return;
    const detach = fd.get("detach") === "on";
    const { projects, servicesByProject } = await loadAll();
    const refs = projects.flatMap((p) =>
      (servicesByProject.get(p.id) ?? [])
        .filter((s) => s.cost.type === "shared" && s.cost.subscriptionId === id)
        .map((s) => ({ project: p, service: s })),
    );
    if (refs.length && !detach)
      throw new ValidationError(
        `"${sub.name}" is still used by: ${refs.map((r) => `${r.project.name} → ${r.service.name}`).join(", ")}. Tick "detach services" to delete anyway.`,
      );
    for (const { service } of refs) {
      await saveService({
        ...service,
        cost: { type: "specific", amountCents: 0, cycle: "monthly" },
        notes:
          `⚠ Detached from deleted subscription "${sub.name}" — set its real cost. ` +
          service.notes,
      });
    }
    await deleteSubscription(id);
  });
}

export async function createStripeAccount(fd: FormData): Promise<void> {
  await run("/accounts", async () => {
    const secretKey = reqStr(fd.get("secretKey"), "Secret key", 300);
    await saveStripeAccount({
      id: crypto.randomUUID(),
      label: reqStr(fd.get("label"), "Label"),
      url: optUrl(fd.get("url"), "Link"),
      encryptedKey: encrypt(secretKey),
      keyHint: keyHint(secretKey),
      notes: optStr(fd.get("notes"), "Notes"),
    });
  });
}

export async function updateStripeAccount(fd: FormData): Promise<void> {
  await run("/accounts", async () => {
    const id = reqStr(fd.get("id"), "Account id", 100);
    const existing = await getStripeAccount(id);
    if (!existing) throw new ValidationError("Stripe account not found");
    const newKey = optStr(fd.get("secretKey"), "Secret key", 300);
    await saveStripeAccount({
      ...existing,
      label: reqStr(fd.get("label"), "Label"),
      url: optUrl(fd.get("url"), "Link"),
      notes: optStr(fd.get("notes"), "Notes"),
      ...(newKey
        ? { encryptedKey: encrypt(newKey), keyHint: keyHint(newKey) }
        : {}),
    });
  });
}

export async function removeStripeAccount(fd: FormData): Promise<void> {
  await run("/accounts", async () => {
    const id = reqStr(fd.get("id"), "Account id", 100);
    const account = await getStripeAccount(id);
    if (!account) return;
    const detach = fd.get("detach") === "on";
    const refs = (await listProjects()).filter(
      (p) => p.stripeAccountId === id,
    );
    if (refs.length && !detach)
      throw new ValidationError(
        `"${account.label}" is still linked to: ${refs.map((p) => p.name).join(", ")}. Tick "detach projects" to delete anyway.`,
      );
    for (const p of refs)
      await saveProject({ ...p, stripeAccountId: null, revenueTag: null });
    await deleteStripeAccount(id);
  });
}
