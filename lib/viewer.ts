import { headers } from "next/headers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getD1 } from "../db";
import type { Viewer } from "./contracts";

const GUEST_COOKIE = "wd_guest";
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ViewerContext = Viewer & {
  identityId: string;
  setCookie?: string;
  pendingGuestIdentityId?: string;
};

type IdentityRow = {
  id: string;
};

export async function resolveViewer(): Promise<ViewerContext> {
  const db = getD1();
  const requestHeaders = await headers();
  const rawGuestToken = readCookie(requestHeaders.get("cookie"), GUEST_COOKIE);
  const chatGPTUser = await getChatGPTUser();
  const now = Date.now();

  if (chatGPTUser) {
    const subject = await digest(`chatgpt:${chatGPTUser.subject}`);
    const email = chatGPTUser.email.trim().toLowerCase().slice(0, 320);
    const fullName = chatGPTUser.fullName?.trim().slice(0, 200) || null;
    let identity = await db
      .prepare(
        "SELECT id FROM identities WHERE provider = 'chatgpt' AND provider_subject = ? LIMIT 1",
      )
      .bind(subject)
      .first<IdentityRow>();

    if (!identity) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT OR IGNORE INTO identities
            (id, provider, provider_subject, email, full_name, profile_updated_at,
             created_at, last_seen_at)
           VALUES (?, 'chatgpt', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, subject, email, fullName, now, now, now)
        .run();
      identity = await db
        .prepare(
          "SELECT id FROM identities WHERE provider = 'chatgpt' AND provider_subject = ? LIMIT 1",
        )
        .bind(subject)
        .first<IdentityRow>();
    }
    if (!identity) throw new Error("Unable to resolve the signed-in identity.");

    const statements = [
      db
        .prepare(
          `UPDATE identities
           SET last_seen_at = ?, email = ?, full_name = ?, profile_updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, email, fullName, now, identity.id),
    ];
    let pendingGuestIdentityId: string | undefined;
    if (rawGuestToken) {
      const guestSubject = await digest(`guest:${rawGuestToken}`);
      const guest = await db
        .prepare(
          "SELECT id FROM identities WHERE provider = 'guest' AND provider_subject = ? LIMIT 1",
        )
        .bind(guestSubject)
        .first<IdentityRow>();
      if (guest && guest.id !== identity.id) {
        pendingGuestIdentityId = guest.id;
      }
    }
    await db.batch(statements);

    return {
      identityId: identity.id,
      mode: "chatgpt",
      displayName: chatGPTUser.displayName,
      journeyLimit: 25,
      pendingGuestIdentityId,
      hasGuestUpgrade: Boolean(pendingGuestIdentityId),
    };
  }

  if (rawGuestToken) {
    const subject = await digest(`guest:${rawGuestToken}`);
    const identity = await db
      .prepare(
        "SELECT id FROM identities WHERE provider = 'guest' AND provider_subject = ? LIMIT 1",
      )
      .bind(subject)
      .first<IdentityRow>();
    if (identity) {
      await db
        .prepare("UPDATE identities SET last_seen_at = ? WHERE id = ?")
        .bind(now, identity.id)
        .run();
      return {
        identityId: identity.id,
        mode: "guest",
        displayName: "Guest explorer",
        journeyLimit: 5,
        guestExpiresAt: now + GUEST_MAX_AGE_SECONDS * 1000,
      };
    }
  }

  const token = randomToken();
  const subject = await digest(`guest:${token}`);
  const identityId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO identities (id, provider, provider_subject, expires_at, created_at, last_seen_at) VALUES (?, 'guest', ?, ?, ?, ?)",
    )
    .bind(identityId, subject, now + GUEST_MAX_AGE_SECONDS * 1000, now, now)
    .run();

  return {
    identityId,
    mode: "guest",
    displayName: "Guest explorer",
    journeyLimit: 5,
    guestExpiresAt: now + GUEST_MAX_AGE_SECONDS * 1000,
    setCookie: sessionCookie(token, requestHeaders),
  };
}

export function publicViewer(viewer: ViewerContext): Viewer {
  return {
    mode: viewer.mode,
    displayName: viewer.displayName,
    journeyLimit: viewer.journeyLimit,
    guestExpiresAt: viewer.guestExpiresAt,
    hasGuestUpgrade: Boolean(viewer.pendingGuestIdentityId),
  };
}

export async function upgradeGuestJourneys(
  viewer: ViewerContext,
  idempotencyKey: string,
) {
  if (viewer.mode !== "chatgpt" || !viewer.pendingGuestIdentityId) {
    throw new Error("No guest journeys are waiting to be upgraded.");
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    throw new Error("A valid upgrade key is required.");
  }
  const db = getD1();
  const prior = await db
    .prepare(
      "SELECT transferred_journey_count FROM identity_upgrades WHERE account_identity_id = ? AND idempotency_key = ? LIMIT 1",
    )
    .bind(viewer.identityId, idempotencyKey)
    .first<{ transferred_journey_count: number }>();
  if (prior) return { transferred: prior.transferred_journey_count };
  const count = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM journeys WHERE owner_identity_id = ? AND deleted_at IS NULL",
    )
    .bind(viewer.pendingGuestIdentityId)
    .first<{ count: number }>();
  const transferred = count?.count ?? 0;
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        "UPDATE journeys SET owner_identity_id = ?, updated_at = ? WHERE owner_identity_id = ? AND deleted_at IS NULL",
      )
      .bind(viewer.identityId, now, viewer.pendingGuestIdentityId),
    db
      .prepare("UPDATE identities SET upgraded_to_identity_id = ? WHERE id = ? AND provider = 'guest'")
      .bind(viewer.identityId, viewer.pendingGuestIdentityId),
    db
      .prepare(
        `INSERT INTO identity_upgrades
          (id, guest_identity_id, account_identity_id, idempotency_key, transferred_journey_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        viewer.pendingGuestIdentityId,
        viewer.identityId,
        idempotencyKey,
        transferred,
        now,
      ),
  ]);
  return { transferred, setCookie: expiredCookie(await headers()) };
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rest] = item.trim().split("=");
    if (rawName === name) return rest.join("=") || null;
  }
  return null;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(hash));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function sessionCookie(token: string, requestHeaders: Headers): string {
  const secure = isSecure(requestHeaders) ? "; Secure" : "";
  return `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_MAX_AGE_SECONDS}${secure}`;
}

function expiredCookie(requestHeaders: Headers): string {
  const secure = isSecure(requestHeaders) ? "; Secure" : "";
  return `${GUEST_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function isSecure(requestHeaders: Headers): boolean {
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (protocol) return protocol === "https";
  const host = requestHeaders.get("host") ?? "";
  return !host.startsWith("localhost") && !host.startsWith("127.0.0.1");
}
