import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User
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

// Define the expected structure of the response from the background script
interface AuthResponse {
  success?: boolean;
  error?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      setLoading(true);
      // Cast the response to our interface
      const response = (await browser.runtime.sendMessage({ type: "START_AUTH" })) as AuthResponse;
      
      if (response && response.error) {
        console.error("Auth failed:", response.error);
        alert(`Login failed: ${response.error}`);
      } else {
        // Auth success
      }
    } catch (error) {
      console.error("Messaging error:", error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return { user, loading, signIn, logout };
}

export { app, auth, db };