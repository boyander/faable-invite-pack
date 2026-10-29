/* Faable Auth for a static SPA: Authorization Code + PKCE with @faable/auth-js, no backend.
   The claimed card is stored on the user's own profile (user_metadata["faable.com/fields"]) with updateProfileField, so it
   follows them to any device they sign in on. The field must be declared in the client's profile_fields. */
import { createClient } from "@faable/auth-js";
import { AUTH_DOMAIN, AUTH_CLIENT_ID } from "./config.js";

const CAMPO = "invite_card";        // the profile field that holds the claimed card
const PENDIENTE = "invite:claim";   // the card being claimed, kept across the login redirect

export const estado = {on: !!(AUTH_DOMAIN && AUTH_CLIENT_ID), user: null, reclamada: null, recienReclamada: false};
const auth = estado.on ? createClient({domain: AUTH_DOMAIN, clientId: AUTH_CLIENT_ID, redirectUri: location.origin + "/"}) : null;

const campo = user => [].concat(user?.user_metadata?.["faable.com/fields"] || []).find(f => f?.key === CAMPO)?.value || null;
const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const quitar = k => { try { localStorage.removeItem(k); } catch (e) {} };

// resolves when the session is known: back from the login (?code=…), restored from storage, or none
export const listo = (async () => {
  if (!auth) return;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("code") || q.has("error")) {
      const {error} = await auth.handleRedirectCallback();
      if (error) console.warn("Sign-in failed:", error);
      history.replaceState(null, "", location.pathname); // the code is single-use: out of the address bar
    }
    const {data} = await auth.getSession();
    const s = data?.session;
    if (!s) return;
    estado.user = s.user; estado.reclamada = campo(s.user);
    const pendiente = leer(PENDIENTE);
    // first sign-in after claiming: the card goes to the profile. An account that already has one keeps it
    if (!estado.reclamada && pendiente) {
      const {data: user, error} = await auth.updateProfileField(CAMPO, pendiente);
      if (error) console.warn("Could not save the card:", error);
      else { estado.user = {...estado.user, ...user}; estado.reclamada = campo(user) || pendiente; estado.recienReclamada = true; }
    }
    quitar(PENDIENTE);
  } catch (e) { console.warn("Faable Auth:", e); }
})();

// to the hosted login (every connection the app offers); the promise never resolves, the page navigates away
export function reclamar(id){
  try { localStorage.setItem(PENDIENTE, id); } catch (e) {}
  auth.signInWithOauthConnection({});
}

// signs out of this app only: the tenant's SSO session stays, so other apps on it (the dashboard, here) keep theirs.
// The next "Claim" goes back in without asking; signOut() with the default global scope would end them all
export async function salir(){
  await auth.signOut({scope: "local"});
  location.reload();
}

// what the app can read about the user: the profile from /me and the access token's claims, decoded locally
export async function claims(){
  const {data} = await auth.getClaims();
  const u = estado.user || {};
  const profile = Object.fromEntries(["sub", "email", "email_verified", "name", "picture", "user_metadata"].filter(k => u[k] !== undefined).map(k => [k, u[k]]));
  return {profile, access_token: data?.claims || null};
}
