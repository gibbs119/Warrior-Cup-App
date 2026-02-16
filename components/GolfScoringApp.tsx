'use client';
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Plus, Trash2, Save, Award, ChevronLeft, ChevronRight,
  Check, Flag, Lock, Users, LogOut, Sun, Moon
} from 'lucide-react';
import { db } from '@/Lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Hole { h: number; par: number; yards: number; rank: number; }
interface Tee { name: string; slope: number; rating: number; par: number; holes: Hole[]; }
interface Course { id: string; name: string; location: string; tees: Tee[]; }
interface Player { 
  id: string; name: string; handicapIndex: number; 
  stats: { 
    matchesPlayed: number; matchesWon: number; holesWon: number; skinsWon: number;
    teamPointsContributed: number;
    netUnderParHoles: number;
  }; 
}
interface Match {
  id: string; format: string; startHole: number; holes: number;
  pairings: Record<string,string[]>; pairingHcps: Record<string,number>;
  completed: boolean;
  courseId?: string; teeId?: string;
}
interface MatchResult {
  matchId: string; format: string; holes: number; startHole: number;
  teamPoints: Record<string,number>; totalPoints: number;
  team1HolesWon: number; team2HolesWon: number;
  leader: string|null; playerSkins: Record<string,number>; completedAt: string;
}
interface Tournament {
  id: string; name: string; passcode: string; adminPasscode: string;
  courses: Course[]; activeCourseId: string; activeTeeId: string;
  teamNames: Record<string,string>; players: Player[];
  teams: Record<string,string[]>; matches: Match[]; matchResults: MatchResult[];
  createdAt: string;
}

