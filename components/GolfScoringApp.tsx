'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Plus, Trash2, Save, Award, ChevronLeft, ChevronRight,
  Check, Flag, Lock, Users, LogOut
} from 'lucide-react';
import { db } from '@/Lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Hole { h: number; par: number; yards: number; rank: number; }
interface Tee  { name: string; slope: number; rating: number; par: number; holes: Hole[]; }
interface Course { id: string; name: string; location: string; tees: Tee[]; }
interface Player { id: string; name: string; handicapIndex: number; stats: { matchesPlayed: number; matchesWon: number; holesWon: number; skinsWon: number; }; }
interface Match  {
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
// perHole=true → Modified Scramble: both teams score every hole, best team net
// wins the hole → exactly 1 pt per hole (0.5 each on tie). No matchup splitting.
const FORMATS: Record<string,{name:string;ppp:number;hcpType:string;holesOpts:number[];desc:string;pointsPerMatchup:number;numMatchups:number;perHole?:boolean}> = {
  modifiedscramble: { name:'Modified Scramble', ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Best team net wins hole — 1pt/hole max', pointsPerMatchup:1, numMatchups:1, perHole:true },
  bestball:         { name:'Best Ball',          ppp:2, hcpType:'full',  holesOpts:[9,18], desc:'Best individual net score wins',                          pointsPerMatchup:1, numMatchups:2 },
  scramble:         { name:'2-Man Scramble',     ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Team picks best shot each time',                          pointsPerMatchup:1, numMatchups:2 },
  alternateshot:    { name:'Alternate Shot',     ppp:2, hcpType:'avg',   holesOpts:[9,18], desc:'Partners alternate shots',                                pointsPerMatchup:1, numMatchups:2 },
  singles:          { name:'Singles',            ppp:1, hcpType:'full',  holesOpts:[9,18], desc:'4 individual 1v1 matches — 4 pts',                       pointsPerMatchup:1, numMatchups:4 },
};

// Returns the matchup pairs [teamA_key, teamB_key] for a given format
const getMatchupPairs = (format: string): [string,string][] =>
  format==='singles'
    ? [['t1p1','t2p1'],['t1p2','t2p2'],['t1p3','t2p3'],['t1p4','t2p4']]
    : [['t1p1','t2p1'],['t1p2','t2p2']];

const getEmptyPairings = (format: string) => {
  const slots = format==='singles'
    ? ['t1p1','t1p2','t1p3','t1p4','t2p1','t2p2','t2p3','t2p4']
    : ['t1p1','t1p2','t2p1','t2p2'];
  return {
    pairings:    Object.fromEntries(slots.map(k=>[k,[]])) as Record<string,string[]>,
    pairingHcps: Object.fromEntries(slots.map(k=>[k,0]))  as Record<string,number>,
  };
};

// ─── Pre-loaded Courses ───────────────────────────────────────────────────────
const PRESET_COURSES: Course[] = [
  {
    id:'hawks_landing', name:'Hawks Landing Golf Course', location:'Lake Buena Vista, FL',
    tees:[
      { name:'Black', slope:133, rating:70.2, par:71, holes:[
        {h:1,par:4,yards:425,rank:10},{h:2,par:3,yards:147,rank:18},{h:3,par:4,yards:385,rank:4},
        {h:4,par:5,yards:535,rank:2},{h:5,par:4,yards:332,rank:16},{h:6,par:5,yards:475,rank:14},
        {h:7,par:3,yards:230,rank:8},{h:8,par:4,yards:353,rank:12},{h:9,par:4,yards:404,rank:6},
        {h:10,par:5,yards:541,rank:7},{h:11,par:4,yards:385,rank:9},{h:12,par:4,yards:425,rank:5},
        {h:13,par:3,yards:160,rank:15},{h:14,par:4,yards:422,rank:3},{h:15,par:3,yards:142,rank:17},
        {h:16,par:4,yards:390,rank:11},{h:17,par:4,yards:275,rank:13},{h:18,par:3,yards:204,rank:1},
      ]},
      { name:'Green', slope:126, rating:67.8, par:71, holes:[
        {h:1,par:4,yards:391,rank:10},{h:2,par:3,yards:132,rank:18},{h:3,par:4,yards:356,rank:4},
        {h:4,par:5,yards:501,rank:2},{h:5,par:4,yards:307,rank:16},{h:6,par:5,yards:443,rank:14},
        {h:7,par:3,yards:199,rank:8},{h:8,par:4,yards:328,rank:12},{h:9,par:4,yards:374,rank:6},
        {h:10,par:5,yards:506,rank:7},{h:11,par:4,yards:360,rank:9},{h:12,par:4,yards:395,rank:5},
        {h:13,par:3,yards:140,rank:15},{h:14,par:4,yards:393,rank:3},{h:15,par:3,yards:122,rank:17},
        {h:16,par:4,yards:362,rank:11},{h:17,par:4,yards:249,rank:13},{h:18,par:3,yards:178,rank:1},
      ]},
      { name:'Gold', slope:119, rating:65.8, par:71, holes:[
        {h:1,par:4,yards:359,rank:10},{h:2,par:3,yards:113,rank:18},{h:3,par:4,yards:318,rank:4},
        {h:4,par:5,yards:460,rank:2},{h:5,par:4,yards:279,rank:16},{h:6,par:5,yards:400,rank:14},
        {h:7,par:3,yards:173,rank:8},{h:8,par:4,yards:296,rank:12},{h:9,par:4,yards:330,rank:6},
        {h:10,par:5,yards:461,rank:7},{h:11,par:4,yards:328,rank:9},{h:12,par:4,yards:349,rank:5},
        {h:13,par:3,yards:118,rank:15},{h:14,par:4,yards:353,rank:3},{h:15,par:3,yards:102,rank:17},
        {h:16,par:4,yards:318,rank:11},{h:17,par:4,yards:220,rank:13},{h:18,par:3,yards:152,rank:1},
      ]},
    ]
  },
  {
    id:'disney_magnolia', name:"Disney's Magnolia Golf Course", location:'Lake Buena Vista, FL',
    tees:[
      { name:'Green', slope:137, rating:74.0, par:71, holes:[
        {h:1,par:4,yards:424,rank:3},{h:2,par:4,yards:351,rank:15},{h:3,par:3,yards:161,rank:17},
        {h:4,par:5,yards:535,rank:11},{h:5,par:4,yards:446,rank:1},{h:6,par:3,yards:202,rank:13},
        {h:7,par:4,yards:410,rank:7},{h:8,par:5,yards:605,rank:9},{h:9,par:4,yards:426,rank:5},
        {h:10,par:5,yards:522,rank:8},{h:11,par:4,yards:382,rank:14},{h:12,par:3,yards:163,rank:16},
        {h:13,par:4,yards:374,rank:18},{h:14,par:4,yards:480,rank:4},{h:15,par:5,yards:565,rank:10},
        {h:16,par:3,yards:94,rank:12},{h:17,par:3,yards:85,rank:2},{h:18,par:4,yards:360,rank:6},
      ]},
      { name:'Blue', slope:131, rating:72.1, par:71, holes:[
        {h:1,par:4,yards:418,rank:3},{h:2,par:4,yards:417,rank:15},{h:3,par:3,yards:170,rank:17},
        {h:4,par:5,yards:542,rank:11},{h:5,par:4,yards:488,rank:1},{h:6,par:3,yards:202,rank:13},
        {h:7,par:4,yards:406,rank:7},{h:8,par:5,yards:610,rank:9},{h:9,par:4,yards:500,rank:5},
        {h:10,par:5,yards:526,rank:8},{h:11,par:4,yards:384,rank:14},{h:12,par:3,yards:169,rank:16},
        {h:13,par:4,yards:384,rank:18},{h:14,par:4,yards:455,rank:4},{h:15,par:5,yards:565,rank:10},
        {h:16,par:3,yards:114,rank:12},{h:17,par:3,yards:347,rank:2},{h:18,par:4,yards:360,rank:6},
      ]},
      { name:'White', slope:124, rating:69.6, par:71, holes:[
        {h:1,par:4,yards:313,rank:3},{h:2,par:4,yards:323,rank:15},{h:3,par:3,yards:147,rank:17},
        {h:4,par:5,yards:495,rank:11},{h:5,par:4,yards:432,rank:1},{h:6,par:3,yards:175,rank:13},
        {h:7,par:4,yards:396,rank:7},{h:8,par:5,yards:550,rank:9},{h:9,par:4,yards:435,rank:5},
        {h:10,par:5,yards:500,rank:8},{h:11,par:4,yards:328,rank:14},{h:12,par:3,yards:143,rank:16},
        {h:13,par:4,yards:372,rank:18},{h:14,par:4,yards:400,rank:4},{h:15,par:5,yards:515,rank:10},
        {h:16,par:3,yards:91,rank:12},{h:17,par:3,yards:85,rank:2},{h:18,par:4,yards:342,rank:6},
      ]},
      { name:'Gold', slope:117, rating:67.3, par:71, holes:[
        {h:1,par:4,yards:288,rank:3},{h:2,par:4,yards:296,rank:15},{h:3,par:3,yards:132,rank:17},
        {h:4,par:5,yards:460,rank:11},{h:5,par:4,yards:398,rank:1},{h:6,par:3,yards:155,rank:13},
        {h:7,par:4,yards:347,rank:7},{h:8,par:5,yards:500,rank:9},{h:9,par:4,yards:390,rank:5},
        {h:10,par:5,yards:452,rank:8},{h:11,par:4,yards:300,rank:14},{h:12,par:3,yards:118,rank:16},
        {h:13,par:4,yards:319,rank:18},{h:14,par:4,yards:350,rank:4},{h:15,par:5,yards:455,rank:10},
        {h:16,par:3,yards:78,rank:12},{h:17,par:3,yards:75,rank:2},{h:18,par:4,yards:297,rank:6},
      ]},
      { name:'Red', slope:117, rating:70.1, par:72, holes:[
        {h:1,par:4,yards:285,rank:3},{h:2,par:4,yards:271,rank:15},{h:3,par:3,yards:109,rank:17},
        {h:4,par:5,yards:430,rank:11},{h:5,par:5,yards:378,rank:1},{h:6,par:3,yards:131,rank:13},
        {h:7,par:4,yards:327,rank:7},{h:8,par:5,yards:468,rank:9},{h:9,par:4,yards:355,rank:5},
        {h:10,par:5,yards:434,rank:8},{h:11,par:4,yards:271,rank:14},{h:12,par:3,yards:100,rank:16},
        {h:13,par:4,yards:293,rank:18},{h:14,par:4,yards:320,rank:4},{h:15,par:5,yards:422,rank:10},
        {h:16,par:3,yards:69,rank:12},{h:17,par:3,yards:63,rank:2},{h:18,par:4,yards:267,rank:6},
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
  if (fmt.hcpType === 'full')  return hcps[0] ?? 0;
  if (fmt.hcpType === 'avg')   return Math.round(hcps.reduce((a,b)=>a+b,0)/hcps.length);
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

// Points for a match:
// - Modified Scramble (perHole): total = m.holes (1 pt per hole)
// - All others: pointsPerMatchup × numMatchups (doubled for 18 holes)
const calcMatchPts = (m: Match) => {
  const fmt = FORMATS[m.format];
  if (!fmt) return 0;
  if (fmt.perHole) return m.holes;
  return fmt.pointsPerMatchup * fmt.numMatchups * (m.holes===18 ? 2 : 1);
};

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const BG = ({children}: {children: React.ReactNode}) => (
  <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none select-none" style={{opacity:0.035}}>
      {['top-6 left-6','top-1/3 right-8','bottom-20 left-1/4','bottom-1/3 right-1/3'].map((p,i)=>(
        <div key={i} className={`absolute ${p} text-9xl`}>{i%2?'🏌️':'⛳'}</div>
      ))}
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);
const Card = ({children, className=''}: {children: React.ReactNode; className?: string}) => (
  <div className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-green-200 ${className}`}>{children}</div>
);
const Btn = ({onClick, children, color='green', className='', disabled=false, sm=false}: {
  onClick?: ()=>void; children: React.ReactNode; color?: string; className?: string; disabled?: boolean; sm?: boolean;
}) => {
  const C: Record<string,string> = {
    green:'bg-green-600 hover:bg-green-700 text-white', blue:'bg-blue-600 hover:bg-blue-700 text-white',
    orange:'bg-orange-500 hover:bg-orange-600 text-white', teal:'bg-teal-600 hover:bg-teal-700 text-white',
    ghost:'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700',
  };
  return <button onClick={onClick} disabled={disabled} className={`${sm?'px-3 py-1.5 text-sm':'px-4 py-2'} rounded-lg font-semibold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${C[color]??C.green} ${className}`}>{children}</button>;
};
const Inp = ({label, value, onChange, type='text', placeholder='', className='', onKeyDown}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  type?: string; placeholder?: string; className?: string; onKeyDown?: (e:React.KeyboardEvent)=>void;
}) => (
  <div className={className}>
    {label && <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>}
    <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-400 outline-none text-sm"/>
  </div>
);
const Sel = ({label, value, onChange, options, className=''}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  options: {value: string|number; label: string}[]; className?: string;
}) => (
  <div className={className}>
    {label && <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-400 outline-none text-sm">
      {options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);
const Badge = ({children, color='gray'}: {children: React.ReactNode; color?: string}) => {
  const C: Record<string,string> = {green:'bg-green-100 text-green-800',blue:'bg-blue-100 text-blue-800',red:'bg-red-100 text-red-800',gray:'bg-gray-100 text-gray-600',orange:'bg-orange-100 text-orange-800',purple:'bg-purple-100 text-purple-800'};
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${C[color]??C.gray}`}>{children}</span>;
};
const blankTee = (): Tee => ({name:'',slope:113,rating:72,par:72,holes:Array.from({length:18},(_,i)=>({h:i+1,par:4,yards:0,rank:i+1}))});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function GolfScoringApp() {
  const [screen, setScreen]               = useState<string>('login');
  const [role, setRole]                   = useState<string|null>(null);
  const [tournId, setTournId]             = useState('');
  const [passcode, setPasscode]           = useState('');
  const [loginErr, setLoginErr]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [tData, setTData]                 = useState<Tournament|null>(null);
  const [localScores, setLocalScores]     = useState<Record<string,(number|null)[]>>({});
  const [activeMatchId, setActiveMatchId] = useState<string|null>(null);
  const [currentHole, setCurrentHole]     = useState(1);
  const [showMatchBuilder, setShowMatchBuilder] = useState(false);
  const [viewingMatchId, setViewingMatchId]   = useState<string|null>(null);
  const [editingScores, setEditingScores]     = useState(false);

  // FIX 3: expanded state lives in parent so selections don't collapse it
  const [expandedMatches, setExpandedMatches] = useState<Record<string,boolean>>({});
  const toggleExpanded = (mid: string) => setExpandedMatches(prev=>({...prev,[mid]:!prev[mid]}));

  // Manual course entry
  const [manualCourse, setManualCourse] = useState<Course>({id:'',name:'',location:'',tees:[blankTee()]});

  const unsubRef = useRef<(()=>void)|null>(null);

  // ── Firebase normalization ───────────────────────────────────────────────────
  const normalizeTournament = (data: Tournament): Tournament => {
    return {
      ...data,
      players:      data.players      ?? [],
      matches:      (data.matches ?? []).map(m => {
        const {pairings: emptyP, pairingHcps: emptyH} = getEmptyPairings(m.format);
        return {
          ...m,
          pairings:    m.pairings    ? Object.fromEntries(Object.entries(m.pairings).map(([k,v])=>[k,v??[]])) : emptyP,
          pairingHcps: m.pairingHcps ? Object.fromEntries(Object.entries(m.pairingHcps).map(([k,v])=>[k,v??0])) : emptyH,
        };
      }),
      matchResults: data.matchResults ?? [],
      courses:      data.courses      ?? PRESET_COURSES,
      teams:     { team1: data.teams?.team1 ?? [], team2: data.teams?.team2 ?? [] },
      teamNames: { team1: data.teamNames?.team1 ?? 'Team 1', team2: data.teamNames?.team2 ?? 'Team 2' },
    };
  };

  // ── Firebase listeners ───────────────────────────────────────────────────────
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

  // ── Firebase CRUD ────────────────────────────────────────────────────────────
  const loadTournament = async (id: string) => { const s=await get(ref(db,`tournaments/${id}`)); return s.val() as Tournament|null; };
  const saveTournament = async (data: Tournament, id=tournId) => { await set(ref(db,`tournaments/${id}`),data); };
  const loadMatchScores = async (mid: string) => { const s=await get(ref(db,`scores/${tournId}/${mid}`)); return (s.val() as Record<string,(number|null)[]>) ?? {}; };
  const saveMatchScores = async (mid: string, scores: Record<string,(number|null)[]>) => { await set(ref(db,`scores/${tournId}/${mid}`),scores); };

  // ── Create / Join ────────────────────────────────────────────────────────────
  const createTournament = async () => {
    const id=genCode(6), pc=genCode(4), adminPc=genCode(4);
    const data: Tournament = {
      id, name:'Golf Trip '+new Date().getFullYear(), passcode:pc, adminPasscode:adminPc,
      courses:PRESET_COURSES, activeCourseId:'hawks_landing', activeTeeId:'Black',
      teamNames:{team1:'Team 1',team2:'Team 2'}, players:[], teams:{team1:[],team2:[]},
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

  // ── Tournament mutation ──────────────────────────────────────────────────────
  const updateTournament = async (updater: (d:Tournament)=>Tournament) => {
    if (!tData) return;
    const next = updater(tData); setTData(next); await saveTournament(next); return next;
  };

  // ── Tee helpers ──────────────────────────────────────────────────────────────
  const getTee = (data=tData): Tee|null => {
    if (!data) return null;
    return data.courses.find(c=>c.id===data.activeCourseId)?.tees.find(t=>t.name===data.activeTeeId) ?? null;
  };
  const getTeeForMatch = (m: Match|null, data=tData): Tee|null => {
    if (!data) return null;
    const cid = m?.courseId ?? data.activeCourseId;
    const tid = m?.teeId   ?? data.activeTeeId;
    return data.courses.find(c=>c.id===cid)?.tees.find(t=>t.name===tid) ?? null;
  };

  const getMatch  = (mid: string|null) => tData?.matches?.find(m=>m.id===mid) ?? null;
  const getResult = (mid: string)      => tData?.matchResults?.find(r=>r.matchId===mid) ?? null;
  const teamPoints = (team: string, data=tData) => (data?.matchResults??[]).reduce((s,r)=>s+(r.teamPoints?.[team]??0),0);
  const totalPossiblePts = (data=tData) => (data?.matches??[]).reduce((s,m)=>s+calcMatchPts(m),0);

  // ── Scoring helpers ──────────────────────────────────────────────────────────
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

  // FIX 1: Modified Scramble uses whole-team comparison — exactly 1 pt/hole max
  const calcHoleResults = (m: Match, hole: number, scores: Record<string,(number|null)[]>, tee: Tee|null) => {
    if (!m?.pairingHcps||!tee) return null;
    const actualHole = hole+(m.startHole-1);
    const hd = tee.holes.find(h=>h.h===actualHole);
    const rank = hd?.rank ?? hole;
    const skinSt = skinsStrokes(m.pairingHcps, rank);

    if (m.format==='modifiedscramble') {
      // Best net from each TEAM (min of t1p1/t1p2 nets vs min of t2p1/t2p2 nets)
      const t1Nets = (['t1p1','t1p2'] as const).map(pk=>{
        const raw=pairRawScore(m,pk,hole,scores);
        return raw!=null ? raw-(skinSt[pk]||0) : null;
      }).filter((v): v is number => v!=null);
      const t2Nets = (['t2p1','t2p2'] as const).map(pk=>{
        const raw=pairRawScore(m,pk,hole,scores);
        return raw!=null ? raw-(skinSt[pk]||0) : null;
      }).filter((v): v is number => v!=null);

      if (!t1Nets.length||!t2Nets.length) {
        return {matchupResults:[{a:'t1',b:'t2',winner:null as string|null,netA:0,netB:0,isTeamResult:true}],skinWinner:null,rank,hd};
      }
      const t1Best=Math.min(...t1Nets), t2Best=Math.min(...t2Nets);
      const winner = t1Best<t2Best?'t1p':t2Best<t1Best?'t2p':'tie';
      const skinNets = (['t1p1','t1p2','t2p1','t2p2'] as const).map(pk=>{
        const raw=pairRawScore(m,pk,hole,scores); if(raw==null) return null;
        return {pk,ids:m.pairings[pk]??[],net:raw-(skinSt[pk]||0)};
      }).filter(Boolean) as {pk:string;ids:string[];net:number}[];
      let skinWinner=null;
      if(skinNets.length===4){const best=Math.min(...skinNets.map(x=>x.net));const w=skinNets.filter(x=>x.net===best);if(w.length===1)skinWinner=w[0];}
      return {matchupResults:[{a:'t1',b:'t2',winner,netA:t1Best,netB:t2Best,isTeamResult:true}],skinWinner,rank,hd};
    }

    // Standard formats — use dynamic pairs (2 for most, 4 for singles)
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
      // Modified Scramble — 1pt per hole, awarded to winning team only
      for(let h=1;h<=m.holes;h++){
        const res=calcHoleResults(m,h,localScores,tee);
        const w=res?.matchupResults[0]?.winner;
        if(w==='t1p') matchupPts.team1+=1;
        else if(w==='t2p') matchupPts.team2+=1;
        else if(w==='tie'){matchupPts.team1+=0.5;matchupPts.team2+=0.5;}
      }
    } else {
      // Standard: points awarded per matchup won — supports 2 or 4 pairs (singles)
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

    // FIX: Update player stats (MVP tracking)
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
        return {
          ...p,
          stats:{
            matchesPlayed:(p.stats?.matchesPlayed||0)+1,
            matchesWon:(p.stats?.matchesWon||0)+(winnerTeam===myTeam?1:0),
            holesWon:(p.stats?.holesWon||0)+holesWonCount,
            skinsWon:(p.stats?.skinsWon||0)+skinsWonCount,
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
        {back&&<button onClick={back} className="text-sm text-gray-500 hover:text-gray-800 mb-1 flex items-center gap-1"><ChevronLeft className="w-3 h-3"/>Back</button>}
        <h1 className="text-xl font-black text-gray-800">{title??tData?.name}</h1>
        {tee&&!title&&<div className="text-xs text-gray-400">{(tData?.courses??[]).find(c=>c.id===tData?.activeCourseId)?.name??''} · {tee.name} Tees · Slope {tee.slope}</div>}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Badge color={role==='admin'?'orange':'blue'}>{role==='admin'?'Admin':'Player'}</Badge>
        {role==='admin'&&screen!=='admin'&&<Btn color="ghost" sm onClick={()=>setScreen('admin')}>Settings</Btn>}
        {screen!=='standings'&&<Btn color="ghost" sm onClick={()=>setScreen('standings')}>Standings</Btn>}
        {screen!=='tournament'&&<Btn color="orange" sm onClick={()=>setScreen('tournament')}>Schedule</Btn>}
        <Btn color="ghost" sm onClick={logout}><LogOut className="w-4 h-4"/></Btn>
      </div>
    </Card>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='login') return (
    <BG><div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm space-y-4">
        <Card className="p-6 text-center">
          <Trophy className="w-12 h-12 text-green-600 mx-auto mb-3"/>
          <h1 className="text-3xl font-black text-gray-800">Warrior Cup</h1>
          <p className="text-gray-500 text-sm mt-1">Ryder Cup Style Golf Tournament</p>
        </Card>
        <Card className="p-6 space-y-4">
          <Inp label="Tournament ID" value={tournId} onChange={v=>setTournId(v.toUpperCase())} placeholder="e.g. ABC123" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
          <Inp label="Passcode" value={passcode} onChange={setPasscode} placeholder="Enter passcode" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
          {loginErr&&<div className="text-sm text-red-600 font-semibold bg-red-50 p-2 rounded-lg">{loginErr}</div>}
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
          <div className="text-center text-gray-500 text-sm mb-3">Starting a new trip?</div>
          <Btn color="orange" onClick={createTournament} className="w-full" disabled={loading}>
            <span className="flex items-center justify-center gap-1"><Plus className="w-4 h-4"/>Create Tournament</span>
          </Btn>
        </Card>
      </div>
    </div></BG>
  );

  if (!tData) return <BG><div className="flex items-center justify-center min-h-screen text-xl text-gray-500">Loading…</div></BG>;

  // ══════════════════════════════════════════════════════════════════════════════
  // ADMIN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='admin') return (
    <BG><div className="max-w-5xl mx-auto p-4 space-y-4">
      <TopBar/>
      <Card className="p-4 bg-green-50 border-green-300 border">
        <div className="text-sm font-bold text-green-800 mb-2">Share With Your Group</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-xs text-gray-500">Tournament ID</div><div className="text-xl font-black text-green-700">{tData.id}</div></div>
          <div><div className="text-xs text-gray-500">Player Code</div><div className="text-xl font-black text-blue-700">{tData.passcode}</div></div>
          <div><div className="text-xs text-gray-500">Admin Code</div><div className="text-xl font-black text-orange-700">{tData.adminPasscode}</div></div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-600 mb-2">Tournament Name</div>
        <input value={tData.name} onChange={e=>updateTournament(d=>({...d,name:e.target.value}))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-semibold text-gray-800 focus:ring-2 focus:ring-green-400 outline-none"/>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {(['team1','team2'] as const).map(key=>(
          <Card key={key} className={`p-4 border-2 ${key==='team1'?'border-blue-300':'border-red-300'}`}>
            <div className="text-xs text-gray-500 mb-1">{key==='team1'?'Team 1':'Team 2'} Name</div>
            <input value={tData.teamNames[key]} onChange={e=>updateTournament(d=>({...d,teamNames:{...d.teamNames,[key]:e.target.value}}))}
              className={`w-full px-2 py-1 border rounded-lg font-bold ${key==='team1'?'text-blue-700 border-blue-200':'text-red-700 border-red-200'} focus:ring-2 focus:ring-green-400 outline-none`}/>
            <div className="text-xs text-gray-400 mt-1">{tData.teams[key].length}/4 players</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Players</h2>
          <Btn color="green" sm onClick={()=>updateTournament(d=>({...d,players:[...d.players,{id:'p'+Date.now(),name:'New Player',handicapIndex:0,stats:{matchesPlayed:0,matchesWon:0,holesWon:0,skinsWon:0}}]}))}>
            <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add</span>
          </Btn>
        </div>
        <div className="space-y-2">
          {(tData.players??[]).map(p=>(
            <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl flex-wrap">
              <input value={p.name} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,name:e.target.value}:x)}))}
                className="flex-1 min-w-0 px-2 py-1 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-400 outline-none"/>
              <span className="text-xs text-gray-500">HI:</span>
              <input type="number" value={p.handicapIndex} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,handicapIndex:parseFloat(e.target.value)||0}:x)}))}
                className="w-16 px-2 py-1 border rounded-lg text-sm text-center focus:ring-2 focus:ring-green-400 outline-none"/>
              {tee&&<span className="text-xs text-blue-600 font-semibold">HC {courseHcp(p.handicapIndex,tee.slope)}</span>}
              <button onClick={()=>updateTournament(d=>({...d,teams:{team1:d.teams.team1.includes(p.id)?d.teams.team1.filter(x=>x!==p.id):[...d.teams.team1.filter(x=>x!==p.id),p.id],team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                className={`px-2 py-1 rounded text-xs font-semibold ${tData.teams.team1.includes(p.id)?'bg-blue-600 text-white':'bg-gray-200 text-gray-600 hover:bg-blue-100'}`}>{tData.teamNames.team1}</button>
              <button onClick={()=>updateTournament(d=>({...d,teams:{team2:d.teams.team2.includes(p.id)?d.teams.team2.filter(x=>x!==p.id):[...d.teams.team2.filter(x=>x!==p.id),p.id],team1:d.teams.team1.filter(x=>x!==p.id)}}))}
                className={`px-2 py-1 rounded text-xs font-semibold ${tData.teams.team2.includes(p.id)?'bg-red-600 text-white':'bg-gray-200 text-gray-600 hover:bg-red-100'}`}>{tData.teamNames.team2}</button>
              <button onClick={()=>updateTournament(d=>({...d,players:d.players.filter(x=>x.id!==p.id),teams:{team1:d.teams.team1.filter(x=>x!==p.id),team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
            </div>
          ))}
          {!tData.players?.length&&<div className="text-center text-gray-400 py-4">No players yet</div>}
        </div>
      </Card>

      {/* FIX 2: All courses shown — each deletable, any tee selectable as default */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Courses & Tees</h2>
          <Btn color="teal" sm onClick={()=>setScreen('courseSearch')}>
            <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Course</span>
          </Btn>
        </div>
        <p className="text-xs text-gray-400 mb-3">Default tee is shown below. Each match can override its own course &amp; tee independently.</p>
        {(tData.courses??[]).map(c=>(
          <div key={c.id} className={`mb-3 p-3 rounded-xl border-2 transition-all ${tData.activeCourseId===c.id?'border-green-500 bg-green-50':'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-bold text-gray-800">{c.name}</div>
                {c.location&&<div className="text-xs text-gray-400">{c.location}</div>}
              </div>
              <button onClick={()=>updateTournament(d=>({...d,courses:d.courses.filter(x=>x.id!==c.id)}))}
                className="p-1 text-gray-300 hover:text-red-500 ml-2"><Trash2 className="w-3 h-3"/></button>
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
              {c.tees.map(t=>(
                <button key={t.name} onClick={()=>updateTournament(d=>({...d,activeCourseId:c.id,activeTeeId:t.name}))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${tData.activeCourseId===c.id&&tData.activeTeeId===t.name?'bg-green-600 text-white':'bg-white border border-gray-300 hover:border-green-400'}`}>
                  {t.name} · {t.slope}/{t.rating} · Par {t.par}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Btn color="orange" onClick={()=>setScreen('tournament')} className="w-full py-3">
        <span className="flex items-center justify-center gap-2"><Flag className="w-5 h-5"/>Plan Matches →</span>
      </Btn>
    </div></BG>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // COURSE MANUAL ENTRY (FIX 4: search removed)
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='courseSearch') return (
    <BG><div className="max-w-3xl mx-auto p-4 space-y-4">
      <TopBar title="Add a Course" back={()=>setScreen('admin')}/>
      <Card className="p-5">
        <div className="text-xs text-gray-400 mb-4">Enter course details from the scorecard. All 3 Disney courses are already included.</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Inp label="Course Name" value={manualCourse.name} onChange={v=>setManualCourse(c=>({...c,name:v}))} placeholder="e.g. Pebble Beach"/>
          <Inp label="Location" value={manualCourse.location} onChange={v=>setManualCourse(c=>({...c,location:v}))} placeholder="e.g. Pebble Beach, CA"/>
        </div>
        {manualCourse.tees.map((t,ti)=>(
          <div key={ti} className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-blue-800">Tee {ti+1}: {t.name||'(unnamed)'}</span>
              {manualCourse.tees.length>1&&<button onClick={()=>setManualCourse(c=>({...c,tees:c.tees.filter((_,i)=>i!==ti)}))} className="text-xs text-red-500 font-semibold">Remove</button>}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {([['Color','name','text','Black'],['Slope','slope','number','113'],['Rating','rating','number','72.0'],['Par','par','number','72']] as const).map(([lbl,key,type,ph])=>(
                <Inp key={key} label={lbl} type={type} value={(t as any)[key]} placeholder={ph}
                  onChange={v=>setManualCourse(c=>{const ts=[...c.tees];(ts[ti] as any)[key]=type==='number'?parseFloat(v)||0:v;return{...c,tees:ts};})}/>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-blue-300">
              <table className="w-full text-xs">
                <thead><tr className="bg-blue-700 text-white">{['Hole','Par','Yards','HDCP'].map(h=><th key={h} className="p-1.5 text-center">{h}</th>)}</tr></thead>
                <tbody>{t.holes.map((h,hi)=>(
                  <tr key={hi} className={hi%2===0?'bg-white':'bg-blue-50'}>
                    <td className="p-1.5 text-center font-bold border-r border-blue-100 text-gray-700">{h.h}</td>
                    {(['par','yards','rank'] as const).map(k=>(
                      <td key={k} className="p-1 border-r border-blue-100 text-center">
                        <input type="number" value={h[k]||''} placeholder={String(k==='par'?4:k==='rank'?hi+1:0)}
                          onChange={e=>setManualCourse(c=>{const ts=[...c.tees];const hs=[...ts[ti].holes];hs[hi]={...hs[hi],[k]:parseInt(e.target.value)||0};ts[ti]={...ts[ti],holes:hs};return{...c,tees:ts};})}
                          className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs"/>
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-blue-700 font-semibold">
              <span>Front: {t.holes.slice(0,9).reduce((s,h)=>s+h.yards,0)}y · Par {t.holes.slice(0,9).reduce((s,h)=>s+h.par,0)}</span>
              <span>Back: {t.holes.slice(9,18).reduce((s,h)=>s+h.yards,0)}y · Par {t.holes.slice(9,18).reduce((s,h)=>s+h.par,0)}</span>
            </div>
          </div>
        ))}
        <button onClick={()=>setManualCourse(c=>({...c,tees:[...c.tees,blankTee()]}))} className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800 font-semibold mb-4">
          <Plus className="w-4 h-4"/>Add tee box
        </button>
        <Btn color="green" disabled={!manualCourse.name.trim()} onClick={()=>addCourse({...manualCourse,id:'m'+Date.now()})} className="w-full py-3">
          <span className="flex items-center justify-center gap-2"><Check className="w-5 h-5"/>Add Course to Tournament</span>
        </Btn>
      </Card>
    </div></BG>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // TOURNAMENT SCHEDULE
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='tournament') {
    const players=tData.players??[];
    const t1pool=tData.teams.team1.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];
    const t2pool=tData.teams.team2.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];

    // FIX 2: Flat list of all tee options across all courses
    const allTeeOpts = (tData.courses??[]).flatMap(c=>
      c.tees.map(t=>({value:`${c.id}::${t.name}`,label:`${c.name} — ${t.name} (${t.slope}/${t.rating})`}))
    );

    // MatchCard reads expandedMatches from parent — no local useState for expanded
    const MatchCard = ({m}:{m:Match}) => {
      const fmt=FORMATS[m.format];
      const result=getResult(m.id);
      const isSgl=fmt.ppp===1;
      const totalPts=calcMatchPts(m);
      const isExpanded=expandedMatches[m.id]??false;
      const matchTee=getTeeForMatch(m);
      const matchCourseName=tData.courses.find(c=>c.id===(m.courseId??tData.activeCourseId))?.name??'';
      const usedIds=Object.values(m.pairings).flat().filter(Boolean);

      const setMatchCourseTee = (val: string) => {
        const [cid,tid]=val.split('::');
        updateTournament(d=>({...d,matches:d.matches.map(mx=>{
          if(mx.id!==m.id) return mx;
          const newTee=tData.courses.find(c=>c.id===cid)?.tees.find(t=>t.name===tid)??null;
          const newHcps: Record<string,number>={};
          for(const [k,ids] of Object.entries(mx.pairings)){
            newHcps[k]=(ids?.length&&newTee)?pairingPlayingHcp(ids,mx.format,newTee,d.players):0;
          }
          return{...mx,courseId:cid,teeId:tid,pairingHcps:newHcps};
        })}));
      };

      // FIX 3: setMatchPairing does NOT touch expandedMatches — stays open
      const setMatchPairing = (pk: string, slot: number, playerId: string) => {
        updateTournament(d=>({...d,matches:d.matches.map(mx=>{
          if(mx.id!==m.id) return mx;
          const newPairs={...mx.pairings};
          if(isSgl){newPairs[pk]=[playerId].filter(Boolean);}
          else{const arr=[...(newPairs[pk]??[])];arr[slot]=playerId||'';newPairs[pk]=arr.filter(Boolean);}
          const newHcps: Record<string,number>={};
          for(const [k,ids] of Object.entries(newPairs)){
            newHcps[k]=(ids?.length&&matchTee)?pairingPlayingHcp(ids,mx.format,matchTee,d.players):0;
          }
          return{...mx,pairings:newPairs,pairingHcps:newHcps};
        })}));
        // Intentionally NOT calling toggleExpanded here
      };

      const playerOpts = (pool: Player[]) => [
        {value:'',label:'— TBD —'},
        ...pool.map(p=>({value:p.id,label:`${p.name} (HC ${matchTee?courseHcp(p.handicapIndex,matchTee.slope):p.handicapIndex})`}))
      ];

      const PairingPicker = ({pk,label,pool,isT1,oppPk}:{pk:string;label:string;pool:Player[];isT1:boolean;oppPk:string}) => (
        <div className={`p-2 rounded-xl border ${isT1?'border-blue-100 bg-blue-50':'border-red-100 bg-red-50'}`}>
          <div className={`text-xs font-semibold mb-1 ${isT1?'text-blue-700':'text-red-700'}`}>{label}</div>
          {isSgl?(
            <select value={m.pairings[pk]?.[0]??''} onChange={e=>setMatchPairing(pk,0,e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
              {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[0]}>{o.label}</option>)}
            </select>
          ):(
            <div className="space-y-1">
              {[0,1].map(slot=>(
                <select key={slot} value={m.pairings[pk]?.[slot]??''} onChange={e=>setMatchPairing(pk,slot,e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                  {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[slot]}>{o.label}</option>)}
                </select>
              ))}
            </div>
          )}
          {(m.pairingHcps[pk]??0)>0&&(
            <div className={`text-xs font-semibold mt-1 ${isT1?'text-blue-700':'text-red-700'}`}>
              HC {m.pairingHcps[pk]}<span className="text-gray-400 font-normal ml-1">vs {m.pairingHcps[oppPk]??0} → {Math.abs((m.pairingHcps[pk]??0)-(m.pairingHcps[oppPk]??0))} diff</span>
            </div>
          )}
        </div>
      );

      return (
        <div className={`p-4 rounded-xl border-2 ${m.completed?'border-green-300 bg-green-50':result?'border-yellow-300 bg-yellow-50':'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{fmt.name}</span>
                <Badge color={m.startHole===1?'blue':'purple'}>{m.startHole===1?'Front 9':'Back 9'}</Badge>
                <Badge color="gray">{m.holes} holes</Badge>
                <Badge color="orange">{totalPts} pts</Badge>
                {fmt.perHole&&<Badge color="green">1pt/hole</Badge>}
              </div>
              {matchCourseName&&<div className="text-xs text-gray-400 mt-0.5">{matchCourseName} · {matchTee?.name} Tees</div>}
              {result&&(
                <div className="text-xs mt-1">
                  <span className="font-semibold text-blue-600">{tData.teamNames.team1}: {result.teamPoints.team1}pts</span>
                  <span className="mx-1 text-gray-400">|</span>
                  <span className="font-semibold text-red-600">{tData.teamNames.team2}: {result.teamPoints.team2}pts</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {role==='admin'&&!m.completed&&(
                <button onClick={()=>toggleExpanded(m.id)} className="text-xs text-gray-500 hover:text-gray-800 font-semibold">
                  {isExpanded?'▲ Collapse':'▼ Edit'}
                </button>
              )}
              {role==='admin'&&!m.completed&&(
                <Btn color="green" sm onClick={()=>{
                  const init: Record<string,(number|null)[]>={};
                  Object.values(m.pairings).flat().filter(Boolean).forEach(id=>{init[id]=Array(m.holes).fill(null);});
                  setLocalScores(init);setActiveMatchId(m.id);setCurrentHole(1);setScreen('scoring');
                }}>▶ Play</Btn>
              )}
              {role==='player'&&!m.completed&&(
                <Btn color="blue" sm onClick={async()=>{
                  const saved=await loadMatchScores(m.id);
                  const init: Record<string,(number|null)[]>={};
                  Object.values(m.pairings).flat().filter(Boolean).forEach(id=>{init[id]=Array(m.holes).fill(null);});
                  setLocalScores(Object.keys(saved).length?{...init,...saved}:init);
                  setActiveMatchId(m.id);setCurrentHole(1);setScreen('scoring');
                }}>Enter Scores</Btn>
              )}
              {role==='admin'&&<button onClick={()=>updateTournament(d=>({...d,matches:d.matches.filter(x=>x.id!==m.id)}))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}
              {m.completed&&(
                <Btn color="ghost" sm onClick={()=>setViewingMatchId(m.id)}>📋 Scorecard</Btn>
              )}
              {m.completed&&role==='admin'&&(
                <Btn color="ghost" sm onClick={async()=>{
                  const saved=await loadMatchScores(m.id);
                  const init: Record<string,(number|null)[]>={};
                  Object.values(m.pairings).flat().filter(Boolean).forEach(id=>{init[id]=Array(m.holes).fill(null);});
                  setLocalScores(Object.keys(saved).length?{...init,...saved}:init);
                  setActiveMatchId(m.id);setCurrentHole(1);setEditingScores(true);setScreen('scoring');
                }}>✏️ Edit</Btn>
              )}
            </div>
          </div>

          {isExpanded&&role==='admin'&&(
            <div className="mt-3 space-y-3">
              <Sel label="Course & Tee for this match" value={`${m.courseId??tData.activeCourseId}::${m.teeId??tData.activeTeeId}`}
                onChange={setMatchCourseTee} options={allTeeOpts}/>
              {isSgl ? (
                // Singles: 4 individual matchups laid out in a grid
                <div>
                  <div className="text-xs font-bold text-gray-600 mb-2">4 Individual Matchups (each worth 1 pt)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {([['t1p1','t2p1'],['t1p2','t2p2'],['t1p3','t2p3'],['t1p4','t2p4']] as const).map(([a,b],i)=>(
                      <div key={i} className="p-2 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="text-xs font-bold text-gray-600 mb-1">Match {i+1}</div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <div className="text-xs text-blue-600 font-semibold mb-0.5">{tData.teamNames.team1}</div>
                            <select value={m.pairings[a]?.[0]??''} onChange={e=>setMatchPairing(a,0,e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                              {playerOpts(t1pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[a]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="text-xs text-red-600 font-semibold mb-0.5">{tData.teamNames.team2}</div>
                            <select value={m.pairings[b]?.[0]??''} onChange={e=>setMatchPairing(b,0,e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                              {playerOpts(t2pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[b]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                        {(m.pairingHcps[a]||m.pairingHcps[b])?(
                          <div className="text-xs text-gray-400 mt-1">HC {m.pairingHcps[a]??0} vs {m.pairingHcps[b]??0} → {Math.abs((m.pairingHcps[a]??0)-(m.pairingHcps[b]??0))} diff</div>
                        ):null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // All other formats: 2 team pairings
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-bold text-blue-700 mb-1">{tData.teamNames.team1}</div>
                    <div className="space-y-2">
                      <PairingPicker pk="t1p1" label="Pairing 1" pool={t1pool} isT1 oppPk="t2p1"/>
                      <PairingPicker pk="t1p2" label="Pairing 2" pool={t1pool} isT1 oppPk="t2p2"/>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-red-700 mb-1">{tData.teamNames.team2}</div>
                    <div className="space-y-2">
                      <PairingPicker pk="t2p1" label={`vs ${(m.pairings.t1p1??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ')||'Pair 1'}`} pool={t2pool} isT1={false} oppPk="t1p1"/>
                      <PairingPicker pk="t2p2" label={`vs ${(m.pairings.t1p2??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ')||'Pair 2'}`} pool={t2pool} isT1={false} oppPk="t1p2"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const AddMatchForm = () => {
      const [f,setF]=useState({format:'bestball',startHole:1,holes:9,courseId:tData.activeCourseId,teeId:tData.activeTeeId});
      const fmt=FORMATS[f.format];
      const pts=calcMatchPts(f as Match);
      return (
        <div className="p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <Sel label="Format" value={f.format} onChange={v=>setF(x=>({...x,format:v}))}
              options={Object.entries(FORMATS).map(([k,v])=>({value:k,label:v.name}))}/>
            <Sel label="Starting Hole" value={f.startHole} onChange={v=>setF(x=>({...x,startHole:parseInt(v)}))}
              options={[{value:1,label:'Front 9 (1–9)'},{value:10,label:'Back 9 (10–18)'}]}/>
            <Sel label="Holes" value={f.holes} onChange={v=>setF(x=>({...x,holes:parseInt(v)}))}
              options={fmt.holesOpts.map(h=>({value:h,label:`${h} holes`}))}/>
          </div>
          <Sel label="Course & Tee" value={`${f.courseId}::${f.teeId}`}
            onChange={v=>{const[cid,tid]=v.split('::');setF(x=>({...x,courseId:cid,teeId:tid}));}}
            options={allTeeOpts} className="mb-3"/>
          <div className="text-sm font-bold text-green-700 mb-3">
            {pts} pts {fmt.perHole?'(1 pt per hole)':'available'}
          </div>
          <div className="flex gap-2">
            <Btn color="green" onClick={()=>{
              const {pairings,pairingHcps} = getEmptyPairings(f.format);
              const m: Match={
                id:'m'+Date.now(),format:f.format,startHole:f.startHole,holes:f.holes,
                pairings,pairingHcps,
                completed:false,courseId:f.courseId,teeId:f.teeId,
              };
              updateTournament(d=>({...d,matches:[...d.matches,m]}));
              setShowMatchBuilder(false);
            }}>Add Match</Btn>
            <Btn color="ghost" onClick={()=>setShowMatchBuilder(false)}>Cancel</Btn>
          </div>
        </div>
      );
    };

    return (
      <BG><div className="max-w-5xl mx-auto p-4 space-y-4">
        <TopBar/>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center border-2 border-blue-200">
            <div className="text-5xl font-black text-blue-600">{t1pts}</div>
            <div className="font-bold text-blue-700">{tData.teamNames.team1}</div>
            {possiblePts>0&&<div className="text-xs text-gray-400 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} to win</div>}
          </Card>
          <Card className="p-4 text-center border-2 border-gray-200">
            <div className="text-2xl font-black text-gray-600 mt-1">Total</div>
            <div className="text-3xl font-black text-gray-700">{possiblePts}</div>
            <div className="text-xs text-gray-400">Win at {toWin.toFixed(1)} pts</div>
          </Card>
          <Card className="p-4 text-center border-2 border-red-200">
            <div className="text-5xl font-black text-red-600">{t2pts}</div>
            <div className="font-bold text-red-700">{tData.teamNames.team2}</div>
            {possiblePts>0&&<div className="text-xs text-gray-400 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
          </Card>
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Match Schedule</h2>
            {role==='admin'&&<Btn color="green" sm onClick={()=>setShowMatchBuilder(true)} disabled={showMatchBuilder}><span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Match</span></Btn>}
          </div>
          {showMatchBuilder&&role==='admin'&&<div className="mb-4"><AddMatchForm/></div>}
          {!tData.matches?.length&&!showMatchBuilder&&<div className="text-center text-gray-400 py-8">{role==='admin'?'No matches yet — add matches above':'No matches scheduled yet'}</div>}
          <div className="space-y-3">{(tData.matches??[]).map(m=><MatchCard key={m.id} m={m}/>)}</div>
        </Card>

        {/* Scorecard Modal */}
        {viewingMatchId&&(()=>{
          const vm=getMatch(viewingMatchId);
          if(!vm) return null;
          const vfmt=FORMATS[vm.format];
          const vtee=getTeeForMatch(vm);
          const vresult=getResult(viewingMatchId);
          const vplayers=tData.players??[];
          // We need saved scores — load them async; for now use a local fetch
          const ScorecardModal = () => {
            const [vscores,setVscores] = useState<Record<string,(number|null)[]>>({});
            useEffect(()=>{loadMatchScores(viewingMatchId).then(setVscores);},[]);
            const allIds = Object.values(vm.pairings).flat().filter(Boolean);
            const vpairs = getMatchupPairs(vm.format);
            return (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setViewingMatchId(null)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
                  <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
                    <div>
                      <div className="font-black text-lg">{vfmt.name} · {vm.startHole===1?'Front':'Back'} 9 Scorecard</div>
                      <div className="text-xs text-gray-400">{tData.courses.find(c=>c.id===(vm.courseId??tData.activeCourseId))?.name} · {vtee?.name} Tees</div>
                    </div>
                    <button onClick={()=>setViewingMatchId(null)} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">✕</button>
                  </div>
                  {vresult&&(
                    <div className="px-4 py-3 bg-gray-50 border-b flex gap-6 text-center">
                      <div><div className="font-black text-2xl text-blue-600">{vresult.teamPoints.team1}</div><div className="text-xs text-blue-700">{tData.teamNames.team1}</div></div>
                      <div className="text-gray-300 text-2xl font-light self-center">/</div>
                      <div><div className="font-black text-2xl text-red-600">{vresult.teamPoints.team2}</div><div className="text-xs text-red-700">{tData.teamNames.team2}</div></div>
                    </div>
                  )}
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-700 text-white">
                          <th className="p-2 text-left sticky left-0 bg-gray-700">Player</th>
                          {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                            const ah=h+(vm.startHole-1);
                            const hd=vtee?.holes.find(x=>x.h===ah);
                            return <th key={h} className="p-1.5 text-center min-w-[2rem]"><div>{ah}</div>{hd&&<div className="text-gray-400 font-normal">P{hd.par}</div>}</th>;
                          })}
                          <th className="p-2 text-center">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allIds.map((id,ri)=>{
                          const p=vplayers.find(x=>x.id===id);
                          const isT1=tData.teams.team1.includes(id);
                          const scores=vscores[id]??[];
                          const total=scores.filter((v): v is number=>v!=null).reduce((a,b)=>a+b,0);
                          return (
                            <tr key={id} className={`border-b ${ri%2===0?'bg-white':'bg-gray-50'}`}>
                              <td className={`p-2 font-semibold sticky left-0 ${ri%2===0?'bg-white':'bg-gray-50'} ${isT1?'text-blue-700':'text-red-700'}`}>{p?.name??id}</td>
                              {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                                const sc=scores[h-1];
                                const ah=h+(vm.startHole-1);
                                const hd=vtee?.holes.find(x=>x.h===ah);
                                const par=hd?.par??4;
                                const diff=sc!=null?sc-par:null;
                                const bg=sc==null?'':'bg-gray-100';
                                const textCol=diff==null?'text-gray-300':diff<=-2?'text-yellow-600 font-black':diff===-1?'text-red-500 font-bold':diff===0?'text-gray-700':diff===1?'text-blue-600':'text-blue-800 font-bold';
                                return <td key={h} className={`p-1 text-center ${bg} ${textCol}`}>{sc??'—'}</td>;
                              })}
                              <td className="p-2 text-center font-black">{total||'—'}</td>
                            </tr>
                          );
                        })}
                        {/* Par row */}
                        <tr className="bg-green-700 text-white font-bold">
                          <td className="p-2 sticky left-0 bg-green-700">Par</td>
                          {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                            const ah=h+(vm.startHole-1);
                            const hd=vtee?.holes.find(x=>x.h===ah);
                            return <td key={h} className="p-1 text-center">{hd?.par??'—'}</td>;
                          })}
                          <td className="p-2 text-center">{vtee?Array.from({length:vm.holes},(_,i)=>i+1).reduce((s,h)=>{const ah=h+(vm.startHole-1);return s+(vtee.holes.find(x=>x.h===ah)?.par??0);},0):'—'}</td>
                        </tr>
                      </tbody>
                    </table>
                    {/* Hole-by-hole matchup results */}
                    <div className="mt-4">
                      <div className="text-sm font-bold text-gray-700 mb-2">Hole Results</div>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                          const res=calcHoleResults(vm,h,vscores,vtee);
                          const wins={t1:0,t2:0};
                          res?.matchupResults?.forEach(r=>{if(r.winner==='t1p')wins.t1++;else if(r.winner==='t2p')wins.t2++;});
                          const ah=h+(vm.startHole-1);
                          const col=wins.t1>wins.t2?'bg-blue-500 text-white':wins.t2>wins.t1?'bg-red-500 text-white':wins.t1===0&&wins.t2===0?'bg-gray-200 text-gray-500':'bg-gray-400 text-white';
                          return (
                            <div key={h} className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold ${col}`}>
                              <div>{ah}</div>
                              <div className="text-xs opacity-75">{wins.t1>wins.t2?tData.teamNames.team1.slice(0,1):wins.t2>wins.t1?tData.teamNames.team2.slice(0,1):'—'}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          };
          return <ScorecardModal key={viewingMatchId}/>;
        })()}
      </div></BG>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SCORING
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='scoring') {
    const m=getMatch(activeMatchId);
    if (!m) return <BG><div className="p-8 text-center text-gray-500">Match not found. <button onClick={()=>setScreen('tournament')} className="text-blue-600 underline">Back</button></div></BG>;
    const matchTee=getTeeForMatch(m);
    const players=tData.players??[];
    const actualHoleNum=currentHole+(m.startHole-1);
    const hd=matchTee?.holes.find(h=>h.h===actualHoleNum);
    const rank=hd?.rank??currentHole;
    const ms=calcMatchStatus(m,localScores,matchTee);
    const holeRes=calcHoleResults(m,currentHole,localScores,matchTee);
    const fmt=FORMATS[m.format];
    const isSgl = fmt.ppp===1;
    const matchPairs = getMatchupPairs(m.format);

    const PairEntry = ({pk}:{pk:string}) => {
      const ids=(m.pairings[pk]??[]).filter(Boolean);
      const isT1=pk.startsWith('t1');
      const oppPk=isT1?(pk==='t1p1'?'t2p1':'t2p2'):(pk==='t2p1'?'t1p1':'t1p2');
      const skinSt=skinsStrokes(m.pairingHcps,rank);
      const {t1:mp1}=matchplayStrokes(m.pairingHcps.t1p1??0,m.pairingHcps.t2p1??0,rank);
      const {t1:mp2}=matchplayStrokes(m.pairingHcps.t1p2??0,m.pairingHcps.t2p2??0,rank);
      const myStrokes=isT1?(pk==='t1p1'?mp1:mp2):(pk==='t2p1'?matchplayStrokes(m.pairingHcps.t1p1??0,m.pairingHcps.t2p1??0,rank).t2:matchplayStrokes(m.pairingHcps.t1p2??0,m.pairingHcps.t2p2??0,rank).t2);
      const isScramble=['scramble','alternateshot','modifiedscramble'].includes(m.format);
      const names=ids.map(id=>players.find(p=>p.id===id)?.name||'?');
      const raw=ids.map(id=>localScores[id]?.[currentHole-1]).filter((v):v is number=>v!=null);
      const teamScore=raw.length?(isScramble?raw[0]:Math.min(...raw)):null;

      if (!ids.length) return (
        <div className={`p-3 rounded-xl border-2 mb-3 ${isT1?'border-blue-200 bg-blue-50':'border-red-200 bg-red-50'}`}>
          <div className={`text-sm font-semibold ${isT1?'text-blue-600':'text-red-600'}`}>{pk==='t1p1'||pk==='t2p1'?'Pairing 1':'Pairing 2'} — TBD</div>
        </div>
      );

      return (
        <div className={`p-3 rounded-xl border-2 mb-3 ${isT1?'border-blue-200 bg-blue-50':'border-red-200 bg-red-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className={`font-semibold text-sm ${isT1?'text-blue-800':'text-red-800'}`}>
                {names.join(' & ')}
                {!fmt.perHole&&myStrokes>0&&<span className="text-yellow-600 font-bold ml-1">{'★'.repeat(myStrokes)}</span>}
              </div>
              <div className="text-xs text-gray-400">HC {m.pairingHcps[pk]??0} {!fmt.perHole&&<>vs {m.pairingHcps[oppPk]??0} · Rank {rank}</>} · Skin {skinSt[pk]>0?`+${skinSt[pk]}`:'—'}</div>
            </div>
            {teamScore!=null&&<div className={`text-2xl font-black ${isT1?'text-blue-700':'text-red-700'}`}>{teamScore}</div>}
          </div>
          {isScramble?(
            <div>
              <div className="text-xs text-gray-500 mb-1">Team score</div>
              <div className="flex gap-2 flex-wrap">
                {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                  <button key={n} onClick={()=>ids.forEach(id=>setScore(id,currentHole,n))}
                    className={`w-10 h-10 rounded-full font-bold text-sm border-2 transition-all ${n===1?'border-yellow-400 bg-yellow-50 text-yellow-700 hover:bg-yellow-100':''} ${teamScore===n?'bg-blue-600 text-white border-blue-700 scale-110':'bg-white border-gray-300 hover:border-blue-400'}`}>{n===1?'🏌️':n}</button>
                ))}
              </div>
            </div>
          ):(
            <div className="space-y-2">
              {ids.map(id=>{
                const p=players.find(x=>x.id===id);
                const sc=localScores[id]?.[currentHole-1]??null;
                return (
                  <div key={id}>
                    <div className="text-xs text-gray-500 mb-1">{p?.name}</div>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                        <button key={n} onClick={()=>setScore(id,currentHole,n)}
                          className={`w-9 h-9 rounded-full font-bold text-sm border-2 transition-all ${n===1?'border-yellow-400 text-yellow-700':''} ${sc===n?'bg-green-600 text-white border-green-700 scale-110':'bg-white border-gray-300 hover:border-green-400'}`}>{n===1?'🏌️':n}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <BG><div className="max-w-2xl mx-auto p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <button onClick={()=>{setScreen('tournament');if(editingScores){setEditingScores(false);}}} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-1"><ChevronLeft className="w-3 h-3"/>Schedule</button>
              <div className="text-xl font-black">Hole {actualHoleNum} <span className="text-gray-400 font-normal text-base">Par {hd?.par??'—'} · {hd?.yards??'—'}y · Rank {rank}</span></div>
              <div className="text-xs text-gray-400">{fmt.name} · {tData.courses.find(c=>c.id===(m.courseId??tData.activeCourseId))?.name} {matchTee?.name} Tees {editingScores&&<span className="text-orange-500 font-semibold">· Editing</span>}</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-black ${ms.leader==='team1'?'text-blue-600':ms.leader==='team2'?'text-red-600':'text-gray-600'}`}>{ms.label}</div>
              <div className="text-xs text-gray-400">{tData.teamNames.team1} {ms.t1Holes} – {ms.t2Holes} {tData.teamNames.team2}</div>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({length:m.holes},(_,i)=>i+1).map(mh=>{
              const ah=mh+(m.startHole-1);
              const hd2=matchTee?.holes.find(h=>h.h===ah);
              const res=calcHoleResults(m,mh,localScores,matchTee);
              const wins={team1:0,team2:0};
              res?.matchupResults?.forEach(r=>{if(r.winner==='t1p')wins.team1++;else if(r.winner==='t2p')wins.team2++;});
              const col=!res?.matchupResults?.some(r=>r.winner!=null)?'bg-white border-gray-300':wins.team1>wins.team2?'bg-blue-200 border-blue-500':wins.team2>wins.team1?'bg-red-200 border-red-500':'bg-gray-200 border-gray-400';
              return (
                <button key={mh} onClick={()=>setCurrentHole(mh)}
                  className={`relative flex-shrink-0 w-12 rounded-xl border-2 font-bold text-sm py-2 transition-all ${col} ${currentHole===mh?'ring-2 ring-green-500':''}`}>
                  <div className="text-sm font-black">{ah}</div>
                  {hd2&&<div className="text-xs opacity-60">P{hd2.par}</div>}
                </button>
              );
            })}
          </div>
        </Card>

        {holeRes?.matchupResults?.some(r=>r.winner!=null)&&(
          <div className="space-y-1">
            {holeRes.matchupResults.map((r,i)=>{
              const isTeam=(r as any).isTeamResult;
              const aLabel=isTeam?tData.teamNames.team1:(m.pairings[r.a]??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ');
              const bLabel=isTeam?tData.teamNames.team2:(m.pairings[r.b]??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ');
              return r.winner&&(
                <div key={i} className={`p-2 rounded-lg text-sm text-center font-semibold ${r.winner==='tie'?'bg-gray-100 text-gray-600':r.winner==='t1p'?'bg-blue-100 text-blue-800':'bg-red-100 text-red-800'}`}>
                  {r.winner==='tie'?'⚪ Tied':r.winner==='t1p'?`🔵 ${aLabel} wins hole (net ${r.netA})`:`🔴 ${bLabel} wins hole (net ${r.netB})`}
                </div>
              );
            })}
            {holeRes.skinWinner&&<div className="p-2 rounded-lg text-sm text-center font-semibold bg-yellow-100 text-yellow-800">🏆 Skin → {holeRes.skinWinner.ids.map(id=>players.find(p=>p.id===id)?.name).join(' & ')} · Net {holeRes.skinWinner.net}</div>}
          </div>
        )}

        {isSgl ? (
          // Singles: 4 individual matchup cards in a 2x2 grid
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {matchPairs.map(([a,b],i)=>(
              <Card key={i} className="p-4">
                <div className="text-xs font-bold text-gray-500 mb-2">Match {i+1}</div>
                <PairEntry pk={a}/>
                <div className="text-center text-xs text-gray-400 my-1">vs</div>
                <PairEntry pk={b}/>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 border-2 border-blue-200"><h3 className="font-bold text-blue-700 mb-3">{tData.teamNames.team1}</h3><PairEntry pk="t1p1"/><PairEntry pk="t1p2"/></Card>
            <Card className="p-4 border-2 border-red-200"><h3 className="font-bold text-red-700 mb-3">{tData.teamNames.team2}</h3><PairEntry pk="t2p1"/><PairEntry pk="t2p2"/></Card>
          </div>
        )}

        <div className="flex gap-3">
          <Btn color="ghost" onClick={()=>setCurrentHole(h=>Math.max(1,h-1))} disabled={currentHole===1} className="flex-1">
            <span className="flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4"/>Prev</span>
          </Btn>
          {currentHole<m.holes
            ?<Btn color="green" onClick={async()=>{await saveScores();setCurrentHole(h=>h+1);}} className="flex-1">
                <span className="flex items-center justify-center gap-1">Next<ChevronRight className="w-4 h-4"/></span>
              </Btn>
            :<Btn color="blue" disabled={role==='player'&&!editingScores} onClick={async()=>{await saveScores();await finishMatch();setEditingScores(false);}} className="flex-1">
                <span className="flex items-center justify-center gap-1"><Save className="w-4 h-4"/>{editingScores?'Save Changes':role==='admin'?'Complete Match':'Save & Exit'}</span>
              </Btn>
          }
          {/* Allow saving mid-match when editing */}
          {editingScores&&<Btn color="orange" onClick={async()=>{await saveScores();await finishMatch();setEditingScores(false);}} className="flex-1">
            <span className="flex items-center justify-center gap-1"><Save className="w-4 h-4"/>Save Changes</span>
          </Btn>}
        </div>
        {role==='player'&&currentHole===m.holes&&<div className="text-center text-xs text-gray-400">Only the admin can finalize the match</div>}
      </div></BG>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // STANDINGS
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='standings') {
    const players=tData.players??[];
    const contribs=[...players].map(p=>({...p,score:(p.stats?.matchesWon||0)*10+(p.stats?.holesWon||0)})).sort((a,b)=>b.score-a.score);
    const played=tData.matchResults?.length||0;
    const remaining=(tData.matches?.length||0)-played;
    return (
      <BG><div className="max-w-5xl mx-auto p-4 space-y-4">
        <TopBar title="Standings"/>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-5 text-center border-2 border-blue-200">
            <div className="text-6xl font-black text-blue-600">{t1pts}</div>
            <div className="text-lg font-bold text-blue-700">{tData.teamNames.team1}</div>
            <div className="text-xs text-gray-400 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} pts to win</div>
          </Card>
          <Card className="p-5 text-center border-2 border-gray-200">
            <div className="text-2xl font-black text-gray-700 mb-1">{possiblePts} pts</div>
            <div className="text-sm text-gray-500">{played} played · {remaining} left</div>
            <div className="text-xs text-gray-400 mt-1">Win at {toWin.toFixed(1)}</div>
          </Card>
          <Card className="p-5 text-center border-2 border-red-200">
            <div className="text-6xl font-black text-red-600">{t2pts}</div>
            <div className="text-lg font-bold text-red-700">{tData.teamNames.team2}</div>
            <div className="text-xs text-gray-400 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} pts to win</div>
          </Card>
        </div>
        {(tData.matchResults??[]).map((r,i)=>{
          const m=getMatch(r.matchId); if(!m) return null;
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-bold">{FORMATS[m.format]?.name} · {m.startHole===1?'Front':'Back'} 9</div>
                  <div className="text-xs text-gray-400">{new Date(r.completedAt).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-4 text-center">
                  <div><div className="font-black text-xl text-blue-600">{r.teamPoints.team1}</div><div className="text-xs text-blue-700">{tData.teamNames.team1}</div></div>
                  <div><div className="font-black text-xl text-gray-500">/</div></div>
                  <div><div className="font-black text-xl text-red-600">{r.teamPoints.team2}</div><div className="text-xs text-red-700">{tData.teamNames.team2}</div></div>
                </div>
              </div>
            </Card>
          );
        })}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Award className="w-6 h-6 text-yellow-600"/><h2 className="text-xl font-bold">MVP Race</h2></div>
          <div className="space-y-2">
            {contribs.map((p,i)=>(
              <div key={p.id} className={`p-3 rounded-xl border ${i===0?'border-yellow-400 bg-yellow-50':'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{i===0?'🏆':i===1?'🥈':i===2?'🥉':`${i+1}`}</span>
                    <div>
                      <div className="font-bold">{p.name}</div>
                      <div className="text-xs text-gray-400">{tData.teams.team1.includes(p.id)?tData.teamNames.team1:tData.teamNames.team2}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-center text-xs">
                    {([['Won',`${p.stats?.matchesWon||0}/${p.stats?.matchesPlayed||0}`,'text-green-600'],['Holes',p.stats?.holesWon||0,'text-purple-600'],['Skins',(p.stats?.skinsWon||0).toFixed(1),'text-orange-600']] as const).map(([l,v,c])=>(
                      <div key={l}><div className="text-gray-400">{l}</div><div className={`font-bold ${c}`}>{v}</div></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div></BG>
    );
  }

  return null;
}
