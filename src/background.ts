import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirestore, doc, deleteDoc, updateDoc } from 'firebase/firestore';
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
const db = getFirestore(app);

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message: any, _sender: any) => {
  if (message.type === "START_AUTH") {
    return handleAuth();
  }
  if (message.type === 'DELETE_NOTE') {
    return handleDelete(message.id);
  }
  if (message.type === 'UPDATE_NOTE') {
    return handleUpdate(message.id, message.content);
  }
  if (message.type === 'OPEN_POPUP') {
    return handleOpenPopup();
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

async function handleDelete(id: string) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const noteRef = doc(db, 'users', user.uid, 'notes', id);
    await deleteDoc(noteRef);
    
    // Also remove from the cached storage so the popup sees the updated list
    try {
      const cached = await browser.storage.local.get('cached_firestore_notes');
      const notes = (cached as any).cached_firestore_notes;
      if (Array.isArray(notes)) {
        const filtered = notes.filter((n: any) => n.id !== id);
        await browser.storage.local.set({ cached_firestore_notes: filtered });
      }
    } catch (cacheErr) {
      console.warn('Could not update cache after delete:', cacheErr);
    }
    
    return { success: true };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

async function handleUpdate(id: string, content: string) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const noteRef = doc(db, 'users', user.uid, 'notes', id);
    await updateDoc(noteRef, { content, timestamp: Date.now() });
    return { success: true };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

async function handleOpenPopup() {
  try {
    const popupUrl = browser.runtime.getURL('notes.html');
    if (browser.tabs && browser.tabs.query) {
      const tabs = await browser.tabs.query({ url: popupUrl });
      if (tabs.length > 0) {
        // Popup tab already exists; focus it
        await browser.tabs.update(tabs[0].id, { active: true });
      } else {
        // Open new popup tab
        await browser.tabs.create({ url: popupUrl });
      }
    } else {
      // Fallback: open as window
      window.open(popupUrl, '_blank', 'width=400,height=600');
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}