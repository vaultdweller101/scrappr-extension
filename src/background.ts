import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import browser from "webextension-polyfill";

// Reuse your config
const firebaseConfig = {
  apiKey: "AIzaSyCAbnTm4O4BHzz42y_z18XZwBIw-Y6-WWo",
  authDomain: "scrappr-a2f39.firebaseapp.com",
  projectId: "scrappr-a2f39",
  storageBucket: "scrappr-a2f39.firebasestorage.app",
  messagingSenderId: "1075565266262",
  appId: "1:1075565266262:web:f1ae846eea613bcf8982f7",
  measurementId: "G-NL6N2C1221"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message: any, _sender: any) => {
  if (message.type === "START_AUTH") {
    // In webextension-polyfill, we return the Promise directly
    // instead of returning 'true' and using sendResponse.
    return handleAuth();
  }
  // Return undefined for messages we don't handle
  return undefined;
});

async function handleAuth() {
  try {
    const clientId = "1075565266262-rjdu8re2t9jnqsv7vehs3dnfn41rn7tm.apps.googleusercontent.com";
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ];
    
    const redirectUri = browser.identity.getRedirectURL();
    
    // Added prompt=select_account to fix the macOS auto-close issue
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&scope=${scopes.join(' ')}&response_type=token&redirect_uri=${redirectUri}&prompt=select_account`;

    // This will keep running even if the popup closes!
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    if (!responseUrl) throw new Error("No response URL");

    // Parse the token
    const urlParams = new URLSearchParams(responseUrl.split("#")[1]);
    const accessToken = urlParams.get("access_token");

    if (!accessToken) throw new Error("No access token");

    // Sign in to Firebase (in the background)
    const credential = GoogleAuthProvider.credential(null, accessToken);
    await signInWithCredential(auth, credential);

    return { success: true };
  } catch (error: any) {
    // Return the error object so the popup can handle it
    return { error: error.message || "Unknown error occurred" };
  }
}