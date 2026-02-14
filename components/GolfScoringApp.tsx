// components/GolfScoringApp.tsx
'use client';
import { db } from '@/lib/firebase';  // adjust to '@/Lib/firebase' if folder is capitalized
import { ref, onValue, set } from 'firebase/database';
import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Plus, Trash2, Edit2, Save, Award, ChevronLeft, ChevronRight,
  Check, X, Flag, Search, RefreshCw, Lock, Unlock, Users, Settings, LogOut
} from 'lucide-react';
import { db } from '@/lib/firebase'; // or '@/Lib/firebase' if your folder is capitalized
import { ref, onValue, set } from 'firebase/database';

// ─── Formats ────────────────────────────────────────────────────────────────
const FORMATS = {
  modifiedscramble: { name: "Modified Scramble", ppp: 2, hcpType: "avg75", holesOpts: [9, 18], desc: "All pairings compete — best net wins hole", pointsPerMatchup: 0.5, numMatchups: 1 },
  bestball:         { name: "Best Ball",          ppp: 2, hcpType: "full",  holesOpts: [9, 18], desc: "Best individual net score wins",           pointsPerMatchup: 1,   numMatchups: 2 },
  scramble:         { name: "2-Man Scramble",     ppp: 2, hcpType: "avg75", holesOpts: [9, 18], desc: "Team picks best shot each time",           pointsPerMatchup: 1,   numMatchups: 2 },
  alternateshot:    { name: "Alternate Shot",     ppp: 2, hcpType: "avg",   holesOpts: [9, 18], desc: "Partners alternate shots",                pointsPerMatchup: 1,   numMatchups: 2 },
  singles:          { name: "Singles",            ppp: 1, hcpType: "full",  holesOpts: [9, 18], desc: "1v1 match play — 2 matches",               pointsPerMatchup: 1,   numMatchups: 2 },
};

// ─── Pre-loaded Courses (add more later) ─────────────────────────────────────
const PRESET_COURSES = [
  // Hawks Landing example – truncated for brevity, add your full data
  {
    id: "hawks_landing",
    name: "Hawks Landing Golf Course",
    location: "Lake Buena Vista, FL",
    tees: [
      { name: "Black", slope: 133, rating: 70.2, par: 71, holes: [
        {h:1,par:4,yards:425,rank:10}, /* ... add all 18 holes ... */
      ]},
      // Add other tees
    ]
  },
  // Add Disney courses, etc.
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
const genCode = (len = 6) => Math.random().toString(36).slice(2, 2 + len).toUpperCase();
const courseHcp = (hi, slope) => Math.round((hi * slope) / 113 || 0);

// ... (add your other helpers: pairingPlayingHcp, matchplayStrokes, etc. from original)

// ─── UI Atoms (simplified – expand as needed) ────────────────────────────────
const BG = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
    {children}
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-lg p-6 border border-gray-200 ${className}`}>
    {children}
  </div>
);

const Btn = ({ children, onClick, color = "green", disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded-lg font-semibold text-white ${
      color === "green" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
    } disabled:opacity-50`}
  >
    {children}
  </button>
);

// ─── Main App Component ────────────────────────────────────────────────────────
export default function GolfScoringApp() {
  const [screen, setScreen] = useState("login");
  const [role, setRole] = useState(null);
  const [tournId, setTournId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [tData, setTData] = useState(null);
  const [localScores, setLocalScores] = useState({});

  const [activeMatchId, setActiveMatchId] = useState(null);

  // Firebase real-time listener
  useEffect(() => {
  if (!tournId) return;

  console.log("Listening to tournament:", tournId); // for debugging

  const tournRef = ref(db, `tournaments/${tournId}`);
  const tournUnsub = onValue(tournRef, (snap) => {
    const data = snap.val();
    console.log("Tournament data received:", data);
    if (data) setTData(data);
  });

  let scoresUnsub;
  if (activeMatchId) {
    const scoresRef = ref(db, `scores/${tournId}/${activeMatchId}`);
    scoresUnsub = onValue(scoresRef, (snap) => {
      const scores = snap.val();
      console.log("Scores updated:", scores);
      if (scores) setLocalScores(scores);
    });
  }

  return () => {
    tournUnsub();
    if (scoresUnsub) scoresUnsub();
  };
}, [tournId, activeMatchId]);

  // ── Login / Create Tournament ───────────────────────────────────────────────
  const createTournament = async () => {
    const id = genCode(6);
    const pc = genCode(4);
    const data = {
      id,
      name: "Golf Trip 2026",
      passcode: pc,
      players: [],
      matches: [],
      // ... add default courses, etc.
    };
    await set(ref(db, `tournaments/${id}`), data);
    setTournId(id);
    setPasscode(pc);
    setTData(data);
    setRole("admin");
    setScreen("admin");
  };

  // ── Save / Load Helpers
// Firebase load tournament
const loadTournament = async (id) => {
  return new Promise((resolve) => {
    onValue(ref(db, `tournaments/${id}`), (snapshot) => {
      const data = snapshot.val();
      resolve(data || null);
    }, { onlyOnce: true });
  });
};

// Firebase save tournament
const saveTournament = async (data, id = tournId) => {
  try {
    await set(ref(db, `tournaments/${id}`), data);
    console.log("Tournament saved to Firebase");
  } catch (err) {
    console.error("Save tournament failed:", err);
  }
};

// Add similar for loadMatchScores and saveMatchScores if you have them