// ─── Formats ─────────────────────────────────────────────────────────────────
const FORMATS: Record<string,{name:string;ppp:number;hcpType:string;holesOpts:number[];desc:string;pointsPerMatchup:number;numMatchups:number;perHole?:boolean}> = {
  modifiedscramble: { name:'Modified Scramble', ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Best net of all 4 pairings wins hole — 0.5pts/hole', pointsPerMatchup:0.5, numMatchups:1, perHole:true },
  bestball: { name:'Best Ball', ppp:2, hcpType:'full', holesOpts:[9,18], desc:'Best individual net score wins', pointsPerMatchup:1, numMatchups:2 },
  scramble: { name:'2-Man Scramble', ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Team picks best shot each time', pointsPerMatchup:1, numMatchups:2 },
  alternateshot: { name:'Alternate Shot', ppp:2, hcpType:'avg', holesOpts:[9,18], desc:'Partners alternate shots', pointsPerMatchup:1, numMatchups:2 },
  singles: { name:'Singles', ppp:1, hcpType:'full', holesOpts:[9,18], desc:'4 individual 1v1 matches — 4 pts', pointsPerMatchup:1, numMatchups:4 },
};

const getMatchupPairs = (format: string): [string,string][] =>
  format==='singles'
    ? [['t1p1','t2p1'],['t1p2','t2p2'],['t1p3','t2p3'],['t1p4','t2p4']]
    : [['t1p1','t2p1'],['t1p2','t2p2']];

const getEmptyPairings = (format: string) => {
  const slots = format==='singles'
    ? ['t1p1','t1p2','t1p3','t1p4','t2p1','t2p2','t2p3','t2p4']
    : ['t1p1','t1p2','t2p1','t2p2'];
  return {
    pairings: Object.fromEntries(slots.map(k=>[k,[]])) as Record<string,string[]>,
    pairingHcps: Object.fromEntries(slots.map(k=>[k,0])) as Record<string,number>,
  };
};

// ─── PRESET_COURSES ───────────────────────────────────────────────────────────
const PRESET_COURSES: Course[] = [
  {
    id:'hawks_landing', name:'Hawks Landing Golf Club', location:'Orlando, FL',
    tees:[
      { name:'Black', slope:131, rating:72.6, par:71, holes:[
        {h:1,par:4,yards:426,rank:10},{h:2,par:3,yards:182,rank:18},{h:3,par:4,yards:387,rank:4},
        {h:4,par:5,yards:535,rank:2},{h:5,par:4,yards:342,rank:16},{h:6,par:5,yards:475,rank:14},
        {h:7,par:3,yards:229,rank:8},{h:8,par:4,yards:353,rank:12},{h:9,par:4,yards:407,rank:6},
        {h:10,par:5,yards:554,rank:7},{h:11,par:4,yards:390,rank:9},{h:12,par:4,yards:412,rank:5},
        {h:13,par:3,yards:160,rank:15},{h:14,par:4,yards:432,rank:3},{h:15,par:3,yards:142,rank:17},
        {h:16,par:4,yards:399,rank:13},{h:17,par:3,yards:212,rank:11},{h:18,par:5,yards:565,rank:1},
      ]},
      { name:'Green', slope:129, rating:70.3, par:71, holes:[
        {h:1,par:4,yards:395,rank:10},{h:2,par:3,yards:156,rank:18},{h:3,par:4,yards:372,rank:4},
        {h:4,par:5,yards:507,rank:2},{h:5,par:4,yards:322,rank:16},{h:6,par:5,yards:462,rank:14},
        {h:7,par:3,yards:213,rank:8},{h:8,par:4,yards:329,rank:12},{h:9,par:4,yards:389,rank:6},
        {h:10,par:5,yards:486,rank:7},{h:11,par:4,yards:364,rank:9},{h:12,par:4,yards:378,rank:5},
        {h:13,par:3,yards:143,rank:15},{h:14,par:4,yards:419,rank:3},{h:15,par:3,yards:125,rank:17},
        {h:16,par:4,yards:370,rank:13},{h:17,par:3,yards:185,rank:11},{h:18,par:5,yards:550,rank:1},
      ]},
      { name:'Gold', slope:119, rating:67.8, par:71, holes:[
        {h:1,par:4,yards:325,rank:10},{h:2,par:3,yards:135,rank:18},{h:3,par:4,yards:345,rank:4},
        {h:4,par:5,yards:460,rank:2},{h:5,par:4,yards:302,rank:16},{h:6,par:5,yards:434,rank:14},
        {h:7,par:3,yards:197,rank:8},{h:8,par:4,yards:276,rank:12},{h:9,par:4,yards:364,rank:6},
        {h:10,par:5,yards:447,rank:7},{h:11,par:4,yards:343,rank:9},{h:12,par:4,yards:360,rank:5},
        {h:13,par:3,yards:118,rank:15},{h:14,par:4,yards:400,rank:3},{h:15,par:3,yards:112,rank:17},
        {h:16,par:4,yards:313,rank:13},{h:17,par:3,yards:165,rank:11},{h:18,par:5,yards:505,rank:1},
      ]},
    ]
  },
  {
    id:'disney_magnolia', name:"Disney's Magnolia Golf Course", location:'Lake Buena Vista, FL',
    tees:[
      { name:'Classic', slope:141, rating:76.0, par:72, holes:[
        {h:1,par:4,yards:428,rank:3},{h:2,par:4,yards:417,rank:15},{h:3,par:3,yards:170,rank:17},
        {h:4,par:5,yards:542,rank:11},{h:5,par:4,yards:492,rank:1},{h:6,par:3,yards:231,rank:13},
        {h:7,par:4,yards:422,rank:7},{h:8,par:5,yards:614,rank:9},{h:9,par:4,yards:500,rank:5},
        {h:10,par:5,yards:526,rank:8},{h:11,par:4,yards:399,rank:14},{h:12,par:3,yards:169,rank:16},
        {h:13,par:4,yards:384,rank:18},{h:14,par:5,yards:592,rank:4},{h:15,par:3,yards:203,rank:10},
        {h:16,par:4,yards:450,rank:12},{h:17,par:4,yards:485,rank:2},{h:18,par:4,yards:492,rank:6},
      ]},
      { name:'Blue', slope:137, rating:74.0, par:72, holes:[
        {h:1,par:4,yards:428,rank:3},{h:2,par:4,yards:417,rank:15},{h:3,par:3,yards:165,rank:17},
        {h:4,par:5,yards:542,rank:11},{h:5,par:4,yards:448,rank:1},{h:6,par:3,yards:195,rank:13},
        {h:7,par:4,yards:410,rank:7},{h:8,par:5,yards:614,rank:9},{h:9,par:4,yards:431,rank:5},
        {h:10,par:5,yards:526,rank:8},{h:11,par:4,yards:385,rank:14},{h:12,par:3,yards:169,rank:16},
        {h:13,par:4,yards:375,rank:18},{h:14,par:5,yards:592,rank:4},{h:15,par:3,yards:203,rank:10},
        {h:16,par:4,yards:400,rank:12},{h:17,par:4,yards:427,rank:2},{h:18,par:4,yards:455,rank:6},
      ]},
      { name:'White', slope:130, rating:71.6, par:72, holes:[
        {h:1,par:4,yards:410,rank:3},{h:2,par:4,yards:323,rank:15},{h:3,par:3,yards:147,rank:17},
        {h:4,par:5,yards:495,rank:11},{h:5,par:4,yards:432,rank:1},{h:6,par:3,yards:175,rank:13},
        {h:7,par:4,yards:396,rank:7},{h:8,par:5,yards:550,rank:9},{h:9,par:4,yards:412,rank:5},
        {h:10,par:5,yards:515,rank:8},{h:11,par:4,yards:371,rank:14},{h:12,par:3,yards:160,rank:16},
        {h:13,par:4,yards:328,rank:18},{h:14,par:5,yards:523,rank:4},{h:15,par:3,yards:191,rank:10},
        {h:16,par:4,yards:372,rank:12},{h:17,par:4,yards:400,rank:2},{h:18,par:4,yards:442,rank:6},
      ]},
      { name:'Gold', slope:121, rating:69.0, par:72, holes:[
        {h:1,par:4,yards:365,rank:3},{h:2,par:4,yards:310,rank:15},{h:3,par:3,yards:134,rank:17},
        {h:4,par:5,yards:477,rank:11},{h:5,par:4,yards:356,rank:1},{h:6,par:3,yards:114,rank:13},
        {h:7,par:4,yards:347,rank:7},{h:8,par:5,yards:517,rank:9},{h:9,par:4,yards:335,rank:5},
        {h:10,par:5,yards:504,rank:8},{h:11,par:4,yards:317,rank:14},{h:12,par:3,yards:151,rank:16},
        {h:13,par:4,yards:311,rank:18},{h:14,par:5,yards:509,rank:4},{h:15,par:3,yards:178,rank:10},
        {h:16,par:4,yards:343,rank:12},{h:17,par:4,yards:394,rank:2},{h:18,par:4,yards:429,rank:6},
      ]},
      { name:'Red', slope:126, rating:69.6, par:72, holes:[
        {h:1,par:4,yards:325,rank:7},{h:2,par:4,yards:221,rank:13},{h:3,par:3,yards:122,rank:17},
        {h:4,par:5,yards:381,rank:11},{h:5,par:4,yards:348,rank:3},{h:6,par:3,yards:108,rank:15},
        {h:7,par:4,yards:305,rank:1},{h:8,par:5,yards:408,rank:9},{h:9,par:4,yards:325,rank:5},
        {h:10,par:5,yards:430,rank:18},{h:11,par:4,yards:309,rank:2},{h:12,par:3,yards:141,rank:10},
        {h:13,par:4,yards:293,rank:12},{h:14,par:5,yards:417,rank:16},{h:15,par:3,yards:129,rank:14},
        {h:16,par:4,yards:295,rank:8},{h:17,par:4,yards:320,rank:4},{h:18,par:4,yards:355,rank:6},
      ]},
    ]
  },
  {
    id:'disney_lbv', name:"Disney's Lake Buena Vista Golf Course", location:'Lake Buena Vista, FL',
    tees:[
      { name:'Blue', slope:133, rating:72.3, par:72, holes:[
        {h:1,par:5,yards:514,rank:3},{h:2,par:3,yards:176,rank:15},{h:3,par:4,yards:409,rank:7},
        {h:4,par:4,yards:382,rank:9},{h:5,par:4,yards:390,rank:11},{h:6,par:4,yards:354,rank:13},
        {h:7,par:3,yards:157,rank:17},{h:8,par:5,yards:524,rank:1},{h:9,par:4,yards:381,rank:5},
        {h:10,par:4,yards:375,rank:18},{h:11,par:4,yards:449,rank:2},{h:12,par:3,yards:208,rank:14},
        {h:13,par:4,yards:407,rank:16},{h:14,par:5,yards:521,rank:12},{h:15,par:4,yards:384,rank:8},
        {h:16,par:3,yards:200,rank:10},{h:17,par:5,yards:533,rank:6},{h:18,par:4,yards:438,rank:4},
      ]},
      { name:'White', slope:130, rating:70.1, par:72, holes:[
        {h:1,par:5,yards:489,rank:3},{h:2,par:3,yards:152,rank:15},{h:3,par:4,yards:373,rank:7},
        {h:4,par:4,yards:367,rank:9},{h:5,par:4,yards:369,rank:11},{h:6,par:4,yards:332,rank:13},
        {h:7,par:3,yards:117,rank:17},{h:8,par:5,yards:502,rank:1},{h:9,par:4,yards:360,rank:5},
        {h:10,par:4,yards:360,rank:18},{h:11,par:4,yards:425,rank:2},{h:12,par:3,yards:176,rank:14},
        {h:13,par:4,yards:329,rank:16},{h:14,par:5,yards:483,rank:12},{h:15,par:4,yards:359,rank:8},
        {h:16,par:3,yards:165,rank:10},{h:17,par:5,yards:511,rank:6},{h:18,par:4,yards:395,rank:4},
      ]},
      { name:'Gold', slope:125, rating:68.5, par:72, holes:[
        {h:1,par:5,yards:467,rank:3},{h:2,par:3,yards:139,rank:15},{h:3,par:4,yards:353,rank:7},
        {h:4,par:4,yards:351,rank:9},{h:5,par:4,yards:348,rank:11},{h:6,par:4,yards:317,rank:13},
        {h:7,par:3,yards:94,rank:17},{h:8,par:5,yards:480,rank:1},{h:9,par:4,yards:344,rank:5},
        {h:10,par:4,yards:345,rank:18},{h:11,par:4,yards:410,rank:2},{h:12,par:3,yards:158,rank:14},
        {h:13,par:4,yards:313,rank:16},{h:14,par:5,yards:457,rank:12},{h:15,par:4,yards:326,rank:8},
        {h:16,par:3,yards:156,rank:10},{h:17,par:5,yards:491,rank:6},{h:18,par:4,yards:370,rank:4},
      ]},
      { name:'Red', slope:119, rating:69.7, par:73, holes:[
        {h:1,par:5,yards:421,rank:7},{h:2,par:3,yards:126,rank:15},{h:3,par:4,yards:288,rank:9},
        {h:4,par:4,yards:277,rank:11},{h:5,par:4,yards:296,rank:5},{h:6,par:4,yards:258,rank:13},
        {h:7,par:3,yards:77,rank:17},{h:8,par:5,yards:442,rank:1},{h:9,par:4,yards:304,rank:3},
        {h:10,par:4,yards:325,rank:4},{h:11,par:5,yards:398,rank:14},{h:12,par:3,yards:115,rank:18},
        {h:13,par:4,yards:286,rank:10},{h:14,par:5,yards:423,rank:12},{h:15,par:4,yards:284,rank:8},
        {h:16,par:3,yards:137,rank:16},{h:17,par:5,yards:433,rank:6},{h:18,par:4,yards:314,rank:2},
      ]},
    ]
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const genCode = (len = 6) => Math.random().toString(36).slice(2, 2 + len).toUpperCase();
const courseHcp = (hi: number, slope: number) => Math.round((hi * slope) / 113);
const pairingPlayingHcp = (ids: string[], format: string, tee: Tee, players: Player[]) => {
  if (!tee || !ids?.length) return 0;
  const fmt = FORMATS[format];
  const hcps = ids.map(id => { const p = players.find(x => x.id === id); return courseHcp(p?.handicapIndex ?? 0, tee.slope); });
  if (fmt.hcpType === 'full') return hcps[0] ?? 0;
  if (fmt.hcpType === 'avg') return Math.round(hcps.reduce((a,b)=>a+b,0)/hcps.length);
  if (fmt.hcpType === 'avg75') return Math.round(hcps.reduce((a,b)=>a+b,0)/hcps.length*0.75);
  return 0;
};
const matchplayStrokes = (hcp1: number, hcp2: number, rank: number) => {
  const diff = Math.abs(hcp1-hcp2);
  const gets = diff>0 && rank<=diff ? 1 : 0;
  return hcp1>hcp2 ? {t1:gets,t2:0} : hcp2>hcp1 ? {t1:0,t2:gets} : {t1:0,t2:0};
};
const skinsStrokes = (pHcps: Record<string,number>, rank: number) => {
  const vals = Object.values(pHcps);
  if (!vals.length) return {} as Record<string,number>;
  const min = Math.min(...vals);
  const out: Record<string,number> = {};
  for (const [k,hcp] of Object.entries(pHcps)) out[k] = (hcp-min>0 && rank<=(hcp-min)) ? 1 : 0;
  return out;
};
const calcMatchPts = (m: Match) => {
  const fmt = FORMATS[m.format];
  if (!fmt) return 0;
  if (fmt.perHole) return 0.5;
  return fmt.pointsPerMatchup * fmt.numMatchups * (m.holes===18 ? 2 : 1);
};

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const BG = ({children, dark = false}: {children: React.ReactNode; dark?: boolean}) => (
  <div className={`min-h-screen relative overflow-hidden ${dark 
    ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-950 text-gray-100' 
    : 'bg-gradient-to-br from-green-50 via-emerald-50 to-green-100'}`}>
    <div className="absolute inset-0 pointer-events-none select-none" style={{opacity: dark ? 0.08 : 0.035}}>
      {['top-6 left-6','top-1/3 right-8','bottom-20 left-1/4','bottom-1/3 right-1/3'].map((p,i)=>(
        <div key={i} className={`absolute ${p} text-9xl ${dark ? 'text-gray-300 opacity-40' : ''}`}>{i%2?'🏌️':'⛳'}</div>
      ))}
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

const Card = ({children, className=''}: {children: React.ReactNode; className?: string}) => (
  <div className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-green-200 dark:bg-gray-800/95 dark:border-gray-700 dark:text-gray-100 ${className}`}>{children}</div>
);

const Btn = ({onClick, children, color='green', className='', disabled=false, sm=false}: {
  onClick?: ()=>void; children: React.ReactNode; color?: string; className?: string; disabled?: boolean; sm?: boolean;
}) => {
  const C: Record<string,string> = {
    green:'bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600',
    blue:'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-600',
    orange:'bg-orange-500 hover:bg-orange-600 text-white dark:bg-orange-600 dark:hover:bg-orange-500',
    teal:'bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600',
    ghost:'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-200',
  };
  return <button onClick={onClick} disabled={disabled} className={`${sm?'px-3 py-1.5 text-sm':'px-4 py-2'} rounded-lg font-semibold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${C[color]??C.green} ${className}`}>{children}</button>;
};

const Inp = ({label, value, onChange, type='text', placeholder='', className='', onKeyDown}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  type?: string; placeholder?: string; className?: string; onKeyDown?: (e:React.KeyboardEvent)=>void;
}) => (
  <div className={className}>
    {label && <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
    <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:focus:ring-green-500 dark:placeholder-gray-400"/>
  </div>
);

const Sel = ({label, value, onChange, options, className=''}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  options: {value: string|number; label: string}[]; className?: string;
}) => (
  <div className={className}>
    {label && <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-400 outline-none text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:focus:ring-green-500">
      {options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Badge = ({children, color='gray'}: {children: React.ReactNode; color?: string}) => {
  const C: Record<string,string> = {
    green:'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    blue:'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    red:'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    gray:'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    orange:'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    purple:'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${C[color]??C.gray}`}>{children}</span>;
};

const blankTee = (): Tee => ({name:'',slope:113,rating:72,par:72,holes:Array.from({length:18},(_,i)=>({h:i+1,par:4,yards:0,rank:i+1}))});

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function GolfScoringApp() {
  const [screen, setScreen] = useState<string>('login');
  const [role, setRole] = useState<string|null>(null);
  const [tournId, setTournId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [tData, setTData] = useState<Tournament|null>(null);
  const [localScores, setLocalScores] = useState<Record<string,(number|null)[]>>({});
  const [activeMatchId, setActiveMatchId] = useState<string|null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [showMatchBuilder, setShowMatchBuilder] = useState(false);
  const [viewingMatchId, setViewingMatchId] = useState<string|null>(null);
  const [editingScores, setEditingScores] = useState(false);
  const [expandedMatches, setExpandedMatches] = useState<Record<string,boolean>>({});
  const [darkMode, setDarkMode] = useState(false);

  const toggleExpanded = (mid: string) => setExpandedMatches(prev=>({...prev,[mid]:!prev[mid]}));

  const [manualCourse, setManualCourse] = useState<Course>({id:'',name:'',location:'',tees:[blankTee()]});
  const unsubRef = useRef<(()=>void)|null>(null);

  // ── Firebase ────────────────────────────────────────────────────────────────
  const normalizeTournament = (data: Tournament): Tournament => {
    return {
      ...data,
      players: data.players ?? [],
      matches: (data.matches ?? []).map(m => {
        const {pairings: emptyP, pairingHcps: emptyH} = getEmptyPairings(m.format);
        return {
          ...m,
          pairings: m.pairings ? Object.fromEntries(Object.entries(m.pairings).map(([k,v])=>[k,v??[]])) : emptyP,
          pairingHcps: m.pairingHcps ? Object.fromEntries(Object.entries(m.pairingHcps).map(([k,v])=>[k,v??0])) : emptyH,
        };
      }),
      matchResults: data.matchResults ?? [],
      courses: data.courses ?? PRESET_COURSES,
      teams: { team1: data.teams?.team1 ?? [], team2: data.teams?.team2 ?? [] },
      teamNames: { team1: data.teamNames?.team1 ?? 'Team 1', team2: data.teamNames?.team2 ?? 'Team 2' },
    };
  };

  useEffect(() => {
    if (!tournId) return;
    unsubRef.current?.();
    const tournRef = ref(db, `tournaments/${tournId}`);
    const unsubTourn = onValue(tournRef, snap => {
      const data = snap.val() as Tournament|null;
      if (data) setTData(normalizeTournament(data));
    });
    let unsubScores: (()=>void)|undefined;
    if (activeMatchId) {
      const scoresRef = ref(db, `scores/${tournId}/${activeMatchId}`);
      unsubScores = onValue(scoresRef, snap => {
        const s = snap.val() as Record<string,(number|null)[]>|null;
        if (s) setLocalScores(prev=>({...prev,...s}));
      });
    }
    unsubRef.current = () => { unsubTourn(); unsubScores?.(); };
    return () => { unsubRef.current?.(); };
  }, [tournId, activeMatchId]);

  const loadTournament = async (id: string) => { const s=await get(ref(db,`tournaments/${id}`)); return s.val() as Tournament|null; };
  const saveTournament = async (data: Tournament, id=tournId) => { await set(ref(db,`tournaments/${id}`),data); };
  const loadMatchScores = async (mid: string) => { const s=await get(ref(db,`scores/${tournId}/${mid}`)); return (s.val() as Record<string,(number|null)[]>) ?? {}; };
  const saveMatchScores = async (mid: string, scores: Record<string,(number|null)[]>) => { await set(ref(db,`scores/${tournId}/${mid}`),scores); };

  const createTournament = async () => {
    const id=genCode(6), pc=genCode(4), adminPc=genCode(4);
    const players: Player[] = [
      {id:'p1',name:'Ryan', handicapIndex:10,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p2',name:'Doby', handicapIndex:11,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p3',name:'Stevie',handicapIndex:22,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p4',name:'Erm', handicapIndex:24,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p5',name:'Gibbs',handicapIndex:17,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p6',name:'Dief', handicapIndex:18,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p7',name:'Kev', handicapIndex:21,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
      {id:'p8',name:'Geoff',handicapIndex:28,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0,teamPointsContributed:0,netUnderParHoles:0}},
    ];
    const data: Tournament = {
      id, name:'Warrior Cup '+new Date().getFullYear(), passcode:pc, adminPasscode:adminPc,
      courses:PRESET_COURSES, activeCourseId:'hawks_landing', activeTeeId:'Black',
      teamNames:{team1:'Team 1',team2:'Team 2'},
      players,
      teams:{
        team2:['p1','p2','p3','p4'],
        team1:['p5','p6','p7','p8'],
      },
      matches:[], matchResults:[], createdAt:new Date().toISOString(),
    };
    await saveTournament(data, id);
    setTournId(id); setTData(data); setPasscode(adminPc); setRole('admin'); setScreen('admin');
  };

  const joinTournament = async (asAdmin: boolean) => {
    setLoginErr(''); setLoading(true);
    const data = await loadTournament(tournId.toUpperCase().trim());
    if (!data) { setLoginErr('Tournament not found.'); setLoading(false); return; }
    if (asAdmin && passcode!==data.adminPasscode) { setLoginErr('Wrong admin passcode.'); setLoading(false); return; }
    if (!asAdmin && passcode!==data.passcode) { setLoginErr('Wrong passcode.'); setLoading(false); return; }
    setTData(data); setRole(asAdmin?'admin':'player');
    setTournId(tournId.toUpperCase().trim());
    setScreen(asAdmin?'admin':'tournament'); setLoading(false);
  };

  const updateTournament = async (updater: (d:Tournament)=>Tournament) => {
    if (!tData) return;
    const next = updater(tData); setTData(next); await saveTournament(next); return next;
  };

  const getTee = (data=tData): Tee|null => {
    if (!data) return null;
    return data.courses.find(c=>c.id===data.activeCourseId)?.tees.find(t=>t.name===data.activeTeeId) ?? null;
  };

  const getTeeForMatch = (m: Match|null, data=tData): Tee|null => {
    if (!data) return null;
    const cid = m?.courseId ?? data.activeCourseId;
    const tid = m?.teeId ?? data.activeTeeId;
    return data.courses.find(c=>c.id===cid)?.tees.find(t=>t.name===tid) ?? null;
  };

  const getMatch = (mid: string|null) => tData?.matches?.find(m=>m.id===mid) ?? null;
  const getResult = (mid: string) => tData?.matchResults?.find(r=>r.matchId===mid) ?? null;
  const teamPoints = (team: string, data=tData) => (data?.matchResults??[]).reduce((s,r)=>s+(r.teamPoints?.[team]??0),0);
  const totalPossiblePts = (data=tData) => (data?.matches??[]).reduce((s,m)=>s+calcMatchPts(m),0);

  const setScore = (pid: string, hole: number, val: number|null) => {
    setLocalScores(prev=>{
      const arr = prev[pid] ? [...prev[pid]] : Array(getMatch(activeMatchId)?.holes??9).fill(null);
      arr[hole-1]=val; return {...prev,[pid]:arr};
    });
  };

  const saveScores = async () => { if (activeMatchId) await saveMatchScores(activeMatchId, localScores); };

  const pairRawScore = (m: Match, pk: string, hole: number, scores: Record<string,(number|null)[]>) => {
    const ids = m.pairings[pk];
    if (!ids?.length) return null;
    const raw = ids.map(id=>scores[id]?.[hole-1]).filter((v): v is number => v!=null);
    if (!raw.length) return null;
    return (m.format==='bestball'||m.format==='singles') ? Math.min(...raw) : raw[0];
  };

  const calcHoleResults = (m: Match, hole: number, scores: Record<string,(number|null)[]>, tee: Tee|null) => {
    if (!m?.pairingHcps||!tee) return null;
    const actualHole = hole+(m.startHole-1);
    const hd = tee.holes.find(h=>h.h===actualHole);
    const rank = hd?.rank ?? hole;
    const skinSt = skinsStrokes(m.pairingHcps, rank);
    if (m.format==='modifiedscramble') {
      const netOf = (pk: string) => {
        const raw = pairRawScore(m, pk, hole, scores);
        return raw != null ? raw - (skinSt[pk]||0) : null;
      };
      const t1Nets = ['t1p1','t1p2'].map(netOf).filter((v): v is number => v!=null);
      const t2Nets = ['t2p1','t2p2'].map(netOf).filter((v): v is number => v!=null);
      const allSkinNets = ['t1p1','t1p2','t2p1','t2p2'].map(pk => {
        const raw = pairRawScore(m, pk, hole, scores);
        if (raw == null) return null;
        return { pk, ids: m.pairings[pk]??[], net: raw - (skinSt[pk]||0) };
      }).filter(Boolean) as {pk:string;ids:string[];net:number}[];
      let skinWinner = null;
      if (allSkinNets.length === 4) {
        const best = Math.min(...allSkinNets.map(x=>x.net));
        const winners = allSkinNets.filter(x=>x.net===best);
        if (winners.length === 1) skinWinner = winners[0];
      }
      if (!t1Nets.length || !t2Nets.length) {
        return {matchupResults:[{a:'t1',b:'t2',winner:null as string|null,netA:0,netB:0,isTeamResult:true}],skinWinner,rank,hd};
      }
      const t1Best = Math.min(...t1Nets);
      const t2Best = Math.min(...t2Nets);
      const winner = t1Best < t2Best ? 't1p' : t2Best < t1Best ? 't2p' : 'tie';
      return {
        matchupResults:[{a:'t1',b:'t2',winner,netA:t1Best,netB:t2Best,isTeamResult:true}],
        skinWinner, rank, hd
      };
    }
    const pairs = getMatchupPairs(m.format);
    const matchupResults = pairs.map(([a,b]) => {
      const rawA=pairRawScore(m,a,hole,scores), rawB=pairRawScore(m,b,hole,scores);
      if(rawA==null||rawB==null) return {a,b,winner:null as string|null,netA:0,netB:0};
      const {t1,t2}=matchplayStrokes(m.pairingHcps[a]??0,m.pairingHcps[b]??0,rank);
      const netA=rawA-t1, netB=rawB-t2;
      return {a,b,netA,netB,winner:netA<netB?'t1p':netB<netA?'t2p':'tie'};
    });
    const allPkKeys = Object.keys(m.pairings);
    const skinNets = allPkKeys.map(pk=>{
      const raw=pairRawScore(m,pk,hole,scores); if(raw==null) return null;
      return {pk,ids:m.pairings[pk]??[],net:raw-(skinSt[pk]||0)};
    }).filter(Boolean) as {pk:string;ids:string[];net:number}[];
    let skinWinner=null;
    if(skinNets.length>=4){const best=Math.min(...skinNets.map(x=>x.net));const w=skinNets.filter(x=>x.net===best);if(w.length===1)skinWinner=w[0];}
    return {matchupResults,skinWinner,rank,hd};
  };

  const calcMatchStatus = (m: Match, scores: Record<string,(number|null)[]>, tee: Tee|null) => {
    if(!m||!tee) return {t1Holes:0,t2Holes:0,label:'AS',leader:null as string|null,playerSkins:{} as Record<string,number>};
    let t1=0,t2=0; const playerSkins: Record<string,number>={};
    Object.values(m.pairings).flat().forEach(id=>{playerSkins[id]=0;});
    for(let h=1;h<=m.holes;h++){
      const res=calcHoleResults(m,h,scores,tee); if(!res) continue;
      for(const r of res.matchupResults){if(r.winner==='t1p')t1++;else if(r.winner==='t2p')t2++;}
      if(res.skinWinner){const v=1/res.skinWinner.ids.length;res.skinWinner.ids.forEach(id=>{playerSkins[id]=(playerSkins[id]||0)+v;});}
    }
    const lead=Math.abs(t1-t2),rem=m.holes-currentHole;
    let label='AS';
    if(t1>t2) label=(lead>rem&&rem>=0)?`${lead}&${rem}`:`${lead}UP`;
    else if(t2>t1) label=(lead>rem&&rem>=0)?`${lead}&${rem}`:`${lead}UP`;
    return{t1Holes:t1,t2Holes:t2,label,leader:t1>t2?'team1':t2>t1?'team2':null,playerSkins};
  };

  const finishMatch = async () => {
    const m=getMatch(activeMatchId); const tee=getTeeForMatch(m);
    if(!m||!tee) return;
    const fmt=FORMATS[m.format];
    const matchupPts={team1:0,team2:0};
    if(fmt.perHole) {
      let t1Holes=0, t2Holes=0;
      for(let h=1;h<=m.holes;h++){
        const res=calcHoleResults(m,h,localScores,tee);
        const w=res?.matchupResults[0]?.winner;
        if(w==='t1p') t1Holes++;
        else if(w==='t2p') t2Holes++;
      }
      if(t1Holes>t2Holes) matchupPts.team1=0.5;
      else if(t2Holes>t1Holes) matchupPts.team2=0.5;
      else { matchupPts.team1=0.25; matchupPts.team2=0.25; }
    } else {
      const pairs = getMatchupPairs(m.format);
      for(const [a,b] of pairs){
        let at1=0,at2=0;
        for(let h=1;h<=m.holes;h++){
          const res=calcHoleResults(m,h,localScores,tee);
          const mr=res?.matchupResults.find(x=>x.a===a&&x.b===b);
          if(mr?.winner==='t1p')at1++;else if(mr?.winner==='t2p')at2++;
        }
        const pts=fmt.pointsPerMatchup;
        if(at1>at2)matchupPts.team1+=pts;
        else if(at2>at1)matchupPts.team2+=pts;
        else{matchupPts.team1+=pts/2;matchupPts.team2+=pts/2;}
      }
    }
    const ms=calcMatchStatus(m,localScores,tee);
    const result: MatchResult={
      matchId:m.id,format:m.format,holes:m.holes,startHole:m.startHole,
      teamPoints:matchupPts,totalPoints:calcMatchPts(m),
      team1HolesWon:ms.t1Holes,team2HolesWon:ms.t2Holes,
      leader:ms.leader,playerSkins:ms.playerSkins,completedAt:new Date().toISOString(),
    };
    await saveMatchScores(activeMatchId!,localScores);
    const t1Ids = ['t1p1','t1p2','t1p3','t1p4'].flatMap(k=>m.pairings[k]??[]).filter(Boolean);
    const t2Ids = ['t2p1','t2p2','t2p3','t2p4'].flatMap(k=>m.pairings[k]??[]).filter(Boolean);
    const allIds = [...t1Ids,...t2Ids];
    const winnerTeam = matchupPts.team1>matchupPts.team2?'team1':matchupPts.team2>matchupPts.team1?'team2':null;
    await updateTournament(d=>({
      ...d,
      matches:d.matches.map(mx=>mx.id===activeMatchId?{...mx,completed:true}:mx),
      matchResults:[...(d.matchResults||[]).filter(r=>r.matchId!==activeMatchId),result],
      players:d.players.map(p=>{
        if(!allIds.includes(p.id)) return p;
        const isT1=t1Ids.includes(p.id);
        const myTeam=isT1?'team1':'team2';
        const holesWonCount=isT1?ms.t1Holes:ms.t2Holes;
        const skinsWonCount=ms.playerSkins[p.id]||0;
        const pointsContrib = result.teamPoints[myTeam] || 0;
        let underParCount = 0;
        if (localScores[p.id]) {
          const pairingKey = Object.keys(m.pairings).find(k => m.pairings[k].includes(p.id));
          if (pairingKey) {
            const pairHcp = m.pairingHcps[pairingKey] || 0;
            const playersInPair = m.pairings[pairingKey].length;
            const avgStrokesPerPlayer = Math.round(pairHcp / playersInPair);
            for (let hi = 0; hi < localScores[p.id].length; hi++) {
              const gross = localScores[p.id][hi];
              if (gross == null) continue;
              const actualHole = (hi + 1) + (m.startHole - 1);
              const par = tee.holes.find(h => h.h === actualHole)?.par ?? 4;
              const net = gross - avgStrokesPerPlayer;
              if (net < par) underParCount++;
            }
          }
        }
        return {
          ...p,
          stats:{
            matchesPlayed:(p.stats?.matchesPlayed||0)+1,
            matchesWon:(p.stats?.matchesWon||0)+(winnerTeam===myTeam?1:0),
            holesWon:(p.stats?.holesWon||0)+holesWonCount,
            skinsWon:(p.stats?.skinsWon||0)+skinsWonCount,
            teamPointsContributed: (p.stats?.teamPointsContributed||0) + pointsContrib,
            netUnderParHoles: (p.stats?.netUnderParHoles||0) + underParCount,
          }
        };
      }),
    }));
    setActiveMatchId(null);setLocalScores({});setScreen('tournament');
  };

  const addCourse = async (course: Course) => {
    await updateTournament(d=>({...d,courses:[...d.courses.filter(c=>c.id!==course.id),course]}));
    setManualCourse({id:'',name:'',location:'',tees:[blankTee()]});
    setScreen('admin');
  };

  const logout = () => { unsubRef.current?.(); setRole(null);setTData(null);setTournId('');setPasscode('');setEditingScores(false);setScreen('login'); };

  const tee=getTee();
  const t1pts=teamPoints('team1');
  const t2pts=teamPoints('team2');
  const possiblePts=totalPossiblePts();
  const toWin=possiblePts/2+0.5;

  const TopBar = ({title,back}:{title?:string;back?:()=>void}) => (
    <Card className="p-4 flex items-center justify-between">
      <div>
        {back&&<button onClick={back} className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 mb-1 flex items-center gap-1"><ChevronLeft className="w-3 h-3"/>Back</button>}
        <h1 className="text-xl font-black text-gray-800 dark:text-gray-100">{title??tData?.name}</h1>
        {tee&&!title&&<div className="text-xs text-gray-400 dark:text-gray-500">{(tData?.courses??[]).find(c=>c.id===tData?.activeCourseId)?.name??''} · {tee.name} Tees · Slope {tee.slope}</div>}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Badge color={role==='admin'?'orange':'blue'}>{role==='admin'?'Admin':'Player'}</Badge>
        {role==='admin'&&screen!=='admin'&&<Btn color="ghost" sm onClick={()=>setScreen('admin')}>Settings</Btn>}
        {screen!=='standings'&&<Btn color="ghost" sm onClick={()=>setScreen('standings')}>Standings</Btn>}
        {screen!=='tournament'&&<Btn color="orange" sm onClick={()=>setScreen('tournament')}>Schedule</Btn>}
        <Btn 
          color="ghost" 
          sm 
          onClick={() => setDarkMode(prev => !prev)}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {darkMode ? 'Light' : 'Dark'}
        </Btn>
        <Btn color="ghost" sm onClick={logout}><LogOut className="w-4 h-4"/></Btn>
      </div>
    </Card>
  );

  // LOGIN
  if (screen==='login') return (
    <BG dark={darkMode}><div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm space-y-4">
        <Card className="p-6 text-center">
          <Trophy className="w-12 h-12 text-green-600 mx-auto mb-3 dark:text-green-400"/>
          <h1 className="text-3xl font-black text-gray-800 dark:text-gray-100">Warrior Cup</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ryder Cup Style Golf Tournament</p>
        </Card>
        <Card className="p-6 space-y-4">
          <Inp label="Tournament ID" value={tournId} onChange={v=>setTournId(v.toUpperCase())} placeholder="e.g. ABC123" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
          <Inp label="Passcode" value={passcode} onChange={setPasscode} placeholder="Enter passcode" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
          {loginErr&&<div className="text-sm text-red-600 font-semibold bg-red-50 p-2 rounded-lg dark:bg-red-950/50 dark:text-red-300">{loginErr}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Btn color="blue" onClick={()=>joinTournament(false)} disabled={loading||!tournId||!passcode}>
              <span className="flex items-center justify-center gap-1"><Users className="w-4 h-4"/>Player</span>
            </Btn>
            <Btn color="green" onClick={()=>joinTournament(true)} disabled={loading||!tournId||!passcode}>
              <span className="flex items-center justify-center gap-1"><Lock className="w-4 h-4"/>Admin</span>
            </Btn>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm mb-3">Starting a new trip?</div>
          <Btn color="orange" onClick={createTournament} className="w-full" disabled={loading}>
            <span className="flex items-center justify-center gap-1"><Plus className="w-4 h-4"/>Create Tournament</span>
          </Btn>
        </Card>
      </div>
    </div></BG>
  );

  if (!tData) return <BG dark={darkMode}><div className="flex items-center justify-center min-h-screen text-xl text-gray-500 dark:text-gray-400">Loading…</div></BG>;

  // ADMIN
  if (screen==='admin') return (
    <BG dark={darkMode}><div className="max-w-5xl mx-auto p-4 space-y-4">
      <TopBar/>
      <Card className="p-4 bg-green-50 border-green-300 border dark:bg-green-950/30 dark:border-green-800">
        <div className="text-sm font-bold text-green-800 dark:text-green-300 mb-2">Share With Your Group</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-xs text-gray-500 dark:text-gray-400">Tournament ID</div><div className="text-xl font-black text-green-700 dark:text-green-300">{tData.id}</div></div>
          <div><div className="text-xs text-gray-500 dark:text-gray-400">Player Code</div><div className="text-xl font-black text-blue-700 dark:text-blue-300">{tData.passcode}</div></div>
          <div><div className="text-xs text-gray-500 dark:text-gray-400">Admin Code</div><div className="text-xl font-black text-orange-700 dark:text-orange-300">{tData.adminPasscode}</div></div>
        </div>
      </Card>
      {/* Your full admin UI code goes here - keep it as is */}
      {/* ... */}
    </div></BG>
  );

  // COURSE SEARCH
  if (screen==='courseSearch') return (
    <BG dark={darkMode}><div className="max-w-3xl mx-auto p-4 space-y-4">
      <TopBar title="Add a Course" back={()=>setScreen('admin')}/>
      {/* Your full course entry UI code goes here */}
    </div></BG>
  );

  // TOURNAMENT SCHEDULE
  if (screen==='tournament') {
    // Your full tournament code here (MatchCard, AddMatchForm, etc.)
    return <BG dark={darkMode}><div className="max-w-5xl mx-auto p-4 space-y-4">
      <TopBar/>
      {/* ... */}
    </div></BG>;
  }

  // SCORING (guarded)
  if (screen === 'scoring') {
    const m = getMatch(activeMatchId);

    if (!activeMatchId || !m) {
      return (
        <BG dark={darkMode}>
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-4">Match Not Found</div>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-8 max-w-md">
              The match you're trying to score could not be loaded.
            </p>
            <Btn color="blue" onClick={() => { setActiveMatchId(null); setScreen('tournament'); }}>
              Return to Schedule
            </Btn>
          </div>
        </BG>
      );
    }

    // Your original scoring UI code here (PairEntry, hole navigation, etc.)
    return (
      <BG dark={darkMode}>
        <div className="max-w-2xl mx-auto p-4 space-y-6 pb-24">
          {/* Your scoring content */}
        </div>
      </BG>
    );
  }

  // STANDINGS (with your requested MVP waterfall)
  if (screen==='standings') {
    const players = tData.players ?? [];
    const contribs = [...players]
      .map(p => ({
        ...p,
        score: {
          primary: p.stats?.teamPointsContributed || 0,
          tiebreaker1: p.stats?.netUnderParHoles || 0,
          tiebreaker2: p.stats?.skinsWon || 0,
        }
      }))
      .sort((a, b) => {
        if (b.score.primary !== a.score.primary) return b.score.primary - a.score.primary;
        if (b.score.tiebreaker1 !== a.score.tiebreaker1) return b.score.tiebreaker1 - a.score.tiebreaker1;
        return b.score.tiebreaker2 - a.score.tiebreaker2;
      });

    return (
      <BG dark={darkMode}>
        <div className="max-w-5xl mx-auto p-4 space-y-4">
          <TopBar title="Standings" />

          <div className="grid grid-cols-3 gap-3">
            <Card className="p-5 text-center border-2 border-blue-200 dark:border-blue-700">
              <div className="text-6xl font-black text-blue-600 dark:text-blue-400">{t1pts}</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{tData.teamNames.team1}</div>
              {possiblePts>0&&<div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} to win</div>}
            </Card>
            <Card className="p-5 text-center border-2 border-gray-200 dark:border-gray-600">
              <div className="text-2xl font-black text-gray-700 dark:text-gray-300 mt-1">{possiblePts} pts</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total possible points</div>
            </Card>
            <Card className="p-5 text-center border-2 border-red-200 dark:border-red-700">
              <div className="text-6xl font-black text-red-600 dark:text-red-400">{t2pts}</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-300">{tData.teamNames.team2}</div>
              {possiblePts>0&&<div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Award className="w-6 h-6 text-yellow-600 dark:text-yellow-400"/><h2 className="text-xl font-bold">MVP Race</h2></div>
            <div className="space-y-2">
              {contribs.map((p,i)=>(
                <div key={p.id} className={`p-3 rounded-xl border ${i===0?'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30':'border-gray-200 bg-gray-50 dark:bg-gray-800/50'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{i===0?'🏆':i===1?'🥈':i===2?'🥉':`${i+1}`}</span>
                      <div>
                        <div className="font-bold">{p.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{tData.teams.team1.includes(p.id)?tData.teamNames.team1:tData.teamNames.team2}</div>
                      </div>
                    </div>
                    <div className="flex gap-6 text-center text-xs">
                      <div>
                        <div className="text-gray-400 dark:text-gray-500">Team Pts</div>
                        <div className="font-bold text-green-600 dark:text-green-400">{p.stats?.teamPointsContributed?.toFixed(1) || '0.0'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 dark:text-gray-500">Net < Par</div>
                        <div className="font-bold text-purple-600 dark:text-purple-400">{p.stats?.netUnderParHoles || 0}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 dark:text-gray-500">Skins</div>
                        <div className="font-bold text-orange-600 dark:text-orange-400">{(p.stats?.skinsWon || 0).toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </BG>
    );
  }

  return null;
}
