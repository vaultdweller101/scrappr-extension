import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  getRedirectResult,
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithCredential
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { useEffect, useState } from "react";
import browser from 'webextension-polyfill';

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
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Standard auth state listener remains the primary source of truth
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      // 1. Manually define the OAuth flow using the Identity API
      const clientId = "1075565266262-rjdu8re2t9jnqsv7vehs3dnfn41rn7tm.apps.googleusercontent.com";
      const scopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ];
      
      // Force user to select account each time
      const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&scope=${scopes.join(' ')}&response_type=token&redirect_uri=${browser.identity.getRedirectURL()}&prompt=select_account`;
      
      // 2. Launch the Web Auth Flow
      const tokenResult = await browser.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
      });
      
      // 3. Extract the Access Token
      if (!tokenResult || tokenResult.indexOf('access_token=') === -1) {
          throw new Error("Google OAuth failed to return an access token.");
      }
      const urlParams = new URLSearchParams(tokenResult.substring(tokenResult.indexOf('#') + 1));
      const accessToken = urlParams.get('access_token');
      
      // 4. Sign in to Firebase
      if (accessToken) {
          const credential = GoogleAuthProvider.credential(null, accessToken);
          await signInWithCredential(auth, credential);
      } else {
          throw new Error("Access token is missing.");
      }

    } catch (error) {
      console.error("MV3 Chrome Identity Sign-In Error", error);
      alert("Sign-in failed. Check the console for details.");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return { user, loading, signIn, logout };
}

export { app, auth, db };