'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Trophy, Plus, Trash2, Save, Award, ChevronLeft, ChevronRight,
  Check, Flag, Lock, Users, LogOut, Shield
} from 'lucide-react';
import { db } from '@/Lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Hole { h: number; par: number; yards: number; rank: number; }
interface Tee  { name: string; slope: number; rating: number; par: number; holes: Hole[]; }
interface Course { id: string; name: string; location: string; tees: Tee[]; }
interface Player { id: string; name: string; handicapIndex: number; stats: { matchesPlayed: number; matchesWon: number; pointsContributed: number; netUnderPar: number; skinsWon: number; }; }
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
const FORMATS: Record<string,{name:string;ppp:number;hcpType:string;holesOpts:number[];desc:string;pointsPerMatchup:number;numMatchups:number;perHole?:boolean}> = {
  modifiedscramble: { name:'Modified Scramble', ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Best net of all 4 pairings wins hole — 0.5pts/hole', pointsPerMatchup:0.5, numMatchups:1, perHole:true },
  bestball:         { name:'Best Ball',          ppp:2, hcpType:'full',  holesOpts:[9,18], desc:'Best individual net score wins',                          pointsPerMatchup:1, numMatchups:2 },
  scramble:         { name:'2-Man Scramble',     ppp:2, hcpType:'avg75', holesOpts:[9,18], desc:'Team picks best shot each time',                          pointsPerMatchup:1, numMatchups:2 },
  alternateshot:    { name:'Alternate Shot',     ppp:2, hcpType:'avg',   holesOpts:[9,18], desc:'Partners alternate shots',                                pointsPerMatchup:1, numMatchups:2 },
  singles:          { name:'Singles',            ppp:1, hcpType:'full',  holesOpts:[9,18], desc:'4 individual 1v1 matches — 4 pts',                       pointsPerMatchup:1, numMatchups:4 },
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
    pairings:    Object.fromEntries(slots.map(k=>[k,[]])) as Record<string,string[]>,
    pairingHcps: Object.fromEntries(slots.map(k=>[k,0]))  as Record<string,number>,
  };
};

// ─── Pre-loaded Courses ───────────────────────────────────────────────────────
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

const calcMatchPts = (m: Match) => {
  const fmt = FORMATS[m.format];
  if (!fmt) return 0;
  if (fmt.perHole) return 0.5;
  return fmt.pointsPerMatchup * fmt.numMatchups * (m.holes===18 ? 2 : 1);
};

const blankTee = (): Tee => ({name:'',slope:113,rating:72,par:72,holes:Array.from({length:18},(_,i)=>({h:i+1,par:4,yards:0,rank:i+1}))});

// ─── Whitesboro Block W Logo ─────────────────────────────────────────────────
const BlockW = ({ size = 64, className = '', showGolf = false }: { size?: number; className?: string; showGolf?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Block W - Classic athletic style */}
    <path d="M10 15 L20 15 L30 60 L40 30 L50 60 L60 30 L70 60 L80 15 L90 15 L90 20 L82 20 L72 70 L62 35 L52 70 L42 35 L32 70 L22 20 L10 20 Z" 
      fill="currentColor" stroke="currentColor" strokeWidth="0.5"/>
    {showGolf && (
      <>
        {/* Golf flag accent */}
        <circle cx="85" cy="25" r="10" fill="#FFB81C" opacity="0.9"/>
        <path d="M85 22L85 28M83 25L87 25" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="85" cy="25" r="1.5" fill="white"/>
      </>
    )}
  </svg>
);

// ─── Script W'boro Logo ───────────────────────────────────────────────────────
const ScriptWboro = ({ className = '' }: { className?: string }) => (
  <div className={`font-script italic font-bold tracking-tight ${className}`} style={{fontFamily:"'Brush Script MT','Lucida Handwriting',cursive"}}>
    W'boro
  </div>
);

// ─── Theme Tokens: Whitesboro Royal Blue ─────────────────────────────────────
// Royal Blue: #006BB6 (primary) | Navy: #003B73 (dark) | White: #FFFFFF
// Athletic Gold: #FFB81C (accent) | Red: #C8102E (opponent)
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800;900&display=swap');
* { -webkit-tap-highlight-color: transparent; }
body { font-family: 'Inter', sans-serif; }
.font-bebas { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.05em; }
.font-script { font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom, 16px); }
.safe-top { padding-top: env(safe-area-inset-top, 0px); }
input, select, textarea { font-size: 16px !important; }
`;

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const BG = ({children}: {children: React.ReactNode}) => (
  <div className="min-h-[100dvh] relative overflow-x-hidden" style={{background:'linear-gradient(165deg,#004A7C 0%,#006BB6 35%,#0080D6 100%)'}}>
    <style>{FONTS}</style>
    {/* Retro athletic background elements */}
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* Diagonal stripes - classic 80s athletics */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{backgroundImage:'repeating-linear-gradient(45deg,#FFB81C 0,#FFB81C 2px,transparent 0,transparent 40px)'}}/> 
      {/* Radial highlights */}
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-10" style={{background:'radial-gradient(circle,#FFB81C,transparent 65%)'}}/>
      <div className="absolute bottom-0 -left-32 w-96 h-96 rounded-full opacity-10" style={{background:'radial-gradient(circle,white,transparent 65%)'}}/>
      {/* Block W watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.015]">
        <BlockW size={400}/>
      </div>
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

const Card = ({children, className='', blue=false}: {children: React.ReactNode; className?: string; blue?: boolean}) => (
  <div className={`rounded-2xl border shadow-xl ${blue ? 'border-blue-400/30 bg-blue-900/40' : 'border-white/20 bg-white/95'} backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

