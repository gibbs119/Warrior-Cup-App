// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyD9rXOCw7LGe_Q-rpKBS5owfuIOSQ8k_CY",
  authDomain: "warrior-cup-app.firebaseapp.com",
  databaseURL: "https://warrior-cup-app-default-rtdb.firebaseio.com",
  projectId: "warrior-cup-app",
  storageBucket: "warrior-cup-app.firebasestorage.app",
  messagingSenderId: "339030902924",
  appId: "1:339030902924:web:76049e51b4321eba1293a9",
  measurementId: "G-QZ1ZW0KXP5"
};

// Initialize Firebase (only once)
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
