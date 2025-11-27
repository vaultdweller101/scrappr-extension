import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut } from "firebase/auth";

import { getFunctions, httpsCallable } from "firebase/functions"; // Import Functions
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import browser from "webextension-polyfill";

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
const functions = getFunctions(app, "us-central1"); // Initialize Functions
const db = getFirestore(app);

// Ensure user is signed out whenever the extension is installed or reloaded in dev
browser.runtime.onInstalled.addListener(() => {
  signOut(auth).catch((err) => {
    console.warn("Scrappr: auto sign-out on install/update failed", err);
  });
});

browser.runtime.onMessage.addListener((message: any, _sender: any) => {
  if (message.type === "START_AUTH") {
    return handleAuth();
  }
  // New handler for transcription
  if (message.type === "TRANSCRIBE_AUDIO") {
    return handleTranscription(message.audioBase64);
  }
  if (message.type === "SAVE_TRANSCRIPT_NOTE") {
    return saveTranscriptNote(message.text);
  }
  return undefined;
});

// New function to call Cloud Function
async function handleTranscription(base64String: string) {
  try {
    // Ensure user is signed in before calling
    if (!auth.currentUser) {
      return { error: "You must be signed in to the extension first." };
    }

    const transcribeFunction = httpsCallable<{ audioBase64: string }, { text: string }>(
      functions,
      'transcribeAudio'
    );

    const response = await transcribeFunction({ audioBase64: base64String });
    return { success: true, text: response.data.text };

  } catch (error: any) {
    console.error("Background transcription error:", error);
    return { error: error.message || "Transcription failed." };
  }
}

async function saveTranscriptNote(text: string) {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { error: "You must be signed in to the extension first." };
    }

    const notesCollection = collection(db, "users", user.uid, "notes");
    await addDoc(notesCollection, {
      content: text,
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error("Background save note error:", error);
    return { error: error.message || "Failed to save note." };
  }
}

async function handleAuth() {
  try {
    const clientId = "1075565266262-rjdu8re2t9jnqsv7vehs3dnfn41rn7tm.apps.googleusercontent.com";
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ];
    
    const redirectUri = browser.identity.getRedirectURL();
    
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&scope=${scopes.join(' ')}&response_type=token&redirect_uri=${redirectUri}&prompt=select_account`;

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    if (!responseUrl) throw new Error("No response URL");

    const urlParams = new URLSearchParams(responseUrl.split("#")[1]);
    const accessToken = urlParams.get("access_token");

    if (!accessToken) throw new Error("No access token");

    const credential = GoogleAuthProvider.credential(null, accessToken);
    await signInWithCredential(auth, credential);

    return { success: true };
  } catch (error: any) {
    return { error: error.message || "Unknown error occurred" };
  }
}