const Btn = ({onClick, children, color='blue', className='', disabled=false, sm=false}: {
  onClick?: ()=>void; children: React.ReactNode; color?: string; className?: string; disabled?: boolean; sm?: boolean;
}) => {
  const C: Record<string,string> = {
    blue:  'bg-[#006BB6] hover:bg-[#0080D6] text-white font-bold shadow-lg hover:shadow-xl active:scale-95 border border-blue-400/30',
    gold:  'bg-[#FFB81C] hover:bg-[#FFC940] text-gray-900 font-black shadow-lg hover:shadow-xl active:scale-95',
    navy:  'bg-[#003B73] hover:bg-[#004A7C] text-white border border-blue-700/50',
    red:   'bg-[#C8102E] hover:bg-[#E01E3A] text-white border border-red-600/50',
    green: 'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600/50',
    ghost: 'bg-white/10 hover:bg-white/20 text-white border border-white/20',
    orange:'bg-orange-600 hover:bg-orange-500 text-white border border-orange-500/50',
    teal:  'bg-teal-700 hover:bg-teal-600 text-white border border-teal-600/50',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${sm?'px-3 py-2 text-sm':'px-5 py-3'} rounded-xl font-bold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${C[color]??C.blue} ${className}`}>
      {children}
    </button>
  );
};

const Inp = ({label, value, onChange, type='text', placeholder='', className='', onKeyDown}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  type?: string; placeholder?: string; className?: string; onKeyDown?: (e:React.KeyboardEvent)=>void;
}) => (
  <div className={className}>
    {label && <label className="block text-xs font-bold text-blue-600 mb-1.5 tracking-wide uppercase">{label}</label>}
    <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className="w-full px-4 py-3 rounded-xl outline-none text-gray-900 placeholder-gray-400 transition-all border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white"/>
  </div>
);

const Sel = ({label, value, onChange, options, className=''}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  options: {value: string|number; label: string}[]; className?: string;
}) => (
  <div className={className}>
    {label && <label className="block text-xs font-bold text-blue-600 mb-1.5 tracking-wide uppercase">{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      className="w-full px-4 py-3 rounded-xl outline-none text-gray-900 border-2 border-gray-200 focus:border-blue-500 bg-white appearance-none">
      {options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Badge = ({children, color='gray'}: {children: React.ReactNode; color?: string}) => {
  const C: Record<string,string> = {
    green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    blue:  'bg-blue-100 text-blue-800 border-blue-300',
    red:   'bg-red-100 text-red-800 border-red-300',
    gray:  'bg-gray-100 text-gray-600 border-gray-300',
    orange:'bg-orange-100 text-orange-800 border-orange-300',
    purple:'bg-purple-100 text-purple-800 border-purple-300',
    gold:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${C[color]??C.gray}`}>{children}</span>;
};

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
  const [expandedMatches, setExpandedMatches] = useState<Record<string,boolean>>({});
  const toggleExpanded = (mid: string) => setExpandedMatches(prev=>({...prev,[mid]:!prev[mid]}));
  const [manualCourse, setManualCourse] = useState<Course>({id:'',name:'',location:'',tees:[blankTee()]});
  const unsubRef = useRef<(()=>void)|null>(null);

  // ── Firebase normalization ───────────────────────────────────────────────────
  const normalizeTournament = (data: Tournament): Tournament => ({
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
  });

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
    const players: Player[] = [
      {id:'p1',name:'Ryan', handicapIndex:10,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p2',name:'Doby', handicapIndex:11,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p3',name:'Stevie',handicapIndex:22,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p4',name:'Erm',  handicapIndex:24,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p5',name:'Gibbs',handicapIndex:17,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p6',name:'Dief', handicapIndex:18,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p7',name:'Kev',  handicapIndex:21,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
      {id:'p8',name:'Geoff',handicapIndex:28,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}},
    ];
    const data: Tournament = {
      id, name:'Warrior Cup '+new Date().getFullYear(), passcode:pc, adminPasscode:adminPc,
      courses:PRESET_COURSES, activeCourseId:'hawks_landing', activeTeeId:'Black',
      teamNames:{team1:'Team 1',team2:'Team 2'},
      players,
      teams:{ team2:['p1','p2','p3','p4'], team1:['p5','p6','p7','p8'] },
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
      return {matchupResults:[{a:'t1',b:'t2',winner,netA:t1Best,netB:t2Best,isTeamResult:true}],skinWinner,rank,hd};
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

    const playerPointsContrib: Record<string,number> = {};
    const playerNetUnderPar: Record<string,number> = {};
    allIds.forEach(id => { playerPointsContrib[id]=0; playerNetUnderPar[id]=0; });

    if (fmt.perHole) {
      for (let h=1;h<=m.holes;h++) {
        const res = calcHoleResults(m,h,localScores,tee);
        const w = res?.matchupResults[0]?.winner;
        if (!w || w==='tie') continue;
        const winPks = w==='t1p' ? ['t1p1','t1p2'] : ['t2p1','t2p2'];
        const skinSt = skinsStrokes(m.pairingHcps, res.rank??h);
        const pairNets = winPks.map(pk => {
          const raw = pairRawScore(m,pk,h,localScores);
          return raw!=null ? {pk, net: raw-(skinSt[pk]||0), ids: m.pairings[pk]??[]} : null;
        }).filter(Boolean) as {pk:string;net:number;ids:string[]}[];
        const bestNet = Math.min(...pairNets.map(x=>x.net));
        const bestPairs = pairNets.filter(x=>x.net===bestNet);
        bestPairs.forEach(pair => {
          const share = 0.5 / bestPairs.length / pair.ids.length;
          pair.ids.filter(Boolean).forEach(id => { playerPointsContrib[id]=(playerPointsContrib[id]||0)+share; });
        });
      }
    } else {
      const pairs = getMatchupPairs(m.format);
      for (const [a,b] of pairs) {
        let at1=0,at2=0;
        for (let h=1;h<=m.holes;h++) {
          const res = calcHoleResults(m,h,localScores,tee);
          const mr = res?.matchupResults.find(x=>x.a===a&&x.b===b);
          if (mr?.winner==='t1p') at1++; else if (mr?.winner==='t2p') at2++;
        }
        const pts = fmt.pointsPerMatchup;
        const t1Won = at1>at2, t2Won = at2>at1, halved = at1===at2;
        const aIds = (m.pairings[a]??[]).filter(Boolean);
        const bIds = (m.pairings[b]??[]).filter(Boolean);
        if (t1Won)   aIds.forEach(id => { playerPointsContrib[id]=(playerPointsContrib[id]||0)+pts/aIds.length; });
        if (t2Won)   bIds.forEach(id => { playerPointsContrib[id]=(playerPointsContrib[id]||0)+pts/bIds.length; });
        if (halved) {
          aIds.forEach(id => { playerPointsContrib[id]=(playerPointsContrib[id]||0)+(pts/2)/aIds.length; });
          bIds.forEach(id => { playerPointsContrib[id]=(playerPointsContrib[id]||0)+(pts/2)/bIds.length; });
        }
      }
    }

    for (let h=1;h<=m.holes;h++) {
      const actualHole = h+(m.startHole-1);
      const hd = tee?.holes.find(x=>x.h===actualHole);
      if (!hd) continue;
      const skinSt = skinsStrokes(m.pairingHcps, hd.rank);
      for (const pk of Object.keys(m.pairings)) {
        const ids = (m.pairings[pk]??[]).filter(Boolean);
        if (!ids.length) continue;
        const raw = pairRawScore(m, pk, h, localScores);
        if (raw == null) continue;
        const net = raw - (skinSt[pk]||0);
        if (net < hd.par) ids.forEach(id => { playerNetUnderPar[id]=(playerNetUnderPar[id]||0)+1; });
      }
    }

    await updateTournament(d=>({
      ...d,
      matches:d.matches.map(mx=>mx.id===activeMatchId?{...mx,completed:true}:mx),
      matchResults:[...(d.matchResults||[]).filter(r=>r.matchId!==activeMatchId),result],
      players:d.players.map(p=>{
        if(!allIds.includes(p.id)) return p;
        const isT1=t1Ids.includes(p.id);
        const myTeam=isT1?'team1':'team2';
        return {
          ...p,
          stats:{
            matchesPlayed:(p.stats?.matchesPlayed||0)+1,
            matchesWon:(p.stats?.matchesWon||0)+(winnerTeam===myTeam?1:0),
            pointsContributed:(p.stats?.pointsContributed||0)+(playerPointsContrib[p.id]||0),
            netUnderPar:(p.stats?.netUnderPar||0)+(playerNetUnderPar[p.id]||0),
            skinsWon:(p.stats?.skinsWon||0)+(ms.playerSkins[p.id]||0),
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

  // ── Top Navigation Bar ────────────────────────────────────────────────────────
  const TopBar = ({title,back}:{title?:string;back?:()=>void}) => (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/20 bg-white/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 min-w-0">
        {back ? (
          <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm font-bold shrink-0">
            <ChevronLeft className="w-4 h-4"/>Back
          </button>
        ) : (
          <div className="text-[#006BB6] shrink-0"><BlockW size={36}/></div>
        )}
        <div className="min-w-0">
          <h1 className="font-bebas font-bold text-gray-900 text-lg leading-tight truncate">{title ?? tData?.name}</h1>
          {tee && !title && (
            <div className="text-xs text-gray-500 truncate">
              {(tData?.courses??[]).find(c=>c.id===tData?.activeCourseId)?.name??''} · {tee.name} · Slope {tee.slope}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 items-center shrink-0">
        <Badge color={role==='admin'?'gold':'blue'}>{role==='admin'?'Admin':'Player'}</Badge>
        {role==='admin'&&screen!=='admin'&&(
          <button onClick={()=>setScreen('admin')} className="text-gray-600 hover:text-gray-900 text-xs px-2 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400">⚙</button>
        )}
        {screen!=='standings'&&(
          <button onClick={()=>setScreen('standings')} className="text-gray-600 hover:text-gray-900 text-xs px-2 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400">📊</button>
        )}
        {screen!=='tournament'&&(
          <button onClick={()=>setScreen('tournament')} className="text-gray-600 hover:text-gray-900 text-xs px-2 py-1.5 rounded-lg border border-gray-300 hover:border-gray-400">📅</button>
        )}
        <button onClick={logout} className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg border border-gray-300 hover:border-red-400">
          <LogOut className="w-3.5 h-3.5"/>
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='login') return (
    <BG>
      <div className="flex flex-col items-center justify-center min-h-[100dvh] p-5 safe-top safe-bottom">
        {/* Hero Header - Whitesboro Warriors */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-full blur-3xl opacity-30" style={{background:'radial-gradient(circle,#FFB81C,transparent 70%)'}}/>
              {/* Block W logo */}
              <div className="relative z-10 text-white">
                <BlockW size={110} showGolf/>
              </div>
            </div>
          </div>
          
          {/* WARRIOR CUP title in Bebas Neue */}
          <h1 className="font-bebas font-bold text-white mb-2" style={{fontSize:'clamp(2.5rem,9vw,4rem)',lineHeight:'0.9',textShadow:'0 4px 20px rgba(0,0,0,0.3)'}}>
            WARRIOR CUP
          </h1>
          
          {/* Script W'boro */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-12 bg-white/40"/>
            <ScriptWboro className="text-white text-3xl opacity-90"/>
            <div className="h-px w-12 bg-white/40"/>
          </div>
          
          {/* Whitesboro Warriors subtitle */}
          <div className="text-white/90 text-sm font-bold tracking-widest mb-1">WHITESBORO WARRIORS</div>
          <div className="text-white/50 text-xs tracking-wider">MARCY, NY · RYDER CUP STYLE GOLF</div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {/* Join Form */}
          <Card className="p-5 space-y-4">
            <Inp label="Tournament ID" value={tournId} onChange={v=>setTournId(v.toUpperCase())} placeholder="e.g. ABC123" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
            <Inp label="Passcode" value={passcode} onChange={setPasscode} placeholder="Enter passcode" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
            {loginErr && (
              <div className="text-sm text-red-700 font-semibold bg-red-50 border border-red-300 p-3 rounded-xl">
                ⚠ {loginErr}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Btn color="blue" onClick={()=>joinTournament(false)} disabled={loading||!tournId||!passcode} className="w-full flex items-center justify-center gap-2">
                <Users className="w-4 h-4"/><span>Player</span>
              </Btn>
              <Btn color="navy" onClick={()=>joinTournament(true)} disabled={loading||!tournId||!passcode} className="w-full flex items-center justify-center gap-2">
                <Lock className="w-4 h-4"/><span>Admin</span>
              </Btn>
            </div>
          </Card>

          {/* Create New */}
          <div className="text-center">
            <div className="text-white/40 text-xs mb-3 tracking-widest">— START A NEW TOURNAMENT —</div>
            <Btn color="gold" onClick={createTournament} disabled={loading} className="w-full flex items-center justify-center gap-2 py-4">
              <Trophy className="w-5 h-5"/>
              <span className="font-bebas text-xl tracking-wider">Create Warrior Cup</span>
            </Btn>
          </div>

          {/* Go Blue tagline */}
          <div className="text-center text-white/30 text-xs pt-2 font-bold tracking-widest">GO BLUE</div>
        </div>
      </div>
    </BG>
  );

  if (!tData) return (
    <BG>
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="text-center">
          <div className="text-white mb-4"><BlockW size={56}/></div>
          <div className="text-white/70 text-lg font-bebas tracking-wide">Loading Tournament…</div>
        </div>
      </div>
    </BG>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // ADMIN SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='admin') return (
    <BG>
      <TopBar/>
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8 safe-bottom">

        {/* Share Codes */}
        <Card blue className="p-4">
          <div className="text-xs font-bold text-blue-200 mb-3 tracking-widest uppercase flex items-center gap-2">
            <Shield className="w-3.5 h-3.5"/>Tournament Access Codes
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {label:'Tournament ID', value:tData.id, color:'text-white'},
              {label:'Player Code', value:tData.passcode, color:'text-blue-200'},
              {label:'Admin Code', value:tData.adminPasscode, color:'text-yellow-200'},
            ].map(({label,value,color})=>(
              <div key={label} className="bg-white/10 rounded-xl p-3 backdrop-blur">
                <div className="text-xs text-white/60 mb-1">{label}</div>
                <div className={`font-bebas font-bold text-xl ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tournament Name */}
        <Card className="p-4">
          <label className="text-xs font-bold text-blue-600 mb-2 block tracking-wide uppercase">Tournament Name</label>
          <input value={tData.name} onChange={e=>updateTournament(d=>({...d,name:e.target.value}))}
            className="w-full px-4 py-3 rounded-xl text-gray-900 font-bebas font-bold text-lg border-2 border-gray-200 focus:border-blue-500 outline-none bg-white"/>
        </Card>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-3">
          {(['team1','team2'] as const).map(key=>(
            <Card key={key} className={`p-4`}>
              <div className="text-xs text-gray-500 mb-2 font-bold uppercase">{key==='team1'?'Team 1':'Team 2'}</div>
              <input value={tData.teamNames[key]} onChange={e=>updateTournament(d=>({...d,teamNames:{...d.teamNames,[key]:e.target.value}}))}
                className={`w-full px-2 py-1.5 rounded-xl font-bebas font-bold text-base border-2 outline-none ${key==='team1'?'text-blue-600 border-blue-300':'text-red-600 border-red-300'} bg-white`}/>
              <div className="text-xs text-gray-400 mt-2">{tData.teams[key].length}/4 players</div>
            </Card>
          ))}
        </div>

        {/* Players */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bebas font-bold text-gray-900 text-lg">Players</h2>
            <Btn color="green" sm onClick={()=>updateTournament(d=>({...d,players:[...d.players,{id:'p'+Date.now(),name:'New Player',handicapIndex:0,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}}]}))}>
              <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add</span>
            </Btn>
          </div>
          <div className="space-y-2">
            {(tData.players??[]).map(p=>(
              <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 flex-wrap bg-gray-50">
                <input value={p.name} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,name:e.target.value}:x)}))}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-gray-900 text-sm font-bold border border-gray-300 outline-none bg-white" style={{minWidth:'80px'}}/>
                <span className="text-gray-500 text-xs">HI:</span>
                <input type="number" value={p.handicapIndex} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,handicapIndex:parseFloat(e.target.value)||0}:x)}))}
                  className="w-14 px-2 py-1.5 rounded-lg text-gray-900 text-sm text-center border border-gray-300 outline-none bg-white"/>
                {tee&&<span className="text-xs text-blue-600 font-bold">HC {courseHcp(p.handicapIndex,tee.slope)}</span>}
                <button onClick={()=>updateTournament(d=>({...d,teams:{team1:d.teams.team1.includes(p.id)?d.teams.team1.filter(x=>x!==p.id):[...d.teams.team1.filter(x=>x!==p.id),p.id],team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${tData.teams.team1.includes(p.id)?'bg-blue-600 text-white border-blue-500':'border-gray-300 text-gray-600 hover:border-blue-500'}`}>{tData.teamNames.team1}</button>
                <button onClick={()=>updateTournament(d=>({...d,teams:{team2:d.teams.team2.includes(p.id)?d.teams.team2.filter(x=>x!==p.id):[...d.teams.team2.filter(x=>x!==p.id),p.id],team1:d.teams.team1.filter(x=>x!==p.id)}}))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${tData.teams.team2.includes(p.id)?'bg-red-600 text-white border-red-500':'border-gray-300 text-gray-600 hover:border-red-500'}`}>{tData.teamNames.team2}</button>
                <button onClick={()=>updateTournament(d=>({...d,players:d.players.filter(x=>x.id!==p.id),teams:{team1:d.teams.team1.filter(x=>x!==p.id),team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                  className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            ))}
            {!tData.players?.length&&<div className="text-center text-gray-400 py-6">No players yet</div>}
          </div>
        </Card>

        {/* Courses */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bebas font-bold text-gray-900 text-lg">Courses & Tees</h2>
            <Btn color="teal" sm onClick={()=>setScreen('courseSearch')}>
              <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Course</span>
            </Btn>
          </div>
          <p className="text-xs text-gray-500 mb-4">Default tee shown. Each match can override independently.</p>
          {(tData.courses??[]).map(c=>(
            <div key={c.id} className={`mb-3 p-3 rounded-xl border-2 transition-all ${tData.activeCourseId===c.id?'border-blue-500 bg-blue-50':'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-gray-900 text-sm">{c.name}</div>
                  {c.location&&<div className="text-xs text-gray-500">{c.location}</div>}
                </div>
                <button onClick={()=>updateTournament(d=>({...d,courses:d.courses.filter(x=>x.id!==c.id)}))}
                  className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {c.tees.map(t=>{
                  const totalYards = t.holes.reduce((s,h)=>s+h.yards,0);
                  const isActive = tData.activeCourseId===c.id && tData.activeTeeId===t.name;
                  return (
                    <button key={t.name} onClick={()=>updateTournament(d=>({...d,activeCourseId:c.id,activeTeeId:t.name}))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive?'border-blue-500 bg-blue-600 text-white':'border-gray-300 bg-white text-gray-600 hover:border-blue-400'}`}>
                      {t.name} · {t.slope}/{t.rating} · P{t.par}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>

        <Btn color="gold" onClick={()=>setScreen('tournament')} className="w-full flex items-center justify-center gap-2 py-4">
          <Flag className="w-5 h-5"/>
          <span className="font-bebas text-lg tracking-wide">Plan Matches →</span>
        </Btn>
      </div>
    </BG>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // COURSE SEARCH / MANUAL ENTRY
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='courseSearch') return (
    <BG>
      <TopBar title="Add a Course" back={()=>setScreen('admin')}/>
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8 safe-bottom">
        <Card className="p-5">
          <p className="text-xs text-white/40 mb-4">Enter course details from the scorecard. All Disney courses are pre-loaded.</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Inp label="Course Name" value={manualCourse.name} onChange={v=>setManualCourse(c=>({...c,name:v}))} placeholder="e.g. Pebble Beach"/>
            <Inp label="Location" value={manualCourse.location} onChange={v=>setManualCourse(c=>({...c,location:v}))} placeholder="e.g. Pebble Beach, CA"/>
          </div>
          {manualCourse.tees.map((t,ti)=>(
            <div key={ti} className="mb-4 p-4 rounded-xl border border-blue-500/30" style={{background:'rgba(30,64,175,0.1)'}}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bebas font-bold text-blue-300">Tee {ti+1}: {t.name||'(unnamed)'}</span>
                {manualCourse.tees.length>1&&<button onClick={()=>setManualCourse(c=>({...c,tees:c.tees.filter((_,i)=>i!==ti)}))} className="text-xs text-red-400 font-semibold">Remove</button>}
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {([['Color','name','text','Black'],['Slope','slope','number','113'],['Rating','rating','number','72.0'],['Par','par','number','72']] as const).map(([lbl,key,type,ph])=>(
                  <Inp key={key} label={lbl} type={type} value={(t as any)[key]} placeholder={ph}
                    onChange={v=>setManualCourse(c=>{const ts=[...c.tees];(ts[ti] as any)[key]=type==='number'?parseFloat(v)||0:v;return{...c,tees:ts};})}/>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead><tr className="bg-blue-900/60 text-blue-200">{['Hole','Par','Yards','HDCP'].map(h=><th key={h} className="p-2 text-center font-bold">{h}</th>)}</tr></thead>
                  <tbody>{t.holes.map((h,hi)=>(
                    <tr key={hi} className={hi%2===0?'bg-white/3':'bg-white/5'}>
                      <td className="p-1.5 text-center font-bold text-white/60 border-r border-white/5">{h.h}</td>
                      {(['par','yards','rank'] as const).map(k=>(
                        <td key={k} className="p-1 border-r border-white/5 text-center">
                          <input type="number" value={h[k]||''} placeholder={String(k==='par'?4:k==='rank'?hi+1:0)}
                            onChange={e=>setManualCourse(c=>{const ts=[...c.tees];const hs=[...ts[ti].holes];hs[hi]={...hs[hi],[k]:parseInt(e.target.value)||0};ts[ti]={...ts[ti],holes:hs};return{...c,tees:ts};})}
                            className="w-12 px-1 py-1 rounded text-center text-white text-xs border border-white/10 outline-none" style={{background:'rgba(255,255,255,0.07)'}}/>
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-blue-300 font-bold">
                <span>Front: {t.holes.slice(0,9).reduce((s,h)=>s+h.yards,0)}y · Par {t.holes.slice(0,9).reduce((s,h)=>s+h.par,0)}</span>
                <span>Back: {t.holes.slice(9,18).reduce((s,h)=>s+h.yards,0)}y · Par {t.holes.slice(9,18).reduce((s,h)=>s+h.par,0)}</span>
              </div>
            </div>
          ))}
          <button onClick={()=>setManualCourse(c=>({...c,tees:[...c.tees,blankTee()]}))} className="flex items-center gap-1.5 text-sm text-teal-400 font-bold mb-5 hover:text-teal-300">
            <Plus className="w-4 h-4"/>Add tee box
          </button>
          <Btn color="gold" disabled={!manualCourse.name.trim()} onClick={()=>addCourse({...manualCourse,id:'m'+Date.now()})} className="w-full flex items-center justify-center gap-2 py-4">
            <Check className="w-5 h-5"/>
            <span className="font-bebas text-lg">Add Course to Tournament</span>
          </Btn>
        </Card>
      </div>
    </BG>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // TOURNAMENT SCHEDULE
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='tournament') {
    const players=tData.players??[];
    const t1pool=tData.teams.team1.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];
    const t2pool=tData.teams.team2.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];

    const allTeeOpts = (tData.courses??[]).flatMap(c=>
      c.tees.map(t=>{
        const totalYards = t.holes.reduce((s,h)=>s+h.yards,0);
        return {value:`${c.id}::${t.name}`,label:`${c.name} — ${t.name} (${t.slope}/${t.rating} · P${t.par} · ${totalYards.toLocaleString()}y)`};
      })
    );

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
      };

      const playerOpts = (pool: Player[]) => [
        {value:'',label:'— TBD —'},
        ...pool.map(p=>({value:p.id,label:`${p.name} (HC ${matchTee?courseHcp(p.handicapIndex,matchTee.slope):p.handicapIndex})`}))
      ];

      const PairingPicker = ({pk,label,pool,isT1,oppPk}:{pk:string;label:string;pool:Player[];isT1:boolean;oppPk:string}) => (
        <div className={`p-3 rounded-xl border-2 ${isT1?'border-blue-300 bg-blue-50':'border-red-300 bg-red-50'}`}>
          <div className={`text-xs font-bold mb-2 tracking-wider ${isT1?'text-blue-700':'text-red-700'}`}>{label}</div>
          {isSgl?(
            <select value={m.pairings[pk]?.[0]??''} onChange={e=>setMatchPairing(pk,0,e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-gray-900 text-sm border-2 border-gray-200 outline-none appearance-none bg-white">
              {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[0]}>{o.label}</option>)}
            </select>
          ):(
            <div className="space-y-1.5">
              {[0,1].map(slot=>(
                <select key={slot} value={m.pairings[pk]?.[slot]??''} onChange={e=>setMatchPairing(pk,slot,e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-gray-900 text-sm border-2 border-gray-200 outline-none appearance-none bg-white">
                  {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[slot]}>{o.label}</option>)}
                </select>
              ))}
            </div>
          )}
          {(m.pairingHcps[pk]??0)>0&&(
            <div className={`text-xs font-bold mt-1.5 ${isT1?'text-blue-700':'text-red-700'}`}>
              HC {m.pairingHcps[pk]}<span className="text-gray-500 font-normal ml-1">vs {m.pairingHcps[oppPk]??0} · diff {Math.abs((m.pairingHcps[pk]??0)-(m.pairingHcps[oppPk]??0))}</span>
            </div>
          )}
        </div>
      );

      const borderColor = m.completed ? 'border-emerald-400' : result ? 'border-yellow-400' : 'border-gray-200';
      const bgColor = m.completed ? 'bg-emerald-50' : result ? 'bg-yellow-50' : 'bg-white';

      return (
        <div className={`p-4 rounded-2xl border-2 ${borderColor} ${bgColor}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bebas font-bold text-gray-900">{fmt.name}</span>
                <Badge color={m.startHole===1?'blue':'purple'}>{m.startHole===1?'Front 9':'Back 9'}</Badge>
                <Badge color="gray">{m.holes}H</Badge>
                <Badge color="gold">{totalPts}pts</Badge>
                {m.completed&&<Badge color="green">✓ Done</Badge>}
              </div>
              {matchCourseName&&<div className="text-xs text-gray-500 mb-1">{matchCourseName} · {matchTee?.name} Tees</div>}
              {result&&(
                <div className="text-sm font-bold">
                  <span className="text-blue-600">{tData.teamNames.team1}: {result.teamPoints.team1}pt</span>
                  <span className="text-gray-400 mx-2">|</span>
                  <span className="text-red-600">{tData.teamNames.team2}: {result.teamPoints.team2}pt</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-end">
              {role==='admin'&&!m.completed&&(
                <button onClick={()=>toggleExpanded(m.id)} className="text-gray-600 hover:text-gray-900 text-xs font-bold border border-gray-300 px-2.5 py-1.5 rounded-lg">
                  {isExpanded?'▲':'▼ Edit'}
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
              {role==='admin'&&<button onClick={()=>updateTournament(d=>({...d,matches:d.matches.filter(x=>x.id!==m.id)}))} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}
              {m.completed&&<Btn color="ghost" sm onClick={()=>setViewingMatchId(m.id)}>📋 Card</Btn>}
              {m.completed&&role==='admin'&&(
                <Btn color="ghost" sm onClick={async()=>{
                  const saved=await loadMatchScores(m.id);
                  const init: Record<string,(number|null)[]>={};
                  Object.values(m.pairings).flat().filter(Boolean).forEach(id=>{init[id]=Array(m.holes).fill(null);});
                  setLocalScores(Object.keys(saved).length?{...init,...saved}:init);
                  setActiveMatchId(m.id);setCurrentHole(1);setEditingScores(true);setScreen('scoring');
                }}>✏️</Btn>
              )}
            </div>
          </div>

          {isExpanded&&role==='admin'&&(
            <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
              <Sel label="Course & Tee for this match" value={`${m.courseId??tData.activeCourseId}::${m.teeId??tData.activeTeeId}`}
                onChange={setMatchCourseTee} options={allTeeOpts}/>
              {isSgl ? (
                <div>
                  <div className="text-xs font-bold text-gray-600 mb-2 tracking-wider uppercase">4 Individual Matchups (1pt each)</div>
                  <div className="grid grid-cols-1 gap-2">
                    {([['t1p1','t2p1'],['t1p2','t2p2'],['t1p3','t2p3'],['t1p4','t2p4']] as const).map(([a,b],i)=>(
                      <div key={i} className="p-3 rounded-xl border border-gray-200 bg-gray-50">
                        <div className="text-xs font-bold text-gray-600 mb-2">Match {i+1}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs text-blue-600 font-bold mb-1">{tData.teamNames.team1}</div>
                            <select value={m.pairings[a]?.[0]??''} onChange={e=>setMatchPairing(a,0,e.target.value)}
                              className="w-full px-2 py-2 rounded-lg text-gray-900 text-xs border-2 border-gray-200 outline-none appearance-none bg-white">
                              {playerOpts(t1pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[a]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="text-xs text-red-600 font-bold mb-1">{tData.teamNames.team2}</div>
                            <select value={m.pairings[b]?.[0]??''} onChange={e=>setMatchPairing(b,0,e.target.value)}
                              className="w-full px-2 py-2 rounded-lg text-gray-900 text-xs border-2 border-gray-200 outline-none appearance-none bg-white">
                              {playerOpts(t2pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[b]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                        {(m.pairingHcps[a]||m.pairingHcps[b])&&(
                          <div className="text-xs text-gray-500 mt-1 text-center">HC {m.pairingHcps[a]??0} vs {m.pairingHcps[b]??0}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <PairingPicker pk="t1p1" label={`${tData.teamNames.team1} — Pair 1`} pool={t1pool} isT1 oppPk="t2p1"/>
                  <PairingPicker pk="t2p1" label={`${tData.teamNames.team2} — Pair 1`} pool={t2pool} isT1={false} oppPk="t1p1"/>
                  <PairingPicker pk="t1p2" label={`${tData.teamNames.team1} — Pair 2`} pool={t1pool} isT1 oppPk="t2p2"/>
                  <PairingPicker pk="t2p2" label={`${tData.teamNames.team2} — Pair 2`} pool={t2pool} isT1={false} oppPk="t1p2"/>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const AddMatchForm = () => {
      const defaultCourse = tData.courses[0];
      const defaultTee = defaultCourse?.tees[0];
      const [f,setF] = useState({
        format:'bestball', startHole:1, holes:9,
        courseId: tData.activeCourseId??defaultCourse?.id??'',
        teeId:    tData.activeTeeId??defaultTee?.name??'',
      });
      const fmt = FORMATS[f.format];
      const pts = fmt.pointsPerMatchup * fmt.numMatchups * (f.holes===18?2:1);
      return (
        <div className="p-4 rounded-2xl border-2 border-yellow-400 bg-yellow-50">
          <div className="font-bebas font-bold text-yellow-900 mb-3 text-lg">New Match</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
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
          <div className="text-sm font-bold text-yellow-800 mb-3">
            {fmt.perHole ? '0.5 pts — winner of most holes' : `${pts} pts available`}
          </div>
          <div className="flex gap-2">
            <Btn color="gold" onClick={()=>{
              const {pairings,pairingHcps} = getEmptyPairings(f.format);
              const m: Match={
                id:'m'+Date.now(),format:f.format,startHole:f.startHole,holes:f.holes,
                pairings,pairingHcps,completed:false,courseId:f.courseId,teeId:f.teeId,
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
      <BG>
        <TopBar/>
        <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8 safe-bottom">
          {/* Scoreboard */}
          <div className="grid grid-cols-3 gap-3">
            <Card blue className="p-4 text-center">
              <div className="font-bebas font-bold text-white text-5xl leading-none">{t1pts}</div>
              <div className="font-bold text-white text-sm mt-1 truncate">{tData.teamNames.team1}</div>
              {possiblePts>0&&<div className="text-xs text-white/60 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} to win</div>}
            </Card>
            <Card className="p-4 text-center flex flex-col justify-center">
              <div className="text-gray-500 text-xs font-bold tracking-widest uppercase mb-1">Total</div>
              <div className="font-bebas font-bold text-gray-900 text-2xl">{possiblePts}</div>
              <div className="text-xs text-blue-600">Win at {toWin.toFixed(1)}</div>
            </Card>
            <Card className="p-4 text-center bg-red-50">
              <div className="font-bebas font-bold text-red-700 text-5xl leading-none">{t2pts}</div>
              <div className="font-bold text-red-700 text-sm mt-1 truncate">{tData.teamNames.team2}</div>
              {possiblePts>0&&<div className="text-xs text-gray-500 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
            </Card>
          </div>

          {/* Matches */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bebas font-bold text-gray-900 text-xl">Match Schedule</h2>
              {role==='admin'&&<Btn color="green" sm onClick={()=>setShowMatchBuilder(true)} disabled={showMatchBuilder}><span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Match</span></Btn>}
            </div>
            {showMatchBuilder&&role==='admin'&&<div className="mb-4"><AddMatchForm/></div>}
            {!tData.matches?.length&&!showMatchBuilder&&(
              <div className="text-center text-gray-400 py-12">
                <Flag className="w-10 h-10 mx-auto mb-3 opacity-30 text-gray-300"/>
                <div>{role==='admin'?'No matches yet — add one above':'No matches scheduled yet'}</div>
              </div>
            )}
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
            const ScorecardModal = () => {
              const [vscores,setVscores] = useState<Record<string,(number|null)[]>>({});
              useEffect(()=>{loadMatchScores(viewingMatchId).then(setVscores);},[]);
              const allIds = Object.values(vm.pairings).flat().filter(Boolean);
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{background:'rgba(0,0,0,0.85)'}} onClick={()=>setViewingMatchId(null)}>
                  <div className="w-full sm:max-w-4xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" style={{background:'#0D1B2A',border:'1px solid rgba(255,255,255,0.1)'}} onClick={e=>e.stopPropagation()}>
                    <div className="p-4 border-b border-white/10 sticky top-0 flex items-center justify-between" style={{background:'#0D1B2A'}}>
                      <div>
                        <div className="font-bebas font-bold text-white text-lg">{vfmt.name} · {vm.startHole===1?'Front':'Back'} 9</div>
                        <div className="text-xs text-white/30">{tData.courses.find(c=>c.id===(vm.courseId??tData.activeCourseId))?.name} · {vtee?.name} Tees</div>
                      </div>
                      <button onClick={()=>setViewingMatchId(null)} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
                    </div>
                    {vresult&&(
                      <div className="px-4 py-3 border-b border-white/10 flex gap-8 justify-center text-center">
                        <div><div className="font-bebas font-bold text-3xl text-blue-300">{vresult.teamPoints.team1}</div><div className="text-xs text-blue-300/60">{tData.teamNames.team1}</div></div>
                        <div className="text-white/20 text-3xl self-center">/</div>
                        <div><div className="font-bebas font-bold text-3xl text-red-300">{vresult.teamPoints.team2}</div><div className="text-xs text-red-300/60">{tData.teamNames.team2}</div></div>
                      </div>
                    )}
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{background:'rgba(201,162,39,0.2)'}}>
                            <th className="p-2 text-left text-yellow-300 font-bold sticky left-0" style={{background:'rgba(13,27,42,0.95)'}}>Player</th>
                            {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                              const ah=h+(vm.startHole-1);
                              const hd=vtee?.holes.find(x=>x.h===ah);
                              return <th key={h} className="p-1.5 text-center text-yellow-300/70 min-w-[2.5rem]"><div>{ah}</div>{hd&&<div className="text-white/30 font-normal">P{hd.par}</div>}</th>;
                            })}
                            <th className="p-2 text-center text-yellow-300">Tot</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allIds.map((id,ri)=>{
                            const p=vplayers.find(x=>x.id===id);
                            const isT1=tData.teams.team1.includes(id);
                            const scores=vscores[id]??[];
                            const total=scores.filter((v): v is number=>v!=null).reduce((a,b)=>a+b,0);
                            return (
                              <tr key={id} className="border-b border-white/5" style={{background:ri%2===0?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.01)'}}>
                                <td className={`p-2 font-bold sticky left-0 ${isT1?'text-blue-300':'text-red-300'}`} style={{background:ri%2===0?'rgba(13,27,42,0.97)':'rgba(13,27,42,0.95)'}}>{p?.name??id}</td>
                                {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                                  const sc=scores[h-1];
                                  const ah=h+(vm.startHole-1);
                                  const hd=vtee?.holes.find(x=>x.h===ah);
                                  const par=hd?.par??4;
                                  const diff=sc!=null?sc-par:null;
                                  const color=diff==null?'text-white/20':diff<=-2?'text-yellow-400 font-black':diff===-1?'text-red-400 font-bold':diff===0?'text-white/70':diff===1?'text-blue-400':'text-blue-300 font-bold';
                                  return <td key={h} className={`p-1 text-center ${color}`}>{sc??'—'}</td>;
                                })}
                                <td className="p-2 text-center font-black text-white">{total||'—'}</td>
                              </tr>
                            );
                          })}
                          <tr style={{background:'rgba(5,46,22,0.5)'}}>
                            <td className="p-2 font-bold text-emerald-300 sticky left-0" style={{background:'rgba(5,46,22,0.9)'}}>Par</td>
                            {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                              const ah=h+(vm.startHole-1);
                              const hd=vtee?.holes.find(x=>x.h===ah);
                              return <td key={h} className="p-1 text-center text-emerald-300/70">{hd?.par??'—'}</td>;
                            })}
                            <td className="p-2 text-center text-emerald-300 font-bold">{vtee?Array.from({length:vm.holes},(_,i)=>i+1).reduce((s,h)=>{const ah=h+(vm.startHole-1);return s+(vtee.holes.find(x=>x.h===ah)?.par??0);},0):'—'}</td>
                          </tr>
                        </tbody>
                      </table>
                      {/* Hole results */}
                      <div className="mt-4">
                        <div className="text-xs font-bold text-white/40 mb-2 tracking-wider uppercase">Hole Results</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({length:vm.holes},(_,i)=>i+1).map(h=>{
                            const res=calcHoleResults(vm,h,vscores,vtee);
                            const wins={t1:0,t2:0};
                            res?.matchupResults?.forEach(r=>{if(r.winner==='t1p')wins.t1++;else if(r.winner==='t2p')wins.t2++;});
                            const ah=h+(vm.startHole-1);
                            const bg=wins.t1>wins.t2?'bg-blue-600 text-white':wins.t2>wins.t1?'bg-red-600 text-white':'bg-white/10 text-white/40';
                            return (
                              <div key={h} className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${bg}`}>
                                <div className="text-base font-bebas font-bold">{ah}</div>
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
        </div>
      </BG>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SCORING SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='scoring') {
    const m=getMatch(activeMatchId);
    if (!m) return (
      <BG><div className="flex items-center justify-center min-h-[100dvh] p-8 text-center">
        <div><div className="text-white/40 text-lg mb-4">Match not found.</div>
        <Btn color="gold" onClick={()=>setScreen('tournament')}>Back to Schedule</Btn></div>
      </div></BG>
    );
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
        <div className={`p-4 rounded-2xl border-2 mb-3 ${isT1?'border-blue-500/30':'border-red-500/30'}`}
          style={{background:isT1?'rgba(30,64,175,0.1)':'rgba(185,28,28,0.1)'}}>
          <div className={`text-sm font-bold ${isT1?'text-blue-400':'text-red-400'}`}>{pk==='t1p1'||pk==='t2p1'?'Pairing 1':'Pairing 2'} — TBD</div>
        </div>
      );

      return (
        <div className={`p-4 rounded-2xl border-2 mb-3 ${isT1?'border-blue-500/40':'border-red-500/40'}`}
          style={{background:isT1?'rgba(30,64,175,0.15)':'rgba(185,28,28,0.15)'}}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className={`font-bebas font-bold text-lg ${isT1?'text-blue-200':'text-red-200'}`}>
                {names.join(' & ')}
                {!fmt.perHole&&myStrokes>0&&<span className="text-yellow-400 ml-2 text-sm">{'★'.repeat(myStrokes)}</span>}
              </div>
              <div className="text-xs text-white/30">
                HC {m.pairingHcps[pk]??0}
                {!fmt.perHole&&<> vs {m.pairingHcps[oppPk]??0} · Rank {rank}</>}
                {skinSt[pk]>0&&<span className="text-yellow-400 ml-2">Skin +{skinSt[pk]}</span>}
              </div>
            </div>
            {teamScore!=null&&(
              <div className={`font-bebas font-black text-4xl ${isT1?'text-blue-200':'text-red-200'}`}>{teamScore}</div>
            )}
          </div>
          {isScramble?(
            <div>
              <div className="text-xs text-white/30 mb-2 font-bold tracking-wider uppercase">Team Score</div>
              <div className="flex gap-2 flex-wrap">
                {[1,2,3,4,5,6,7,8,9,10].map(n=>{
                  const par = hd?.par ?? 4;
                  const diff = n - par;
                  const relColor = diff <= -2 ? 'text-yellow-400' : diff === -1 ? 'text-red-300' : diff === 0 ? 'text-white' : diff === 1 ? 'text-blue-300' : 'text-blue-200';
                  return (
                    <button key={n} onClick={()=>ids.forEach(id=>setScore(id,currentHole,n))}
                      className={`w-12 h-12 rounded-xl font-bebas font-bold text-lg border-2 transition-all ${teamScore===n?'border-yellow-400 scale-110':'border-white/10 hover:border-white/30'} ${relColor}`}
                      style={{background:teamScore===n?'rgba(201,162,39,0.3)':'rgba(255,255,255,0.07)'}}>
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ):(
            <div className="space-y-3">
              {ids.map(id=>{
                const p=players.find(x=>x.id===id);
                const sc=localScores[id]?.[currentHole-1]??null;
                return (
                  <div key={id}>
                    <div className="text-xs text-white/40 mb-2 font-bold tracking-wider">{p?.name?.toUpperCase()}</div>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5,6,7,8,9,10].map(n=>{
                        const par = hd?.par ?? 4;
                        const diff = n - par;
                        const relColor = diff <= -2 ? 'text-yellow-400' : diff === -1 ? 'text-red-300' : diff === 0 ? 'text-white' : diff === 1 ? 'text-blue-300' : 'text-blue-200';
                        return (
                          <button key={n} onClick={()=>setScore(id,currentHole,n)}
                            className={`w-11 h-11 rounded-xl font-bebas font-bold text-base border-2 transition-all ${sc===n?'border-yellow-400 scale-110':'border-white/10 hover:border-white/30'} ${relColor}`}
                            style={{background:sc===n?'rgba(201,162,39,0.3)':'rgba(255,255,255,0.07)'}}>
                            {n}
                          </button>
                        );
                      })}
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
      <BG>
        {/* Hole Header */}
        <div className="sticky top-0 z-20 border-b border-white/10" style={{background:'rgba(11,22,40,0.97)'}}>
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <button onClick={()=>{setScreen('tournament');if(editingScores)setEditingScores(false);}}
              className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
              <ChevronLeft className="w-4 h-4"/>Schedule
            </button>
            <div className="text-center">
              <div className="font-bebas font-bold text-white text-xl">
                Hole {actualHoleNum}
                <span className="text-white/40 font-normal text-base ml-2">Par {hd?.par??'—'}</span>
              </div>
              <div className="text-xs text-white/30">{hd?.yards??'—'}yds · Rank {rank}</div>
            </div>
            <div className="text-center">
              <div className={`font-bebas font-black text-2xl ${ms.leader==='team1'?'text-blue-300':ms.leader==='team2'?'text-red-300':'text-white/60'}`}>{ms.label}</div>
              <div className="text-xs text-white/30">{ms.t1Holes}–{ms.t2Holes}</div>
            </div>
          </div>

          {/* Match details row */}
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/30">{fmt.name}</span>
            <span className="text-white/10">·</span>
            <span className="text-xs text-white/30">{tData.courses.find(c=>c.id===(m.courseId??tData.activeCourseId))?.name} {matchTee?.name}</span>
            {editingScores&&<Badge color="orange">Editing</Badge>}
          </div>

          {/* Hole Navigator */}
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-hide">
            {Array.from({length:m.holes},(_,i)=>i+1).map(mh=>{
              const ah=mh+(m.startHole-1);
              const hd2=matchTee?.holes.find(h=>h.h===ah);
              const res=calcHoleResults(m,mh,localScores,matchTee);
              const wins={team1:0,team2:0};
              res?.matchupResults?.forEach(r=>{if(r.winner==='t1p')wins.team1++;else if(r.winner==='t2p')wins.team2++;});
              const scored=res?.matchupResults?.some(r=>r.winner!=null);
              const bg=scored?(wins.team1>wins.team2?'bg-blue-600 text-white':wins.team2>wins.team1?'bg-red-600 text-white':'bg-white/20 text-white'):'bg-white/5 text-white/40';
              return (
                <button key={mh} onClick={()=>setCurrentHole(mh)}
                  className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${bg} ${currentHole===mh?'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent':''}`}>
                  <div className="font-bebas font-bold text-base leading-none">{ah}</div>
                  {hd2&&<div className="text-xs opacity-60 leading-none">P{hd2.par}</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3 pb-8 safe-bottom">
          {/* Hole result indicators */}
          {holeRes?.matchupResults?.some(r=>r.winner!=null)&&(
            <div className="space-y-1.5">
              {holeRes.matchupResults.map((r,i)=>{
                const isTeam=(r as any).isTeamResult;
                const aLabel=isTeam?tData.teamNames.team1:(m.pairings[r.a]??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ');
                const bLabel=isTeam?tData.teamNames.team2:(m.pairings[r.b]??[]).map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' & ');
                return r.winner&&(
                  <div key={i} className={`px-4 py-2.5 rounded-xl text-sm font-bold text-center border ${r.winner==='tie'?'border-white/20 text-white/60 bg-white/5':r.winner==='t1p'?'border-blue-500/40 text-blue-300 bg-blue-950/40':'border-red-500/40 text-red-300 bg-red-950/40'}`}>
                    {r.winner==='tie'
                      ? `⚡ Tied · Net ${r.netA} / ${r.netB}`
                      : r.winner==='t1p'
                        ? `🔵 ${aLabel} wins · Net ${r.netA} vs ${r.netB}`
                        : `🔴 ${bLabel} wins · Net ${r.netB} vs ${r.netA}`}
                  </div>
                );
              })}
              {holeRes.skinWinner&&<div className="px-4 py-2.5 rounded-xl text-sm font-bold text-center border border-yellow-500/40 text-yellow-300 bg-yellow-950/40">🏆 Skin → {holeRes.skinWinner.ids.map(id=>players.find(p=>p.id===id)?.name).join(' & ')} · Net {holeRes.skinWinner.net}</div>}
            </div>
          )}

          {/* Score Entry */}
          {isSgl ? (
            <div className="grid grid-cols-1 gap-3">
              {matchPairs.map(([a,b],i)=>(
                <Card key={i} className="p-4">
                  <div className="text-xs font-bold text-white/30 mb-3 tracking-widest uppercase">Match {i+1}</div>
                  <PairEntry pk={a}/>
                  <div className="text-center text-white/20 text-xs my-2 font-bold">VS</div>
                  <PairEntry pk={b}/>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <PairEntry pk="t1p1"/>
              <PairEntry pk="t1p2"/>
              <div className="text-center py-1">
                <span className="text-white/20 text-xs font-bold tracking-widest">VS</span>
              </div>
              <PairEntry pk="t2p1"/>
              <PairEntry pk="t2p2"/>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 pt-2">
            <Btn color="ghost" onClick={()=>setCurrentHole(h=>Math.max(1,h-1))} disabled={currentHole===1} className="flex-1 flex items-center justify-center gap-1">
              <ChevronLeft className="w-4 h-4"/>Prev
            </Btn>
            {currentHole<m.holes
              ? <Btn color="gold" onClick={async()=>{await saveScores();setCurrentHole(h=>h+1);}} className="flex-1 flex items-center justify-center gap-1">
                  Next<ChevronRight className="w-4 h-4"/>
                </Btn>
              : <Btn color="green" disabled={role==='player'&&!editingScores} onClick={async()=>{await saveScores();await finishMatch();setEditingScores(false);}} className="flex-1 flex items-center justify-center gap-1">
                  <Save className="w-4 h-4"/>{editingScores?'Save Changes':role==='admin'?'Complete Match':'Save & Exit'}
                </Btn>
            }
            {editingScores&&<Btn color="orange" onClick={async()=>{await saveScores();await finishMatch();setEditingScores(false);}} className="flex-1 flex items-center justify-center gap-1">
              <Save className="w-4 h-4"/>Save Changes
            </Btn>}
          </div>
          {role==='player'&&currentHole===m.holes&&<div className="text-center text-xs text-white/30">Only the admin can finalize the match</div>}
        </div>
      </BG>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // STANDINGS
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen==='standings') {
    const players=tData.players??[];
    const contribs=[...players].map(p=>({
      ...p,
      pts: p.stats?.pointsContributed||0,
      net: p.stats?.netUnderPar||0,
      skins: p.stats?.skinsWon||0,
    })).sort((a,b)=>
      b.pts!==a.pts ? b.pts-a.pts :
      b.net!==a.net ? b.net-a.net :
      b.skins-a.skins
    );
    const played=tData.matchResults?.length||0;
    const remaining=(tData.matches?.length||0)-played;

    return (
      <BG>
        <TopBar title="Standings"/>
        <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8 safe-bottom">

          {/* Championship Score Display */}
          <div className="relative rounded-3xl overflow-hidden border-2 border-white/20 p-6 bg-white/95 backdrop-blur">
            <div className="absolute inset-0 opacity-5 flex items-center justify-center">
              <div className="text-blue-600"><BlockW size={180}/></div>
            </div>
            <div className="relative flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="font-bebas font-black text-6xl text-blue-600 leading-none drop-shadow-lg">{t1pts}</div>
                <div className="font-bebas font-bold text-blue-600 text-lg mt-1">{tData.teamNames.team1}</div>
                {possiblePts>0&&<div className="text-xs text-gray-500 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} to win</div>}
              </div>
              <div className="text-center px-4">
                <div className="text-gray-400 font-bebas text-2xl font-bold">VS</div>
                <div className="text-blue-600 text-xs mt-1">{possiblePts}pts total</div>
                <div className="text-gray-500 text-xs">{played} played</div>
                <div className="text-gray-500 text-xs">{remaining} left</div>
              </div>
              <div className="text-center flex-1">
                <div className="font-bebas font-black text-6xl text-red-600 leading-none drop-shadow-lg">{t2pts}</div>
                <div className="font-bebas font-bold text-red-600 text-lg mt-1">{tData.teamNames.team2}</div>
                {possiblePts>0&&<div className="text-xs text-gray-500 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
              </div>
            </div>
            <div className="relative mt-4 text-center">
              <div className="text-xs text-blue-600 font-bold tracking-widest">WIN AT {toWin.toFixed(1)} POINTS</div>
            </div>
          </div>

          {/* Match Results */}
          {(tData.matchResults??[]).map((r,i)=>{
            const m=getMatch(r.matchId); if(!m) return null;
            const t1won = r.teamPoints.team1 > r.teamPoints.team2;
            const t2won = r.teamPoints.team2 > r.teamPoints.team1;
            return (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{FORMATS[m.format]?.name} · {m.startHole===1?'Front':'Back'} 9</div>
                    <div className="text-xs text-gray-500">{new Date(r.completedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-3 text-center">
                    <div>
                      <div className={`font-bebas font-black text-2xl ${t1won?'text-blue-600':'text-gray-400'}`}>{r.teamPoints.team1}</div>
                      <div className="text-xs text-blue-600">{tData.teamNames.team1}</div>
                    </div>
                    <div className="text-gray-300 font-bold">–</div>
                    <div>
                      <div className={`font-bebas font-black text-2xl ${t2won?'text-red-600':'text-gray-400'}`}>{r.teamPoints.team2}</div>
                      <div className="text-xs text-red-600">{tData.teamNames.team2}</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}

          {/* MVP Race */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-yellow-600"/>
              <h2 className="font-bebas font-bold text-gray-900 text-xl">MVP Race</h2>
            </div>
            <div className="space-y-2">
              {contribs.map((p,i)=>{
                const isTop = i===0;
                const isT1 = tData.teams.team1.includes(p.id);
                return (
                  <div key={p.id} className={`p-3 rounded-xl border transition-all ${isTop?'border-yellow-400 bg-yellow-50':'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{i===0?'🏆':i===1?'🥈':i===2?'🥉':`${i+1}`}</span>
                        <div className="min-w-0">
                          <div className={`font-bebas font-bold truncate ${isTop?'text-yellow-900':'text-gray-900'}`}>{p.name}</div>
                          <div className={`text-xs ${isT1?'text-blue-600':'text-red-600'}`}>{isT1?tData.teamNames.team1:tData.teamNames.team2}</div>
                        </div>
                      </div>
                      <div className="flex gap-3 text-center text-xs shrink-0">
                        {([
                          ['Pts', p.pts.toFixed(1), 'text-emerald-600'],
                          ['Net↓', p.net, 'text-purple-600'],
                          ['Skins', p.skins.toFixed(1), 'text-yellow-600'],
                          ['W/P', `${p.stats?.matchesWon||0}/${p.stats?.matchesPlayed||0}`, 'text-blue-600'],
                        ] as const).map(([l,v,c])=>(
                          <div key={l}>
                            <div className="text-gray-500 mb-0.5">{l}</div>
                            <div className={`font-bold ${c}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!contribs.length&&<div className="text-center text-gray-400 py-8">No player data yet</div>}
            </div>
          </Card>
        </div>
      </BG>
    );
  }

  return null;
}
