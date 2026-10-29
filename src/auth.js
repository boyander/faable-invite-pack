/* Faable Auth for a static SPA: Authorization Code + PKCE with @faable/auth-js, no backend.
   The claimed card is stored on the user's own profile (user_metadata["faable.com/fields"]) with updateProfileField, so it
   follows them to any device they sign in on. The field must be declared in the client's profile_fields. */
import { createClient } from "@faable/auth-js";
import { AUTH_DOMAIN, AUTH_CLIENT_ID } from "./config.js";

const CAMPO = "invite_card";        // the profile field that holds the claimed card
const PENDIENTE = "invite:claim";   // the card being claimed, kept across the login redirect

export const estado = {on: !!(AUTH_DOMAIN && AUTH_CLIENT_ID), user: null, reclamada: null, recienReclamada: false};
const auth = estado.on ? createClient({domain: AUTH_DOMAIN, clientId: AUTH_CLIENT_ID, redirectUri: location.origin + "/"}) : null;

const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const quitar = k => { try { localStorage.removeItem(k); } catch (e) {} };

// resolves when the session is known: back from the login (createClient exchanges the ?code= by itself), restored
// from storage, or none
export const listo = (async () => {
  if (!auth) return;
  try {
    const {data} = await auth.getSession();
    if (!data?.session) return;
    estado.reclamada = await auth.getProfileField(CAMPO);
    const pendiente = leer(PENDIENTE);
    // first sign-in after claiming: the card goes to the profile. An account that already has one keeps it
    if (!estado.reclamada && pendiente) {
      const {error} = await auth.updateProfileField(CAMPO, pendiente);
      if (error) console.warn("Could not save the card:", error);
      else { estado.reclamada = await auth.getProfileField(CAMPO); estado.recienReclamada = true; }
    }
    quitar(PENDIENTE);
    estado.user = (await auth.getSession()).data?.session?.user ?? data.session.user; // with the card, if just saved
  } catch (e) { console.warn("Faable Auth:", e); }
})();

// to the hosted login (every connection the app offers); the promise never resolves, the page navigates away
export function reclamar(id){
  try { localStorage.setItem(PENDIENTE, id); } catch (e) {}
  auth.signIn();
}

// the dashboard signs in with the same tenant: ?sso=1 sends it to /authorize at once, and the SSO session this app
// left there brings the user back already signed in, ready to create their first project
export const DASHBOARD = "https://dashboard.faable.com/account/login?sso=1";

// signs out of this app only (signOut's default since auth-js 3): its refresh token is revoked and its storage cleared,
// but the tenant's SSO session stays, so other apps on it (the dashboard, here) keep theirs
export async function salir(){
  await auth.signOut();
  location.reload();
}

// what the app can read about the user: the profile from /me and the access token's claims, decoded locally
export async function claims(){
  const {data} = await auth.getClaims();
  const u = estado.user || {};
  const profile = Object.fromEntries(["sub", "email", "email_verified", "name", "picture", "user_metadata"].filter(k => u[k] !== undefined).map(k => [k, u[k]]));
  return {profile, access_token: data?.claims || null};
}
