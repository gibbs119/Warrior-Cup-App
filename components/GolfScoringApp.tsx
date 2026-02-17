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

/**
 * HANDICAP CALCULATION RULES BY FORMAT
 * 
 * Modified Scramble & 2-Man Scramble:
 * - Team Handicap = 35% of lower course handicap + 15% of higher course handicap (rounded)
 * - Example: Players with CH 8 and 21 → (8×0.35)+(21×0.15) = 2.8+3.15 = 6
 * 
 * Best Ball:
 * - Each player gets 90% of their course handicap
 * - Lowest 90% player plays scratch (0)
 * - Others get strokes = 90% of (their 90% CH - lowest 90% CH), rounded
 * - Example: CHs 4,12,15,20 → 90%: 3.6,10.8,13.5,18.0 → Strokes: 0,7,10,14
 * 
 * Alternate Shot:
 * - Team Handicap = Sum of both course handicaps ÷ 2, rounded
 * - Strokes allocated to higher handicap team on hardest holes
 * - Example: Team A (CH 8+20=28→14) vs Team B (CH 5+9=14→7) → Team A gets 7 strokes
 * 
 * Singles:
 * - Full course handicap for each player
 * - Strokes based on difference between opponents
 */
const pairingPlayingHcp = (ids: string[], format: string, tee: Tee, players: Player[]) => {
  if (!tee || !ids?.length) return 0;
  const fmt = FORMATS[format];
  const courseHcps = ids.map(id => { 
    const p = players.find(x => x.id === id); 
    return courseHcp(p?.handicapIndex ?? 0, tee.slope); 
  });

  // Singles - Full handicap
  if (fmt.hcpType === 'full')  return courseHcps[0] ?? 0;

  // Modified Scramble & 2-Man Scramble: 35% lower + 15% higher
  if (format === 'modifiedscramble' || format === 'scramble') {
    if (courseHcps.length < 2) return 0;
    const [lower, higher] = courseHcps[0] <= courseHcps[1] 
      ? [courseHcps[0], courseHcps[1]] 
      : [courseHcps[1], courseHcps[0]];
    return Math.round(lower * 0.35 + higher * 0.15);
  }

  // Alternate Shot: 50% of combined handicaps
  if (format === 'alternateshot') {
    return Math.round(courseHcps.reduce((a,b)=>a+b,0) / 2);
  }

  // Best Ball: This is a team handicap placeholder - actual player strokes calculated in matchplay
  // For display purposes, show the average 90% handicap
  if (format === 'bestball') {
    return Math.round(courseHcps.reduce((a,b)=>a+b,0) / courseHcps.length * 0.9);
  }

  return 0;
};

const matchplayStrokes = (hcp1: number, hcp2: number, rank: number) => {
  const diff = Math.abs(hcp1-hcp2);
  const gets = diff>0 && rank<=diff ? 1 : 0;
  return hcp1>hcp2 ? {t1:gets,t2:0} : hcp2>hcp1 ? {t1:0,t2:gets} : {t1:0,t2:0};
};

// Best Ball: Calculate individual player strokes based on 90% allowance
const bestBallStrokes = (m: Match, rank: number, tee: Tee, players: Player[]): Record<string,number> => {
  const allPlayerIds = Object.values(m.pairings).flat().filter(Boolean);
  
  // Calculate 90% of course handicap for each player
  const playerHcps = allPlayerIds.map(id => {
    const p = players.find(x => x.id === id);
    const ch = courseHcp(p?.handicapIndex ?? 0, tee.slope);
    return { id, hcp90: ch * 0.9 };
  });
  
  // Find the lowest 90% handicap
  const lowest = Math.min(...playerHcps.map(p => p.hcp90));
  
  // Calculate strokes for each player: 90% of difference from lowest, rounded
  const strokes: Record<string,number> = {};
  for (const {id, hcp90} of playerHcps) {
    const diff = Math.round((hcp90 - lowest) * 0.9);
    // Player gets a stroke on this hole if rank <= their stroke allocation
    strokes[id] = (diff > 0 && rank <= diff) ? 1 : 0;
  }
  
  return strokes;
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

// ─── Whitesboro Warriors Logo (real school logo) ─────────────────────────────
const WARRIOR_LOGO = "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADhAOEDASIAAhEBAxEB/8QAHQAAAgIDAQEBAAAAAAAAAAAAAAgGBwQFCQMCAf/EAE0QAAEDAwMCBAMFBAcECAQHAAECAwQFBhEAByESMQgTIkEUUWEVMkJxgSNSkbEWM1NicqHBFySCogk0NkNzktHwGCUn4TU3RFV1w9L/xAAaAQADAQEBAQAAAAAAAAAAAAAAAwUEBgIB/8QANBEAAQMCAgYJBAIDAQAAAAAAAQACAwQRITEFEhNBUWEiMnGRobHB0fAUI4HhQvEVM1Ki/9oADAMBAAIRAxEAPwBy9GjRoQjRo0aEI0aNGhCNGvl5xtlpbrziG20AqUtRwEgdyT7aozcrxJ2pQHHoFrtG4pyCUl5CuiKkgkHC+6+3dIwcjBOmxQSTGzBdKlnjhF3myvUkAZJwNVpdu+u2duqLS7haqb4IBapo+IxnP40+j25HVkfLSe7hbnXpfLixX6y6YZ7QY/7KOOB3QD6u2fUTg5xjRZG19+XitBoduS1RlKAMyQPIjpBOCeteOrHuEdSvpqtHopjG607rfOKkP0s+R2rAy6uG6PFXUnkLbtq2GIpUgdD054uKQrPPoTgEY+o1XVc363Tqjzqhchp7bqOgswo6EJA+aSQVg/UK1ZtreFN0tpduu6ktkoPUzTWs9Cs8ftHB6hj+6NSt7bnw82W4+3Xp9JVJQ0C4xUKoFugD3S0FdWT8gDpjZaGM2jZrHsv5rwYq6QXkfqjtt5JVpt6XhNZUxNu+4JLKvvNvVR5aD+hVjWjJzySST76b57c7w5UWnIap9Mp01KOEtM0JRXj83UJz/HXtB8Rm0sRIbg0aqMJ7BLNNaSP4BeniskA6MJ8vRZzRRuPTnHn6pOzwSCCCO4I1t6bdl00xjyKZdNcgs/2capPNJ/glQGmwl+JLap9JblUusOjsUu09s/zXryhbr+HiqRXPjKbToJXkKbkUHKlfq0hX89BrJSOlCfP0QKKJp6M48vVUDQt7t0aQI6GrslSmWDkNTEIfC/opSh1kf8WrGtbxU1+OW27kt2FOR1kuOw1llQTjgBKsjOffOrAjWH4dr1TGj0SRRBIXlxDMCpeVIUPkpsq6x+RA1G7o8KkJ1CnrXul5lXrUGZzQcQT+FIUnBA9skK0h09FIbSM1T2W8lobBXRi8b9Ydvup/Z3iD23uANNSqoqiSlhILdQT0ICiOR5n3cD5kgatSJIjy4rUqI+1IjvIDjTrSwpC0kZCgRwQRzkaQW+dm9w7Q8x2o2+7MhI7zaefiGcYyScDrQB2ytKRkcZ1o7Hvi67In+fblXkwgHOp2MT1MuHIyFtnjJwATwrHYjXh+i4pRrQPXpmlZInatQyy6N6NLttt4nqNODUK+ISqVIwEmdHSpxhRx3UkZUnJHt1d/YAnTA06bCqUJqdTpceZFeT1NPsOBxtY+aVDII/LUmankhNniyrw1Ec4uw3WRo0aNJTkaNGjQhGjRo0IRo0aNCEaNGjQhGjRo0IRqIbn7i2xt5SUzK9Mw+8FfCQ2h1PSFJHISPYcjKjgDI55GYxvvvJSdvICqfB8uoXG+j9hGByhgf2jp9h8k91H5DJCX1Wo3DedyGVNemVerS19KQAVrPJPShI7AZPA4HOqdFo8zdN+DfNTK3SIg6DMXeSl27e8N1bgvuR5D6qdRs+inR1kJIA7uK7rPJ4PH04Gvja3Z68twFtyIERMCkkjrqMvKW8Z56E/ecPftx81DI1cm0+w9FtOlG8N1JEMLYSl9ERbuGIgHOXVdlr9ukZSMcFWQRm1bdu7r8qK7V2WoCmoTX7BdYkNhttpIIAUgHhtATyMgrIIwgEYNA1IaDHTAWGZOQ91PFKXESVRJJyAzWwp9h7M7NU9mfds+JOqfTw5OT5rjisYPlR0549XyOARk++sKRvffN5vOQ9qLBmSGj6UTpqQEpPfJ5DafuqGCv5e/GtxYHh6okN/7bv6c5dddfAU+X1KMdKukDA6vU5jsFKxwBhKe2rA3Bvqzdr6BGm3HIVTIDjhZjpjQXHEleCroAbSQknnGcDPvqZJPEHXPTdxOX4CqRwyWsOg3gM/yVVCNnd0rzIe3G3HejRXSrzKZTFEp8tYyUE+lGQeMFLgwOCdSi2vDntlRwwp+myKo60khSpb5KXM+5QnCc/kNQWseL6gBps0Cwblmuk+tM9xiIkD5hSVuZP0wNV1efiz3KFOfcpNt0KlpLgLbvUuQ40jPZQOEnPbI+ehz6stJAIbyFgvjW0gcASCeZuU2tG28sajsqZp1p0hlCzlQMVK8n/iB1s2rbt1r+qoFKb/ww2x/ppadm/FixJYiwdzqeIPnAdFbgoK43Yn9s2PU3yAMpChlXPSATpoKPVKbWaczUaTPiz4byQpp+M6lxtYPIIUDgjWR5kB6V1sZs3Do2WK7bduu/wBbQKU5/ihtn/TWtrO3tjVhhLNRtOkPIQrqSBFSjB/4QNSfRrwHuGIK9FjTgQqiuTw67Y1jz1s0t+mOuICUqhvqSlsj8QQcpz+YOosvZjc2zj5m2+5D7sVrpDVOqaiEhtIz0g4UjlXsEoGDyffTDaNaG1kwFibjgcfNIdSRHECx5YeSXljey/7Jdbi7q2BMaaHCp8AJKT+LjCi2rAKRgLHvnnjW9k25sxvdBcm0l6IKkRlx6IPh5jSiScrbIBPPVyoEHkgnVyyWGJTCmJLLb7KxhTbiQpKvzB4OqY3C8Pdv1N1VYsmU5atcbClMrjKUllSsYwQk5RnsVJ+ZyFdtNjmicbjoO4jLuSpIZWix6beBz71Qm6mw95WSHZ8VsV2jIyTKiIPmNDH/AHjXce/KeocckZxqM7YbmXTt/PS9RZynIKlhT8B5RUw6Pfj8JOT6h9M5xphKLu1fG29VYt7eGiOvQ1OeW3XYafMCh1Y8w44WnHOAAsAfcJ41mbn7KWpuRRk3Tt9Mp8SoyAHEONK/3SUnGMKCQehX94D2wR7ik2rIAZUgFp3jIqY6jFy+lJDhuOanOz+7ds7jxPJhO/B1pprzJNOePrSM4KkHstOccjtkZAyNWHrmzPhXJZdyhqWzOotYhLyk5KFoPbKVDgg8jIJBB9xps/D1vnDvBpm27ocbh3ChISy8cBucB7j91z5p9+49wMdZo7ZjaRYt+eC2UWkdodnLg7z/AGrz0aNGpSqo0aNGhCNGjRoQjRo0aEI1VHiG3aibeUP4GnqbkXHNQRGZzkMJ93l/Qew7qP0BIku8F+0/buzZFcloS/JJ8uHF6wkvunsM+wHcnBwAeD20hdVn1y87scmSS5Pq9UkABKckqWo4ShOewHAA9hqno+i2x2j+qPFTNI1uwGozrHwX5T4dfvK6UxoyJFUrFReJJJypxR5JJPYD59gNNZaFs2f4ebEdua6H2Z1xyUdJUgArWvGRHjg9kj8S/fucAAD8s63bT8PG3710XK83MuOY30KKSOtasZEZgHskd1K98ZOAEgeG2NiV7cm6Gtz90WcMD1UaiqB8ttGcpUpJ7J7EA8qPqVxgHXU1ImBxtGP/AFyHJZaWlMJuReQ+HMrV0a0r233rDdx345Jt+02Sn4OkslSTIGQSecHn3cIz7JAxkX3GYtaxrc8llNNoNIjBS8EpZaR3Uokn37k63gASAAAAOABrnz4jLeueg7sTqZeFWqNaiyVfGUWTMkFxC4+ekJ6cBAcb5ScAHkHsRmc1zquQRgho3Dd/aoODaSMyEFx3nf8A0mJv7xUWLRVOxLUhzbvnIUpGYp8mICDg5fUDkHnBQlYOO41S13eI6qXValTtvcazac5Rak15fxNGdWJEBfdDwQ4rDhSoJIT1IzggqwdVMAAMAAAew1+OJbcSWnAlQUMFJ5yPy1VGh4wy2sb8VIOmZC8ENFuC1dCqiJ8RtKnmxJRgOJP4vqPz1lvSOhvplxyEqGFFJ60n6fP/AC1qmqNHiTlMushyI8ctL5C2V/LqHPOODn6e/Mi2wsCr3Rcsqh0WpU92sBrz4MOoKUhUxAx1hp3lIWkZJCsZAyPfDPqJYYxtRyJ9xz5Jf00U0h2RzxA9jy5rU0RtqN5sJpwOMZK2skHg90n8j/Mas/wyPKgbkPW7FuurWxJrSeukzGHkuRUyk8qYejLHS4l3COQpK/2QSD6jiK3fYl528toXHZNTpzbiyj414BMdvBAKlPJJ6E5I9RxqVWvsDu1XkxZ9Dl0D4MlL7E9usof8lY9SFIU2Ac9u+dZKuanfDswcsreS2UcNSybaEZ53801jF67jWc4WdxLQRVqYgkCvWyFPAJ4wp6Ir9ojjqJKCvnACT31O7Pu+2bvgqmW1W4VTaQoocDLgK2lAAlK0/eSodQyCARnUIoe5FZt2kQoe6NrVSkzm20NP1OCwqZT3nOR1BbfUtAIHUfMSAnkdR4J9nbW2v3GWm5LbqUVqqqSfKrVvTUsykhJ6clSMhYBH3VhScgcdtRFcVm6NUvCr+69lXA7RKqIO4MJDfnNfDoTBq/kjA60oJ8mQAeD0lCsnJxkDU4sfcq0bvkLg02oqj1RoDz6ZOaVGltZAPLS8KxzwRkH2JGhCmGjRo0IWDXaPS67THaZWYEefCdx5jD6ApCsHI4Ol3rtm3rsZVnLm28dk122HSozaQ+SssJ7g8ckD2WB1DsrqzkstoPIwdPhndFhmDmEmWBsmORGRVN1KBY/iK23bmRHUxKmyn9k9gKkU9/HKFj8SD7jsoYIwcEKJe1rXBYtzLpFaYVFmsEONOtKPSsZ9LjauMjjvwR9NM5upYFd2+udzdLa5ojGVVejoSSh5GcqWlI7g9ykcg+oe41IKjBsvxF7Ztyozoi1KP/VOjBep75HKFj8TavcdlDBGCARUpqn6exGMZ72lS6ql+owOEg7iPnctb4ZN5E3dDTatyyAm4IyP2D6+BObH/wDYn3HuOR+IC9dc27gpNcsm7nqbMK4VWpj4IcaUfSocpWhXuDwQdO14fdzWNx7S8ySlqPW4BDU6OleergYeSO/Qrnv2IIycAlOkKMM+9H1T87kzR1aZPsy9YeP7VlaNGjUpVkaNGjQhGvKZIZiRXZUlxLTLSCta1HASBySTr11QPjGvpVHtJu0qe+W5dWyJBSeRHH3hnPHUfSfp1D302CEzSBg3pU8ohjLzuVAb9bhP7g3u9MbcUKTDJZp7ZAA6M8r/ADURn8sdtXF4Z7Cptm2tJ3YvIpYWiMtcNt9sD4Zn3d5/7xfATjBAJHPUQKf8Ptgq3A3DjQJDSjSYQ+KqK8HHlg+lvPzWrAx8go84xq6d35kjdPdKl7QW3JDNCpuJNXXHCQkBGBgY9kBQSEjjqWMg9IIv1JDQKZhsALk8v2oFKC4mpeLkmwHP9L524olR3u3FVubc8UMWzT3CzSae4SsOlB9weMA8qI7qGPbTKAADAGBrEotNhUakxaVTY7ceHFaS0y2hISEpAwOBxqq99d9KdtfUY9GVbdVqlVlsKejAAMxlAEDl0/InBCQpQ4yMEZhzSGd4DRhkArkUbYWEuOOZKt/VT+I227Tv60n7am3DTKdcEPMumKdltoWy8lPAUFH7igoAjjIVpW793x3UvNTzL1fFuUxwdPwNFT5aiMk+p9WXCrBCT0lKSEj0jJ1Vs6FTHuv44NuOuDCnX3Op0+331Hq+XvrXFoucjWJ1Vjl0rADqgay+3qlHiOPx6g41FlxnVsyGfMSsocQSlQBTkK5BwRwdeLU81AEQ4anWjwXXfQgj6cZP8NY1PpMWMtTLkaNKjKOWni2Cof3VH3+h1KduaZt4zcxgX/EmNUKodLaKlElONuUxzPCsAlBbV2OUq6e441TfNUsj13i4Gds/UWUtkNM+XUYbE5Xy9DftWlVDV5RPxjrSunnox0DA/dVnA/8AedSfbGy9ybyrrE+w6eFyaU+mSxVypcZhp1CvuBZyFk4IIB/PGr5uXwfUipRnZNr7g1ZDLzSVxmpqUSWlHAIKlp6epJ79v46mtvU/xC2LBg0iHTtv7oo0Nk5RGaNLeV3whAQPKT+jYH89TanSIkbqRiwOap0ujjG7XkdcjL56KYsbo0aFS2kX9T6ha8gRg5MVUoKkwwesI4eSVtAKUfSkr6sEe+sKRtlt1cyzW7MqTtv1Dq8z7StaeGCVLBJK0Jy0tSgo5UtBVjHIwNROtb2XnTGI7N27U1u1mHo7jsmpqjGrRopQoH1IYKSUlP4lKRg+xAOoxacXYG5q+uqr3HlsXHMLgSlt1uhux5CVKJdDbDbWXEkHBeLhx36tS1VUvnXDvNY9xs21PfoV7RpjSjTpMlj4CXKUB1LbBSfIW4hIOGvQpY9XV6VnUAuGLbN1XGP6TVilbbXU+tSGZDtsyqXLUsKQBh9E4sSVDDZGfMCcjgZI1Ork2uvusWo5T7W3e/pFRHypTLVdYblKbUD1JdbmM9LvmocAKVdQ6cfTGsN28d0bdtlmibtbPqvWG3EDcqo0UtzRKUpWEhcVSRyQB1EZGecAHAELCujbHfBNChO2vujTbwEUiTT5FTihqSw8Vf1rUhBJUOkkdK1FCkkpUlSTjWnf3Zty5K+rb/f+yYVn1huAHW6smaklt0pwXG1Adcckcp9SuODkd8OyqPJvaUireHv+k1gRWllFSeqE5RgMyUFR8gQ1hzzFBLnIBS2gFOASDi7KTTLK2ctSZVrur0VydU5qpVVrVQQhDs+Usk8JAwkAcJbQAlIHbJJIhQPahrfq47SRV2rzh0tmmq+CpcSpUNRFYZZUUiTJU5h9sujH3ek+kKwMnNq7cXrLuOXUaJX6A7b1xUvoVLgrkJeQttZUEPNLTjqbV0KAJCTkEY4zpdvE5v8AM11pqydta805Dlxg7U6tDe9QbJUn4ds90qOMqPyIA7nVfbJtvUmzb43Do1emxLstFxqSy7JkLdYmRC2CqI+gqwpCiTjGFBWCCCAQ0wvEe13Xskidhl2QztdP7o15xXS/FaeU0tkuICi2v7yMjOD9Rr00pORpbN06BUdmtwm91LTjBdAluhqs09tXQB1q547YUeQfZWPY6ZPWLV6fDq1Mk0yox2pMSU0pp5pxIUlaSMEEHg6fBNsnY4g5jiEmeHat4EZHgVSe/Nj0vdnbuFfFqdDtUjxS/GU2gFUtkjJYVjnqBB6c5weofiJCw7XXnUtv71i12IHOlpXlTI/Ty60T60YPv7jtyBpg9pp0rZ7d2dtfWpijb9VUJVHeeKR0LUSAer+909JHPqQCAMqzXfiy28TaV6or1MjJao9aKlhKE4SzJHK0Y7AKHqH/ABDHp1apHBpNO83aRcdnBRKxhIFSzBzTj2pyKDVYFco0SsUyQiRDmNJeZcSchSSP56zdLH4KL4WpqdYM54qDfVMp3USekE/tWxzgDJ6wABypZ5zpnNRamAwSlhVqmnE8QeEaNGjSE9ecp5EaM4+4cIbSVE653bsXa7et+VO4FrKmHHCiKCMdLKeE+w78q555x7ab7xUXIugbTVFlhRD9RAhpI5wF8K/5ern540pOylrKvHc+h0MtqVGVID8shJISw3615I+71YCAf3lp+ermio2sY6d274VD0tI6R7IG7/gTBWamPsn4bJFzPMtivVhCXGwoZKnnQfJQSD91CcrIBHAVjBOph4X7GdtayF1uqFx2u3AUzJrrqipfTyUJJPc+pSie5Kzz2xDt3z/tG8Qts7dsdTlMo4MypFsZCOOpXUR93gIRzwC4Pnpi0JShCUISEpSMAAYAHy1jqZHCPHN+J7NwW2njaZMMmYDt3lfuq63/ANsYG59kqpyktM1mEoyKTNUPVHe9wSO6FgdKk9jwe6UkWItSUIUtaglKRkknAA+elL8SW/rlYEmy9u6gpEI9TVSrTCuVjsWo6v8AJTg/Ic8jJDG+R4azNappGRsLpMktFVqAo8x+m1dl2LU4rqmJEQtq623EkgpwRnuOPzGviO7UJvrLAhMnsVjqcIx8uyf1z+WvF6gUjoyWPKA9wsj+etO5TIUWT5saqMrQO7fxIbX+igf566Jz6mO20sRyNvS/cubZHTSX2dweYv6271JHYkEILkhlleOVOOpBP6k6mG1Wyd07nJW9QIKqTQ3QpK6tMLqGXPvD9k2CPN5GMj0j64I1WrsakPOxXXakZTLTqVvRHp+PNTkdSArnpJGR1AHGffTWbVXNtLeNHCqhvBf9q1FhAEiFU74dZQk9v2TilhLieOMc47gaxV9U4dFrQOeB/pbtH0rT0nOJPDEf2rbs3ZSTZ1uNUu2t0L2hOtMpaQp2S1Jjowc+iO8haEDvwnGtMyd3FTGU2TuILxbcUnzZlVo0ZqnNoynJQ4wEKeJSo46CpOU4JB1izGbUei/DQfE6UxRkFqVV6dNSsYxhfnJV1jnsc61Nw1evwX1zKb4nKZV4aGCTDbeozMlbg5HQpafLwcYwcckeoDUVW1PJ6fEFCeb6Bt5cMVeUvMBmTCVj/EpboPyx0++qvu6ibtQq7T2GNjbZr9to61uUR6oMToTCsISkxvPbQqKQEkdKApshRPQCc6yrY3RjSKi5Tk+Idtmood8ox67SoQa6ukK4eYw2pPtnrxkEa2VX3Wq9FPlzN99qHCOxapTz6j+flSSNCFAaqzbNLqJEfYDdq1a224Vqk2tJfCGyoHKW1NrLQSc8hKRr22vq9+7sVudaFmX/AH1RbZp6Ft15Vdbiuzo/mZDbTT+C8VkpdyVEdITx8tSJneLcevV+mW/tzeFh3pVpq1l1lijSozURlKcqedcW8cDJSAACTnj62JLqtC8P21jtWuSRKqtWqk9UmathKlO1KoOpyoIBJ6UhLeAM4CUDue4BdfMl43heNi+G7bqhW5Hi1Cb1lxunwW1+ZIkK6+t51S1cfec6j2GVYAxwFt8S+4TW5lcs+twH5Qtl6mrXGhPdIDNRbdUmQlYHdaUFnBORhQKe515+IoLue5U710meusWfV2GYSHAVKXRHm0JSqM8gk+UFL6l8YBLh/eBVg7I2+xuAxc+165SWpUlpNet58lZTHloHQskg9IQoKAIwc5B9tboWNjY2fOxxCxTPdI90GVxgVFNvtuqtecu86hbiXHKnQYrM1mC2jJmpX/WIGOergkAdz+mrG8OkG1a5s/ujKuytihUGomNEVNU50lt0ICkDH4/Vj0+/P56+PCvdz23e416U2uUWdIuh5tinRaJFR1PyZLalBaUkekJHKisnpCec451OrlpW3tkVuXeu8cKl1O7qw8qcxZlNQhyKyV5SHFtEdLjhAV1PODBUVEZxwuaYvc5jeqTcJkEIY1r39YNsVYWy+/zVzUK3Bdls3BRZNUU1Caqj0BXwEyUr0gIcAwOtQ4yAMnAzg6vXSB3dvfelz3rQblrzDX2JRKnHqLdvRVEtq8tQJUpfpU46OVJz6QQPSecvdb1Xp9focKtUmS3KgzWUvsOoUCFJUMjt/wC86XLBJDYPFrpkM8cwJYb2Wdo0aNJTlVXiasNV42J9o07zG67QiqZAdbWUrIGC4gHPBPSkg+ykJ5761VLeib7+HZSHQ2qqpbLThA/qZzQBBGSeFApV3+65gnvq6iAoEEAg8EHS57Z//TXxK3BZThLdLuJCZcHq4BV6lIxnk93Ucdyn6a3QPL4i0ZsxHr7rFM0NkBIwdgfT2Sy2pW6jaF3Qa5ESUzaZKCy3kerpOFoJII5HUnODjORrozQKnFrdCgVmCsriz4zcllRGCULSFJ4/IjST+K+1lW3u7MlNNqEKtNieyrpPSFn0upyeCQsdWB2DidXj4LriNT2xfoLpJco0tSEcAfsnSXBznk9RX+mBrfpJomgbO35f2Kn6Nc6Cd9O75/YV6aNGjUJXUovjYr4l3TSqC24hSYjSn3E9J6kqVwOe2CAf4a2PgmpEaK1dF6zVMNtRWhES6tfSWkgea6T7dJAb5/u6qjxB1VyrbuVx1bqXEMOJYbKfZKUgkfopStXHSXDaPgmmyUvRy9WGnG05TgqTId8tSfqoNlZ/TXQvYW0bIhm63jiueY8PrZJTk0HwwW88JER6vVK7tzKiy8JVYnKYjKeTkpZB6ylKz3GShB/8IfLTA6gXh8oZt/Z63oS45YecjCQ8kq6vW4Ssn9cjU91Gqnh8ziMsh2DBWqVhZE0HPf2lVV4mrLvy+7D+wrKrcSA24omoRXuptU9v04aDyc+Wn7xIwer0gkDOUbuKlVez6j9jXXQ5luymwQhuW30tLA4y24PQtPHdJI1051VPifvi3LN26cbrFOptZqFTUWKXSpiQtMh3HqWU4PpQFdSlcYyBnKk5ZSVclO7oC90qspI6hvTNrLn/AC7giIcDENK5jxOEpa5BP56yoLcxzpkT3OhR5DCD6UfmfxH/AC1gTaKp6pSKinoiF9al+RT0+S20D+BAJOB+atefkUf4hLU1M0vDgIk9ax+eRkfwOrbJJ73mAHAXsPW5UJ8cFtWEk8Ta59LKSW/HbuK42aAxXqNRQtWJNSqcxtiPET7nK1DrX8kJySe+BkhzdsJ/h+2std2HRb9tF51bYM6Yurx35UxQHdQSoqVyThCRxnAGkltqpG16uKpQI7aZHCVsyqSJLLqQfuqS4jAB+YIP10yu0F8PbiWxISnw9xKnPpzqEPy6O/Fgsl0AchxakKCs5JSlSsZAOpWkTM593kW3Wy/tVtGiFrLRjHffP+lK7g3R2IrYW21VLfgJWVJVKXbbj0juR1ISpgpSfcFXV3GR7a8bdquxsCO+Lb2qr91sPOl16pRrNdmIdcVyT1rbGO/3UgAew1va5bu/jUyDLsms0mnsNslL0CvVVU1sk9uUxgvIHH3yPz0XTUd56JTvLN6WtNrfw6nBBiW8spBAJ6nX1yEtsN4B9bhSD0kJClYQZqprGFbsWYpMei+HGvy5i1AIblWa1BbI9yXXkpQn9SNfTyFstLdc8K0NDaAVKUp6jgADufv6gSrvnSIz8Gu771+4K5LUkJpe31JRLZQFfgbfDRClDlR9aVAe3zh9a2/mbiXbQdv37fvmHJlx1T/ti6K45KeixErALnwoJDS14KOlzpIUoaEK6fDfSZFw3tVN102fAs6jSqYmlUanxGmkGU15vmOSXPLGDlSUhChwpOTyOlR0niGtiNvUs1fba5YVcrFnrehTaOl8BJU4Uk9BOAlZ6CAokoV0FIIKTi91W8xT7DTalEmmjobgfAwn20p6mPR0pUlJ4JHfGkoXt9vVsVdCLrpNDkVQRSUOz6WTJZntEda0yGh+1SD0klak4SrGFHjLYiQdYGxGISpgHN1SLg4FevhtvJi0twajt7eUJ9ug3K58HUaXUGiBGmH0BSm1dg56UEjuQn5DEsvzaobTb4W3cW2U2LMfW6481bUp9SPh2ihQeeU7z0R05CiV4APAJOBrZ7v7sbK7jbSM1CuUeI7dD+YiKfMJYl094JJK1uAdQYT1lQUMhWSAOvKRQ9Wuqt1mNPiOVGY9Gn9CajOkDpl1YI+55n9mwBjpZTgDGVZJOnMZJVynUGefBIe+OkiGucBlxVj3JusKHXqvOtGox6/e8/DFTvAspVGYQO8antnI8tJCQFHIUR1Hr7mnnnEtOvz58x6RKkL65EuU6XHn1n3UpWSpR1sLfpNTr1TFKoUVtxbQ6pUh1flRKe0ASXZDp9LTYSCcnk4wATgavHZKyoypDcuwKCi7ayyr1XjXoy49KiK7gw2FDreUnI5wMlOeoApOqJfBQCzek/yU4MqNIG7uizzUBsTZjc+9YaKhTbfbpVNcT1Ny6y4YweTxyhsAuEEHIJSEkdjphPCtVxQatWtonruoly/YrCJ0KVT3cgIccWHWAkKUAGldAwCMeYBgalbezUOuOCVuVcNUvR8q6zEkOFintnnhEZBCcAqOCoqUOPUcaT7ciDWPDd4lU1q3o3VTitUuA051Bp+K6ClyOSAB6SSBjPThs8nUuoqpKg9MqpT0sVOOgF0U0aqzYbfK0d248hil+bTqzEQHJFNlEeZ0Zx5iCOFoyQCRyCRkDKc2nrOtKNUB4vae/Sf6K7k0xl342hz0tvqa9JUyo9SQpY5A6klA/wDGPz1f+oTvrQzcW0txU1EdL7xhqdYSpXSPMR60nP0IzrRSybOZpOXoUipj14nAZ+qrDxh0yLcO1FGvGGuO6IbzbiXkrJ6mJCQMIxwQVeWc/JOqw8HFeRSt11Ux11tturQ1sjqSSpTiPWlII7cBR5+Wra2/cN7+D5ynrlMGRHpkiGolOQz5CleWCPn5SWzn66V/aqruUTci26q2+iP5NRZDjq/uobWoIcJ+nQpWrNMzWp5ID/En53qLUv1amKcfysujWjRkfMaNc8uhXNa9JCJV31yU0oqQ9UZLiD8wXVEf5HTF+IJUOD4ebAtthktpnKiLSU9k4Zyr9SXM6V9RzkkkknnTbeKKmIVF2woqcBBqbcUD6YbTrqKqzZIm8L+AXL0ZLo5ncbeJV/UiGinUmHT2yVIisIZST7hKQB/LWVo0a5cm66jJYlaqcCjUiXVqpKaiQojSnn3nVBKUISMkknXPLde+6huXf0u6ZnmtQUgx6REUslMeMPxYwMLWR1K9+w9tO5vlt47ubZDlsJuOZRGnHEurUyylxDxScpS4k4KkBQB6QpOcDnSW7+bWu7YPM0x3cuhzZ0iGqUiK5TZLMpSAopHQlpLyAFEEBS1IGUnGcHG6gliifryXJGSwV8U0rNSOwBzVeT6kPi0U+GlL0lf3uMpaHzV/6azorXkshHWpxXdS1HlR9zqKW6motsrRCZjtuuffckL9Q+Xp74/TvnW3joeiVGPMq8mNUmUKKnKet1xhtz0njrbIWMd+O+NWoqp5aZC0nwA781FlpGBwiDgPEnuyUitKHSLjugUiqXJGoNMYAcqEvlyQUZx5UdlIK3XT/dSQkZJ7YLhWde5pFrxrd2c2auep0mEhSY0mUlqmRX0jjzUrkKC3FFWc9SUqPJ1D/DhesWuW641t7sTToVRgyGWpkg1BliK2stj9qXFJU/njOAhZx+InjVm1ymbiv0ZU67b6+xVFHoptoQAt9boJwlt6QFKd6hjjy0YPvgEmBVVD536zu7gugpaZlPHqs7+K0V9v7vx6Uufcl/2FZcJLraFtxJSmypGfvCXIaUEKJ46SyoEDuCeKjoL9u1eqpiwtrLi3aeV0ldQkVaQ9DDjhwF/7xHZbQSEjK0pCcDOcanFGtnabb66VXjf1U+MuV2ORFo78t6svU9khWeP2jjisZ6l46EkkJwPUrzre/d/3BUXLY2k2xeElr/d1LqKkdcU8JyttoltoIJSfW5yCCBjOMy0rZtWjvvcNNDMmrWltNRHG+t6LRmRIlheOgpWoYbAKST1JWSClP6Zfg2otEp9NvaZBrbtdqLlwuRZc6Q95z60MpSGgp0HDgIUpYI7dZSeUnVP3Bbt23XWjD3Bu+ff1USQuTbVvyvhaXBSHG1EzZpAQ2lIJ9CUKXnpwoDnVJzrvrFl7gVde2txogploSw/9iNqREUU4yhrzCVOISRw6oJUrKiAArn6BfBfCQM08viO2bqm6kqiSYl9P26zSPMcDXwxdQXT09LycOIKVpAICiTjPGOc1pXr23R8PdKQbrva2L7ozqvJpjL7rrdUdwhAJACFJ6Ue5Ws/e79SgnSs1mvbnV5t4Va5q3KakI6XWXaioIWk90qQFdOPoRqIyIEinPJMuO42PwqQRjP59j+WnOp5Wi7mkDsSG1MTjZrgT2qTVO4Jtz33Ku26eh2ZVnS8l1IHlhXACQB2wABg88c6kNGjLq9ZjQGkT1Mu9RHwUYvSJRSQPJjpAPUskgFZ9COSckdJj9hWvcO4NzxrXtemiVIlrCpA6ihhKQeXlHGW0gdz3PYAnA10U2X2kom3MMSPN+0665HQw/PW2EBDaezTKBw00CT6Rye6iTzrT9YYYzFF3/Pnms30QmkEsvdu+fOShG0mwrbNFhm+YsdmGhSJLVsxXi5Gbe6eXJTneS9k9yShJGE5HqOg3H8XVo2hcMu2bZtmRWWqYsxVSUPJjxwpHpKWhglSU4Kc+kccZGCbq3vXdQ2vrTFk09+dXpbPwsRLLiEKbLhCC51KUkAJBJznI7+2kOuGJSth7idt6XZcO6bnjtILtWqjbhgsurbSsJis8BwIJT+1XyohQ6EjvPVBXZH8b1FUpAe2/qITkeYpuoIUQPcgdIz+WdaffHe/YbdyxJsar0y6YtWpqUvUlXwrbb7rijgoQtKloCMcr8zAxykKUANV3FnxNy7TrFQveE3TKm2w8Kd9i2gSt1xLfU2kuISR61kp7p6ek5UOoEe1D8MV13FsvCvWiCS3XVKcL9EmthtTzQUQFtKOMHAB6FDnnCs4SRChvhUNTHiIsr7K6/ifjz19GM+T5a/O7+3l9effHbnXUHXMXw4XxTdpd5E1i66I8+hht6nvgAB6A4paUqdCT3UkJWgjI4Ur8j0ypk6JUqdHqECQiREktpdZdQcpWhQyCP00FAWRrwqEZubAkQ3s+W+0ppeDzhQIP89e+jQvqX3wbqjLtK77WW11sRauvqKvxocbDeD+jR/jpSKs2luZMZaHSlDriUgewBIGm/wDC1Fbpl6bm0tvPSxV0hOfkFO/+ulZ3GiphbhXJDQkJQxVZTaQOwAdUB/lrpqN16mTnY+C5mubanj5E+adf/apZn/7mP4D/ANdGkO897+2c/wDMdGl/4eP/AKK9f5qT/kLyPbTgeJuayZW1lTKh5X2y0/nPHT+yVpUrtiohXRWYTX9XHnyGUfklxQH8tMd4i2Fydmdta008hUaIqMl1zq7FTKcH/kVp1XZ0kR438Ql0YLY5W8LeBTPaNfDDrb7Db7KwtpxIWhQ7KBGQdfeuXXUI1z48QNxi7N77kqzbqXIsRaKXDKXPMT5bIPUUqwOFLUskexzydPzcH2h9hT/sppLs/wCHWIyFO+WFOdJ6cqwennHODpDK7sXvPQ6Q9UZlsR6k4Ctx9cWooccWs5UpwpIHBOSeffW7R8kUc2vIbWWDSMcskOpGL3VaqCZE5TJX1eUkFzpGME9hnvnH17Y+evp5cGntl1wtMjuSe5/1OtHS3qsuElEKN0rfJdelP9io/IZPAAGD9O2syNSm0yA4+tU6Z38x7hCcHGQn6cf/AG1dZM54uxuJ3n5c/jDmoL4WsOq92A3DM+g/OPJXbsZvzQtstto1CpdEdqVw1ie7KnTJg+Egw+tRQjrcAUtwJSlCyAkDCyArIxq04T1y7jzlzU3c/eC1IQyunWo4aZR4oKgVJeqC+p5QwArDSfMBGCCCNKLVPLhU9yVLc89aR6EEYR1ewCf/AFyfrpptglXBI2vols0a4KPYdA8pEidU3JDTtWqTjgQtxTLZPRHSQVJStYWrCUKKQepOoNbTbBwBNyVfoqnbtJAsAvuu2lQ7MZYt+rVNqVXZwQoUG1YChgkJSXF9Sy9KcUeOuQ4lohZLiVABC86Na6LS23if7QKrG20shooLVuUaWtc+e5hK8SZYCVuOK6V5bZSk4x6hgjX61S7itDzLW2nuS3Kxc8pKXnpEahuOyFNjjzJk5+W6hOQOB0EkgBCEpB6TcC1KPQ6lSLj3ar7931KBKakvI+GP+9yikpjU+DHQsAZcPmLJSeoISFYSo9OJblW/iLRdDGyialIpAsKznJTMSgW5ACQ9KU51LL88gjpAabWA2nqPWsZ4GTQ9t09EGm/GraK5LiOrHYgeyRntq9vG/EvaoW3RLsvCqRKW3JmlinWo0vrXGbLalF9xYOFu8BKsDpT1JAJ5Jo+atldDYmIb89TSUOMo6OsLUMYSpP4knsQfbVTRjQC+Te0YKXpNxIZHewccVKRbdW/oB/TKZW7RpER2K5IgxpdVC5M4o++022gZDiThJSrHKh9daerRZkN6NS61SJ0Z2XH85KZDBb6m+R14VzjIIB+mr6tZm17vqMupbbTbEtx1q22aXcrVToSo8Ql9a1qfjIKklbifKIwsdOOnk54qTc26KhclZh0ASLXnItZtFOh12nh51+dESn0BxanClYJJURgFKurBwT1eqatqJJdR2N+z9BLqqGnji124W34/sqT+B+6nrR3vetF5QVCrzZZHoyfNQkrbOc8enqB76f7XNrw6NOyvFPa3kIWryZJU4psZwAwvJPyHIGukup9Q0Mlc1uQJVKneXxNc7MgI1jy4EGYpKpcKNIKRhJdaSrH8Rr3UpKElSlBKQMkk4AGoVeW7G3NosKcr14UmMoNF1LKXw46tI/dQnJUfoOdJTlMo7DEdvy2GW2kfuoSEj/LSn+LnfurQazJ22sGV8HKZSPtirAjLAIz5TZ9jjHUrvzge51r95vFXLrkV6gbTRX2Gnkqbfr0tstlCSO7Cc5B7+pQyPYZwrS1WY1ac67G6feVySaXb6HC/UpjbK3pExYPLaAkEgq59auByTk4Cnsis3XeMPNIfLd2zYel5fOC3tlbQ3puXRatXLVphkQqY2465NlLIcqL/AHU22eetfc88Z7nJGrz8Ae6E5NSmbU1950pShcikF7PU0pH9bH57DHrSMDHSse4Aa+xo1BiWfSWbYhtw6KIraoTKGygJbKQU8HnPOTnnPfSbeMGgO7U76W7ulbSPK+0nzKcbSePiWSnzByCAFoUPbvkgcaW9+ubpjGagsnj0a1VnV6HdFqUq46fn4SpRG5TWQQelaQR3APv8hraOLS2hS1qCUpBKiewGvC9qi/DYpErcndKc2coXVx0n81On/TSr7nSBL3JueSFBQdq8pQIOeC6rGma8HLLiI19VdxQ+Eeq3Ql0nglAWpXP5OJP66UutOdVRnOhXVl5xWc5z6jzrpaJtqiTkAPBc1XOvTx8yfNeGjTp/7B7R+a//AC6Nff8ALQc15/w8/JK/vdTvszdKuMhlTTbr4fRn8XWkFSv1V1auKqIRc/gjjOtNvpcojqD0jnrLb3Qon+6EuKV/w/LUc8YVCMG9YdVQ2vy5DamFrKh05SepIA79lHUi8IkmPcVkXrt3NdUhEuOpSSHfUG3my0voSf3SAc/NY0t8mtSxyj+JHhgU1kerVyQn+QPjimA2hqgrO2Ft1JLXlB2ntDo6s46U9Pf9NSrVGeDerOmx6paU9KGalQKi408z19SkhRJyfbHWHEjH7mrz1EqY9nK5vNXKd+0ia7kjVa+Jy6V2lspcFQjPKamyWRBhqQU9QdeIbSQD3x1FR78A6srVE+KyxL73KkW1b1rR4aKbCeXPnSZiwhAdI8toJxlSilKniU8A5TzpTAC4a2SY8kNOrmkzjMoYjtsIGENpCQM54AxrSuVZtqtzCrqWGW0stto5UtXc4H+X6aZW7/Da1Z+2leu26Lrm1ORTID0gQaYkRWlLSPR+0UFLx8xjn6aXSiUmPAbDx/ayVDKnD/Ia6RlUapwbCLBuZPhguZkpRStLpzcuyA8cViO0qRUiZlVkFjAy0ynBS0P72Rg+2dfkqHFXT3XhAitNNtqUt1LACl4z9wHtnHc5+me+tv5YkOHzwlSWyCEZyArvz8yONY1ZVGkmPSHqhFhfGyGmFvvq9DCFLALisc9KRyfoNe5Yo443PPjmT84LxFLJJI2Mcd2QHzinN2krlK2o2GtahwqY3VLsqVLFRapcJYC3y4OvznnDw00kKT1OK4GMAE4B11KuKx7MmJvO+q7HvbcabIW3Ej0lkyGor60ZTEhpTlKD0lKC4o9SsjqVg6hlvbq7H2QhiWKZVNwLslycPVZ6lIS4pf3UpYLgSlpkYSlDbeAE4wMasu/qjG25iNXjdCqdUdy60r4C3YQQVxae456UtNJ4PlpKgXHeFudhjKUDlyCM11QIOSqa5bOr+6V+VqkXlLhKuWWllUlxDanI1oU1secsdXUEl91YbbBxykOHIBOFups5VEkOQJa/Pg+a4mNMbSry3QlZSVoJHqQSDz7fya6ZR7srFSRs/SJM6PHqnXWL6uJ1HTLmtKB9BQnHktu46EN56igAEBAWkwqoWrFuLaaj0+n0eHKrl3T49PtOHI9D1NpMdbjqpI4WUqcPpcWCAoLSogEEFsE74H67EqeBk7NR6p0ijSl/FK+DeUrGFr6SePz1iVevQ4SFNxSl1/GB0j0p/M/6azb3tO1UXjOg2u9VGoENDTLyZwCnW5QBD7ZIABCVDAI4I99YcGk0uHUkMoaLr3llwKcVnpGQBgdvn/DV6OaomYHMaG33/pc/JDTwvLXuLrbv2mE8ENFtK2605dt3XTRo9x1OL/8ALIDk5Idbjr5U6sZwCvAwCcgdwCdOqCCMg5GuQl0QEQqooNow06PMTxwD7j/38xroT4HLnl3JsFAanvPPyaRLfgF158urcQFBxGc8gJS4EAc4CBj5Dn5o3RvLXZhdDDI2Rgc3Iqv/ABq7aX9KmOX5bdfr1RpCEATaOxJUkxEhISVspTwUHpypJBIJUeQThULfhQalKbg23bs2tVFaAoR2WFOrHYZV3wMkZIGOddYSARgjI1raVRKJQmpKqPRoNPDzi33hDiobLriuVKISB1KPzPJ17hnMV7AfkXXmaAS2uT+Da6TXbnwr3vdHlyr9qabXpiiCqBD6XJS09QyCrlKSRkZ9WDg9J5GpjdXhFhx74olcsGoUyFToBYW/T6s05JS+42rJUsknqC/dOAPYADgTS8PFVtZR7TarFIqLldmSAfJp8dPQ8k448zqx0D8+fkD21Q9c8al/vTi5RrYtqBE6QA1KD0lefc9aVtj9OnXiSR8h1nm5XuONkQ1WCwV57k+Jej7b3nPti6rKuBlbKwqE/FLS25TBAw4OpScc5GBnGO/tpefFN4gaJu9bFKtm3raqcb4eoImGRLKPMKghxsNIQgqyFeYDnqHKQMHuK23q3iuXduVTZFyQaHGcpyFoaVT4qm1KCiCQpS1rUQMcDIAyeOdN34I7Hs2VsrQbpk2tRpFc+KkqFRdhoW+kofWlJSsglJAAAxjtpa95q2th6TOoWzNo0ipsOx5saksIfZcOVNr6BlJ/I8a2e6FVRRNurgqrjSnURqe8ooScE+kj/XUj1SHjHrC2NuoNsw0pdqFfqDbDLQc6VlKCFEj5jq8tBzj7+nU8e0la3mlTybONzlpdkW2rT8JNWrryXnfjm5stbfYp/wD04x24IaSr9dLLt7Svtu+aBR1RlyW5VQYbeaT3U31jzP8Al6jpnfE0+1Zfh+odlxnFqW8I0BKi4Er8tlAKlEDuD0gH29Wqo8IVBNX3gjz1Nulmkx3JJWhQAStQ6EhXzBCldtXaeS0Ms53k29FDqY7zRU43AX9U7XlN/uJ/ho196Nc4uiVG+Lq2/tSw36gyyFvwsSQenKglP38H29JJP+HS5eHq6/6H7tUaouu+XClLMGb2A8p3AySewSsNrOOcIx76eq7Ka3VaFJiOtIdSpByhaQpKhjBSQe4IyMa54XtQJNrXVNozpcHw7uWHDkFbZ5QoHAycdyPcH5auaLeJYnwOULSrHRSsqGpmVuf7NfFmk9aGaNeTHSttB6EIdJ9K+hPBPmJx1H+2Wfc5YvSx3Kt3d3w1QbihLU7ctrKDjgTlS1KbADgwc5KkBLg7klIHudXRspejN97eU6thxCpYR5M1AUCUPJGFZA7Z4UM4yFA4wRrFVMJYHHMdE/jLwW+leA4tGR6Q/Ofj5qaaNGjWBblUPjDqEin+H+v/AA5A+LXHhuZGf2bryEL/AFwo6R4AJGOwGuhW8+37O5dmKteVWJdLjLkNvuORkJUpflq6kp9QxjqAP6artrwpbYeQlD8m5Xl9IDijVFgLOOTgDAz8tUaGtbTB1xclTa+hfVFtjYBI2zViiGpbCTImSnVraaHsnPSkqx2ACRr7p7T0FhcqUwkyHElbzjigVk457cBI/PTN+Lbbmydv7MtZFo27DpZkVopfdbBU44Ph3OCtRJxwDjOM840uVdUlqjzHFDuypP8AEYH89UaWQzRmVx6vtn2qbVxiCUQtHW98uxZdBqkG3L0tSuVlRWzCrkKXKW231YaaeStYSn8gePfVsVnxABE5+9aZTI9w3rMcDdOdnRsw6DGJV+wYH3luqQpXmLSpIJJycJCTRD5drU9DjbSPgGOQt4elSvcge/HHy1sKY0gvKdWVqWhASgqP4CO/T2GfkBpctIKqbWv0ch7/ADNMiqzSw6tulmeXL5kma+2Snw90GlQJap907mdcy4J0mSnrTFSgqmPLUR0obS0jyR90ISrKTlIz+bO3JalU3DvzdFEn4yHY1uMxYKkx8NISpLpUWUnkBKWfLSRgqC1k5KtKlFnVR+G7Ddqsx+mIQWGYIdV0FnzgtLZ+TZcCV9HZSkpVj0gjKWl+C4ukQlMIbq8EQ5w8sZU0h9qRkY7ErZR+gI99TW0Ujmaw+XNlTdXRtfqn5YXWxpsqVUfiazOKTLqclyY9056epas8ZyQMY41gNnzrxcIOPIihP55Of9dbgdLbeOyUj/Ia01rILxmVNQGZLp6Mfug4/wAz/LXQmPU2cQ3eg97LnRJr7WY78O8+11rr8WkyIjYI6kpWSPkCRj+R/hpr/wDo2pcf7DvKD8Q38R8VHdDPWOro6FDqx3xnjOk8uKWJlXecSrKEfs0fkP8A75P66l2xG5tU2rv1i4oSHJMRafJnww4UiQyT2+XUO4J7H89c7WyCSdzh8tgujoYzFA1p4eeK6oaiO8t2t2NtfcN0F5tp+FBcVE6xkKkFJDSce+VlOR8s6wNq937C3IhtKtyuxjOUkqXTX1huU3jv+zJyR9RkcjUwrNIpVajNxqvTYlQYbeQ+huSylxKXEHqQsAjhQPIOsi2JHvDx4UqjdMGLcm4LkqkUp1JU1TUJ6JT6cDpWon+rSeTjGTgds6ZatUTbHYqz3rpo+3zSUQwUuPU+B58tCFZUordVlYbHTySrA41bGo5uVdNu2dZdRrl0TGI1NaZUlYcwS8opOGkpP31K5AT7/lnQhID4jt4pG99yUOk0Wku02mxnfLiMPKSXHX3SlJWrpzj2AAz766AbaW23Z+39CthtZWKbBajqUcEqUlIBPAHvnXNTw8KbX4grLWyz5DSq6ypDXUVdCSvhOTycDjOupmhfAjS6VQ/7SPFpHgnD1ItCP1LacwtsupOVK6FcAlakJJH9kk+2rc3ivONYe39Rr7ziBISjyobalAF19XCEjPf944zgJJxgaqzZiMNrdiqzuDcH/wCK1cfHuBwYKgchhsjjlRWVY45cx7a3UzSxjpBmeiO05+CyVDg57WbhiewZeKqrxg3X9v7qGjx3euHQWPhkgYIL68LdUCOf7NBB7Fs/PVq+CW2vgbIqNzvMpDtUklphZbAUWmuDhXukr6hj5p0rEOPWLuutuMz1y6tVpeAVdSypxxXKieTgZJJ5wAT7a6JWXQYdr2nS7egJAj0+MhhJCQCsgepZxx1KOVE+5JOqGkCIKZsA+fCpujgaipfOcvnotvo0aNQVeRpWfF/ZCW2G7ohsDrjqCJCkgZLSjgE/PpUQPf73yB002tNeNFj12hSYL7KHUutKQpChwtKgQpJ+hBOnU8xgkDxuSKiETxlh3pMfDBfybL3BREqDoTRayBFl9RHS2v8A7t3n5ElJ+iyecDVpU5bmxm+64DqnGrKuo9TICFeVGeJ4IwMApUekgfgWnI9KdL3uXaUqzrpk0l9DhjKJXFcUP6xonjn5jsfy+ur62zqtL3w2okbb3E8G7lpTHnQJS0A5Sn0ocGO/T1BCx7hQI78XqprCNsMWuFj6H8KHSPe37Bwe03HqPymfBBGQcjRqjvDjuBPMqRtbeQ8i4qIktMOLcJMttHtlXJUkYP8AeTzgYOrx1AmidE/VKvQytlbrBGjRo0pNVT+KeyK3fm27FJtqAzLq7dTjOsqddDaWUdWHFlR9gknOATjOATxqD7Z+Fegwm2Z+4k3+kE3pBVAZKm4TainkeynME/eOOwOB20yGqt8R+79J2ms1cpS2pFfmIUilwScla/7RQ9m05GT78AcnTBK8NLAcClmJheHkYhJHe9DTb9+XRbXwpix6fWJLTEZXPTHLhUyPyLakH8jzqE1mV11gw4b7ZVLbDDqgoej1fP54Khjvz89a2sXPX6xUJ9RqlTflzqg950qS4rLjiu3f2GAAAOAAAMAY1qo7hYfbeRwW1BQ4+Rzqia8GJkYGWZ9vwpooCJnyXzyHv+VOHIaIMEtQ2yEsNqdHH314wCT7+5/h8tedKdam12VMbd60oYbQnByB1ZJH8UjW7siFJvu+aTZluFCptUcKFPrGUMNhBUtw8jq6UgnAPOMDJwNWZ4gdkoez8O3qnQviJVHlNfBVSY85kiYMqbWU59KVjrAwMAp5IJGdr6qFs7I2nDw5LCylmdTvkcMd3HPFVNVUuOxDHaJC3j5fUPwg9z/DOs6i2vc91yFWzY9GfqlRRGLqm2lJSGWU8FSlLISM9gCck9s68lgAFwJClBJxxz+X+Q043glo9pxNpWK5SJsWdXaq4o1l9OQ628knEZSVcp8tKgMcA56xwoHXvSU5gb0c3YdgXjRlOJ3dLJuPaUh1w2FfNuQXJ1fsy4qVCaWG1yZlMeaZCicAdakhPJ7c86jmuvlz0Ol3Lb82g1qKmVT5zKmX2lfiSfr7H665YbxWRO273IrFpTgoiG/mM6RgPR1eppY/NJGeTggjuDrm10pCiJAPcA6llL3O3FpbcZmBf9zx2YqUoYZTVXi02lIwlIQVdPSAAMYxjVt+DfZCDuTVpFz3N1Lt+lPpbEQAj417HV0qVjHlgdwDk5A4Hd4oG31iwYTMOLZ1AQwwgNtpNPaVhIGAMkZP66EALnd/8SW9fR0f0/lYxj/qkbP8fL1XtyXNcV0S2pFxV+qVp9vKWVTZa3ygKOSEBRPSCfYY11Nqm2m3tTCRNsugudPbEFtP8gNZkCx7MgJZEO06GyWCC0pMBrqQRyCD05yPnr4vtkkHg22Yuiu7hUi+qrAl0u36Q8JbLz7ZbVMdT9xLYPJRnBK8Y4KQc5w/+jVJeJHcKbEMbba0AJFyV0eQ4ptZCorS+Pw8haufySCflpsMTpX6oS5ZGxM1iovcL7m+G/Ee34vmu2dayi7MV0q8p93OD1exJIKE556UuEcFWor4xb9TVrij2PSnU/Z9IPXLKDwuTjARx7IT/wAyjx6QdWBcEuj+HbZpijU5bb9z1NKg26hsAuv4HU8rP/dt5SAPqke5IV2z7fq973hFotPSt6bPfJcd6eroBOVuq7cDknt8vfVykja521/g3AepUOskc1uyGL358uAV3+CuyROrU6+JzAUxAJiwioAgvEArUP8ACkgZ/v8AB76bLWosu3adadrU+3aU30RILXloz3USSVKP1UolR+pOtvqPV1BnlL925WKSnFPEGd6NGjRrMtKNGjRoQqe8RO2bN328t6GhpqoMnrjOqyAhfuFY/Crse+ODjjSb0ifWbRupioRFOQqrTJGRnulQ4KTjuCMg+xB+uuk7raHW1NuJCkqGCD76W7xJbPmpNruChMgVFoEqSBgSUD8J/vj2Pv2PsRV0dWCP7UnVPzuUnSNEZPux9YeP7X5cDVN30s6Pe1kKFM3AoPSp6OhwIdyOQjP4gSCW19u6Tj1ATnYLdpq9Iq7euBH2fdkAFEhhxPR8QE8FaQeygfvJ9u/bsndj3TXLGulmt0Z0x5kclDjawelxGfU2sfI47exA+WmIlUWgb6UpF9WJMFu35Tuky4/X0kuD7vUR7HB6XQORwoZBCdNVStY3Vd1dx/55Hks9LVOkdrN628ceY5pl9GqV2e3pNTqYsncCIqh3XGy0pboCGpSk/L91Z5OPunGUnnAurUaWF8TtVwVqKVsrdZqrTxB7v0PaO0vtCaEzKvLCkU2nhWC+sd1KP4W05GT9QByRrmxfV3V++7qlXFcc9c6pS1AHH3UJ/C22n8KR2AH+ZJOuq90WjbF0LiLuOg06qqhOeZGMphLnlK+ac9uw17Itq3EKCk0ClJUDkEQ2wQf4aUvZC5Ni2rkIBFvVcg9iILv/APnX0m1rnUkqTbdZIHciA7x/y667jgYGjX26LLmBstuNV9lLjmVc2ezKqM2MGGVVJLrKmW+rK+gcZ6iE5Pt0/U6YWN4wrCuSmv0S+7AqIp0toNvoaU1LbcJIz1IUUYSO+R1HgcaaG6rUtq6oZh3JQqfVWDj0SmEudjkdx8+dUZfHg/20raXXqBJqltSihfR5DvnsdZOQpTbmTgdulKkDGviFErX2x8Om4lYL9l7iVCKlayVUduWGVHpwpeG5CPNCcHGUnpHseDphdt9rbD2+ZP8ARagR4z6/vy3CXZC+VHlxWVfiI79uNJ3efg13Fpjjjtt1ii3DGSU+WlS1RJCie56FZQAP/Ez9PbWDSro8Tm0DrbM6FXpFPQ4tsMzmDNZXggqKVjKsYHBzgAnGvbnucLE3XlrGtNwLLoNpSf8ApF7NakW/Qr7jRlGTDe+z5biUjBZXlTZUe/pXkD/xDr6sDxq0GWGo172tMpzhKUql0xYfZyVYKlNqKVpSE4JwVk4OB21+eLbeTba99hJMC17njVGZKqDCW4wbW28AhYUpSm1gKSnA+8Rgnga8L0pf/wBH5/8AkGr/APmZP8m9MNqhPAZTpUHw9Qn5CUpRPqEmSxg5yjqCMn5epCtX3oX1GjRqmN5N6EUWf/QyxYyq3dsvDTfkjzG4qlds4+8vBz09h3UccFkUL5XarQlyytibrOK2W/m7MaxKcmkUZIn3TPHREjIHX5PVwHFAd+eye5P0zqIbeUSnbO2lP3M3MkF+6KmSelZDkgKVyGEfNxWMqI4AHJCUk687Xs2h7P0yTufulUxVrneJLQ6vMUl5Q+40DjrdPYq4CQDjCQTpet2dw61uLcZqlUV5MZrKYcNCiUMIP81HjJ99WKamEg2cfV/k7jyHJSKmqMR2knW/i3hzPNYO413VS/Lyl3BUQrzZCghiOlRWGWwfS2n54z8uSSffTbeGHas2Nbqq3W2WjcFSQFKA9XwrJAKWs/vHuoj3wOQnJhHhY2ZDaWL7u2Jlw4XSoTqfuD+2WD7/ALo9u55Iwzml6Rq222EWQz9l70dRuvt5esUaNGjUdWEaNGjQhGjRo0IRrzlMNSWFMvIC0KHIOvTRoQlp8QOyIqCna7byEt1DlS0dkSR8j+6v5Hsex+YXC361cNmXGJ9KlSKXVIxKFcYI+aFJPcHHY66RPNNvNlt1AUlQwQdUzvTspSrsYM6IDFntJV5chtI6ueelY/GnPPzHODyc1qPSGoNnNi354KTW6O1ztYcHef7ULpVz7e7/AFGYoN6MtW/drICY0tpQHnrIwS2T3BIBLSvpgnGRkw7s3Q2RdRTb1gO3XaqOlDNSjEl1pATwAVfLGOleO3Cvmul42lX7PqYjVaKtn1AsyGyS24e4KVfP6dxjVjbX7/3FbUVuiXNHTctB6A0W3z/vDaO2ErPCwB+FXyGFJ1tfS3ZeKzmHd7FYo6yz7TXa8b/cJtbHvm1b1g/F23WGJoH32+UOt8kepCsKT29x2wexGpJpYYdh7a7gyRcW0l2O2pcAw58EhZbCV56seXkKRyPwEo9PCT31s0Xxvjtur4a8LWRdtIZHQJ8MkOlI4CipIOfSkqIUgHnlQ1KfSNJtGceBwPsVWZVOAvIMOIxHuExejVT2l4hdsq+2PNq7lGe6Sot1Fvy8AHH3wSgk5zgKJ1Z1OqVOqKCunz4stKcElh1K8Z7ZweNZZIZIzZ4stMcrJBdhusrRo0aWmI0EBQIIBB4IOjRoQoVeW1G3N3oWLgs+ky3FM+QHwwEOoRknCVpwpPJJyCO+qM3E8GNq1BD0qx7gnUOSVFSIsz/eY2OnAQDw4nJ56ipfvx8meqFRp9PSlU+dGiBWekvOpRnHyyedVnd/iC2zt5s+XWVVh7pCg1TkeZnnGOskIB98FQ0yOKSQ2YLpckrIxd5spTs7Zbe3m2dDs5uYuaabHKXH1ADrcUpS1kADhPUtWB3Axkk5JzL2va17Mg/GXJWI8FB+6hRKnF/4UJypX6D2OqWdv7ezcc/D2TaQtekvZR9oTcl3p/eClABOUqBwlJPHCjrHVtdYNlPf0p3lvE1+qq/aFiQ4S0pWerAb5W7zng4Scn061NpGtNpXY8BifZZnVTnC8bcOJwHuvmfee529jzlKsKmu2xa7gUh6pyz0uOJKcEFSc4znHS3n6q74zZE/bPw60NUOnNiv3Y7jzApaQ+okd1qwfJa74ABJz+Lk6gm5fiOqs+MaJYEEW/S0J8tMkpHxCk4x6APS0Pyyrtynkap22LfuG868mBR4kmpTnljrWSVBOfxLWewwDyflqpHSEt+50GcOPaVLkrAHfa6b+O4dgWTft63LfdaFRuGaqU6CQww2nDbIUR6W0+3t8ycDJOr+8O+wXR8Ndl9xsr4chUtaeE+4cd+vyR7e+TwJrsdsPR7IU1W66pFVr5bwOpILEUnv5YI5VjjqP1xjJzdGstXpEauygwHH2Wmj0cdbaz4u+ZoSAkAAAAcAD20aNGo6sI0aNGhCNGjRoQjRo0aEI0aNGhCNGjRoQo/dloUW44TsWoQ2XEOjC0qQClX5j/XSzbleHOVBccl2u+Utk5EWQrKU8nhLnfHbhWTx3Om51+KSlSSlQBB7gjWiCqlgN2FZ56WKcWeFzUrFJrduVFLNThS6bKHKCoFBPAz0qHB4Izg++rHsjxBbi24pDMuezX4QI6mainqX05yrpdThQJHAKuoD5acO5bMoFfjKjz6dGdbUQVIcaStB9+UkY1St3+GWhyFKeob8mnn9xtZdR/5VnOf+L27aqt0lBMNWdvr+wpLtGzwHWp3/ADyK0C91djr6Tm/bDNNmKQFOSWWyokg8JDzPS6Rj5gDXpD2r2drKnl2RupKpbpw462qYhSUoOcJwehXH1Uo6ry5Nhr5pPWqOzHqCEJB9Ci2tRzyAFcf56glXtG5qW44ioW/UWvKHUtfw6loSPmVpyn/PWhkcTh9mW3K9/ApL5Zmn78V+dreITPt7UbtNqbXbu870inJA+HU464QQO3AKkkayJ1teJmEEtwL+pM5I/EqMwk/xUySdKK1PlNIDbU59CR2Sl5QA/TOtxCvS8oSEoh3bXo6U8BLdRdSAPlgK19NFLxae1oXn6+Lg4djimhg214mpvU3Pv2kwUH8SYzCj/FLII18J2l3gkPqNb3kktQlg+cWHHcgfRJKUgaWSXfV7ywRJvG4XgeCF1J0j+HVrTO1OcrqDtRkq6vvdT6jn8+dAopeLR2NCPr4uDj2uKZWVtHtNSmmpF8brSqmC9+yHxzaEH5pI9aucHkFOv1vcnYGwiDZln/ak1CnOh8RypSFdh+2fJX0n+7kfTS6Ui26/VS0aZQ6hKS8rpbcbjKKFH/Fjp/z1YNr7B7iVpaS9TWqY0VlKlSXAVAAZ6gE5yPbvr5JDG0fflJ5Xt4BfY55XYwRW55+JWyvfxH39XguNRvhLahHhKYg8x/pxgguqHzyQUJQR8zqq2m65dFc6W0zqxU5K8n7zriipXcn2GVdzxzpn7N8LlFjlp+6KrJnqABWwwfKbz7jI9RH5EHV3WjZts2pDEWgUaJBQMZLbYClEDGVK7qP1PJ0g6QpoBaBvzzTxo6pqDed2Hz8JY9s/DPWaqGZ14zFUuKcKMVghT6hjsVchPt7HsR9dM/ZlpW9Z9KRTLepjMJhPfpGVLPzUo8qP1JOt5o1KqKuWc9M4cNyq09JFTjoDHjvRo0aNZlpRo0aNCEaNGjQhGjRo0IRo0aNCEaNGjQhGjRo0IRo0aNCEaNGjQhY1S/6m5/h1Aq5/WK/I6NGhCrndf/shI/8AftpUJH/WHf8AGf56NGui0P8A6yud0112r4Oma2J/7NK/Mf66NGmaW/0Jeh/9xV4Wz99P66maPujRo1zK6ZfujRo0IRo0aNCEaNGjQhGjRo0IRo0aNCEaNGjQhf/Z";
const BlockW = ({ size = 64, className = '', showGolf = false }: { size?: number; className?: string; showGolf?: boolean }) => (
  <div className={className} style={{width:size,height:size,position:'relative',display:'inline-block'}}>
    <img src={WARRIOR_LOGO} alt="Whitesboro Warriors" width={size} height={size} style={{objectFit:'contain',display:'block'}}/>
    {showGolf && (
      <div style={{position:'absolute',bottom:-4,right:-4,background:'#FFB81C',borderRadius:'50%',width:size*0.3,height:size*0.3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.18,border:'2px solid white'}}>
        ⛳
      </div>
    )}
  </div>
);

// ─── Script W'boro Logo ───────────────────────────────────────────────────────
const ScriptWboro = ({ className = '' }: { className?: string }) => (
  <div className={`font-script italic font-bold tracking-tight ${className}`} style={{fontFamily:"'Brush Script MT','Lucida Handwriting',cursive"}}>
    W'boro
  </div>
);

// ─── Theme: Whitesboro Warriors — Navy / Royal Blue / Gold ───────────────────
// Navy: #0A1628 | Royal Blue: #006BB6 | Gold: #C9A227 | White: #F0F4FF
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800;900&display=swap');
* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
body { font-family: 'Inter', system-ui, sans-serif; }
.font-bebas { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.06em; }
.font-script { font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; }
.safe-bottom { padding-bottom: max(env(safe-area-inset-bottom, 16px), 16px); }
.safe-top    { padding-top:    env(safe-area-inset-top, 0px); }
input, select, textarea { font-size: 16px !important; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.card-dark { background: rgba(255,255,255,0.06); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.10); }
.card-dark-accent { background: rgba(201,162,39,0.10); backdrop-filter: blur(12px); border: 1px solid rgba(201,162,39,0.25); }
.card-blue { background: rgba(0,107,182,0.20); backdrop-filter: blur(12px); border: 1px solid rgba(0,107,182,0.40); }
.card-red  { background: rgba(200,16,46,0.15);  backdrop-filter: blur(12px); border: 1px solid rgba(200,16,46,0.35); }
.glow-gold { box-shadow: 0 0 40px rgba(201,162,39,0.25), 0 4px 24px rgba(0,0,0,0.5); }
.glow-blue { box-shadow: 0 0 24px rgba(0,107,182,0.30), 0 2px 12px rgba(0,0,0,0.4); }
`;

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const BG = ({children}: {children: React.ReactNode}) => (
  <div className="min-h-[100dvh] relative overflow-x-hidden" style={{background:'linear-gradient(160deg,#060E1C 0%,#0A1628 45%,#0D1F38 100%)'}}>
    <style>{FONTS}</style>
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* Subtle diagonal rule grid */}
      <div className="absolute inset-0" style={{backgroundImage:'repeating-linear-gradient(135deg,rgba(0,107,182,0.04) 0px,rgba(0,107,182,0.04) 1px,transparent 1px,transparent 60px)'}}/>
      {/* Royal blue top glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-80 rounded-full opacity-20" style={{background:'radial-gradient(ellipse,#006BB6,transparent 70%)'}}/>
      {/* Gold bottom accent */}
      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full opacity-10" style={{background:'radial-gradient(circle,#C9A227,transparent 70%)'}}/>
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

const Card = ({children, className='', blue=false}: {children: React.ReactNode; className?: string; blue?: boolean}) => (
  <div className={`rounded-2xl shadow-xl ${blue ? 'card-blue' : 'card-dark'} ${className}`}>
    {children}
  </div>
);

const Btn = ({onClick, children, color='gold', className='', disabled=false, sm=false}: {
  onClick?: ()=>void; children: React.ReactNode; color?: string; className?: string; disabled?: boolean; sm?: boolean;
}) => {
  const C: Record<string,string> = {
    gold:   'text-gray-900 font-black shadow-lg hover:opacity-90 active:scale-95',
    blue:   'bg-[#006BB6] hover:bg-[#0080D6] text-white font-bold shadow-md active:scale-95 border border-blue-400/30',
    navy:   'bg-[#0A1E3D] hover:bg-[#0D2448] text-white border border-white/15 active:scale-95',
    red:    'bg-[#C8102E] hover:bg-[#E0142E] text-white border border-red-600/40 active:scale-95',
    green:  'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500/40 active:scale-95',
    ghost:  'bg-white/8 hover:bg-white/15 text-white/80 border border-white/15 active:scale-95',
    orange: 'bg-orange-700 hover:bg-orange-600 text-white border border-orange-500/40 active:scale-95',
    teal:   'bg-teal-700 hover:bg-teal-600 text-white border border-teal-500/40 active:scale-95',
  };
  const goldStyle = color === 'gold' ? {background:'linear-gradient(135deg,#B8860B,#C9A227,#E5C04A,#C9A227)',boxShadow:'0 4px 16px rgba(201,162,39,0.35)'} : {};
  return (
    <button onClick={onClick} disabled={disabled} style={goldStyle}
      className={`${sm?'px-3 py-2 text-sm min-h-[36px]':'px-5 py-3 min-h-[44px]'} rounded-xl font-semibold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${C[color]??C.ghost} ${className}`}>
      {children}
    </button>
  );
};

const Inp = ({label, value, onChange, type='text', placeholder='', className='', onKeyDown}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  type?: string; placeholder?: string; className?: string; onKeyDown?: (e:React.KeyboardEvent)=>void;
}) => (
  <div className={className}>
    {label && <label className="block text-xs font-semibold text-white/50 mb-1.5 tracking-widest uppercase">{label}</label>}
    <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className="w-full px-4 py-3 rounded-xl outline-none text-white placeholder-white/25 transition-all border border-white/10 focus:border-[#006BB6] focus:ring-2 focus:ring-[#006BB6]/30"
      style={{background:'rgba(255,255,255,0.06)'}}/>
  </div>
);

const Sel = ({label, value, onChange, options, className=''}: {
  label?: string; value: string|number; onChange: (v:string)=>void;
  options: {value: string|number; label: string}[]; className?: string;
}) => (
  <div className={className}>
    {label && <label className="block text-xs font-semibold text-white/50 mb-1.5 tracking-widest uppercase">{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      className="w-full px-4 py-3 rounded-xl outline-none text-white border border-white/10 focus:border-[#006BB6] appearance-none"
      style={{background:'rgba(10,22,40,0.95)'}}>
      {options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Badge = ({children, color='gray'}: {children: React.ReactNode; color?: string}) => {
  const C: Record<string,string> = {
    green:  'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
    blue:   'bg-blue-900/60 text-blue-300 border-blue-600/50',
    red:    'bg-red-900/60 text-red-300 border-red-700/50',
    gray:   'bg-white/8 text-white/50 border-white/10',
    orange: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
    purple: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
    gold:   'bg-yellow-900/50 text-yellow-300 border-yellow-600/50',
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

    // Best Ball - Individual player strokes based on 90% allowance
    if (m.format === 'bestball') {
      const playerStrokes = bestBallStrokes(m, rank, tee, tData.players);
      
      const pairs = getMatchupPairs(m.format);
      const matchupResults = pairs.map(([a,b]) => {
        // Get all individual player scores for each team
        const idsA = m.pairings[a] ?? [];
        const idsB = m.pairings[b] ?? [];
        
        // Calculate net scores for each player (raw - strokes)
        const netsA = idsA.map(id => {
          const raw = scores[id]?.[hole-1];
          if (raw == null) return null;
          return raw - (playerStrokes[id] || 0);
        }).filter((v): v is number => v != null);
        
        const netsB = idsB.map(id => {
          const raw = scores[id]?.[hole-1];
          if (raw == null) return null;
          return raw - (playerStrokes[id] || 0);
        }).filter((v): v is number => v != null);
        
        if (!netsA.length || !netsB.length) return {a,b,winner:null as string|null,netA:0,netB:0};
        
        // Best ball: take the lowest net score from each team
        const netA = Math.min(...netsA);
        const netB = Math.min(...netsB);
        
        return {a,b,netA,netB,winner:netA<netB?'t1p':netB<netA?'t2p':'tie'};
      });
      
      // Skins for Best Ball - use same player strokes
      const allPkKeys = Object.keys(m.pairings);
      const skinNets = allPkKeys.map(pk=>{
        const ids = m.pairings[pk] ?? [];
        const nets = ids.map(id => {
          const raw = scores[id]?.[hole-1];
          if (raw == null) return null;
          return raw - (playerStrokes[id] || 0);
        }).filter((v): v is number => v != null);
        if (!nets.length) return null;
        return {pk, ids, net: Math.min(...nets)};
      }).filter(Boolean) as {pk:string;ids:string[];net:number}[];
      
      let skinWinner=null;
      if(skinNets.length>=4){
        const best=Math.min(...skinNets.map(x=>x.net));
        const w=skinNets.filter(x=>x.net===best);
        if(w.length===1) skinWinner=w[0];
      }
      
      return {matchupResults, skinWinner, rank, hd};
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
    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10" style={{background:'rgba(6,14,28,0.85)',backdropFilter:'blur(12px)'}}>
      <div className="flex items-center gap-3 min-w-0">
        {back ? (
          <button onClick={back} className="flex items-center gap-1 text-[#C9A227] text-sm font-semibold shrink-0">
            <ChevronLeft className="w-4 h-4"/>Back
          </button>
        ) : (
          <div className="shrink-0"><BlockW size={38}/></div>
        )}
        <div className="min-w-0">
          <h1 className="font-bebas font-bold text-white text-lg leading-tight truncate">{title ?? tData?.name}</h1>
          {tee && !title && (
            <div className="text-xs text-white/35 truncate">
              {(tData?.courses??[]).find(c=>c.id===tData?.activeCourseId)?.name??''} · {tee.name} · Slope {tee.slope}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 items-center shrink-0">
        <Badge color={role==='admin'?'gold':'blue'}>{role==='admin'?'Admin':'Player'}</Badge>
        {role==='admin'&&screen!=='admin'&&(
          <button onClick={()=>setScreen('admin')} className="text-white/40 hover:text-white text-xs px-2 py-1.5 rounded-lg border border-white/10 hover:border-white/30">⚙</button>
        )}
        {screen!=='standings'&&(
          <button onClick={()=>setScreen('standings')} className="text-white/40 hover:text-white text-xs px-2 py-1.5 rounded-lg border border-white/10 hover:border-white/30">📊</button>
        )}
        {screen!=='tournament'&&(
          <button onClick={()=>setScreen('tournament')} className="text-white/40 hover:text-white text-xs px-2 py-1.5 rounded-lg border border-white/10 hover:border-white/30">📅</button>
        )}
        <button onClick={logout} className="text-white/30 hover:text-red-400 p-1.5 rounded-lg border border-white/10 hover:border-red-400/40">
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
        {/* Hero Header */}
        <div className="text-center mb-8">
          {/* Logo with gold glow ring */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{background:'radial-gradient(circle,#C9A227,transparent 70%)'}}/>
              <div className="relative z-10 rounded-full p-1" style={{background:'linear-gradient(135deg,#B8860B,#C9A227,#E5C04A,#C9A227)',boxShadow:'0 0 40px rgba(201,162,39,0.5), 0 0 80px rgba(201,162,39,0.2)'}}>
                <div className="rounded-full overflow-hidden" style={{width:110,height:110,background:'#0A1628'}}>
                  <BlockW size={110}/>
                </div>
              </div>
            </div>
          </div>

          {/* WARRIOR CUP */}
          <h1 className="font-bebas text-white mb-1" style={{fontSize:'clamp(2.8rem,10vw,4.2rem)',lineHeight:'0.9',letterSpacing:'0.08em',textShadow:'0 2px 20px rgba(0,0,0,0.5)'}}>
            WARRIOR CUP
          </h1>

          {/* Decorative script W'boro */}
          <div className="flex items-center justify-center gap-3 my-2">
            <div className="h-px flex-1 max-w-[60px]" style={{background:'linear-gradient(90deg,transparent,rgba(201,162,39,0.6))'}}/>
            <ScriptWboro className="text-[#C9A227] text-2xl"/>
            <div className="h-px flex-1 max-w-[60px]" style={{background:'linear-gradient(270deg,transparent,rgba(201,162,39,0.6))'}}/>
          </div>

          <div className="text-white/40 text-xs tracking-[0.3em] uppercase font-medium">Ryder Cup Style Golf</div>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {/* Join Form */}
          <div className="rounded-2xl p-5 space-y-4 card-dark glow-blue">
            <Inp label="Tournament ID" value={tournId} onChange={v=>setTournId(v.toUpperCase())} placeholder="e.g. ABC123" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
            <Inp label="Passcode" value={passcode} onChange={setPasscode} placeholder="Enter passcode" onKeyDown={e=>e.key==='Enter'&&joinTournament(false)}/>
            {loginErr && (
              <div className="text-sm text-red-300 font-semibold rounded-xl p-3 border border-red-700/40" style={{background:'rgba(200,16,46,0.15)'}}>
                ⚠ {loginErr}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Btn color="blue" onClick={()=>joinTournament(false)} disabled={loading||!tournId||!passcode} className="w-full flex items-center justify-center gap-2">
                <Users className="w-4 h-4"/><span>Player</span>
              </Btn>
              <Btn color="ghost" onClick={()=>joinTournament(true)} disabled={loading||!tournId||!passcode} className="w-full flex items-center justify-center gap-2">
                <Lock className="w-4 h-4"/><span>Admin</span>
              </Btn>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 px-2">
            <div className="h-px flex-1 bg-white/10"/>
            <span className="text-white/25 text-xs tracking-widest">OR</span>
            <div className="h-px flex-1 bg-white/10"/>
          </div>

          {/* Create New */}
          <Btn color="gold" onClick={createTournament} disabled={loading} className="w-full flex items-center justify-center gap-2 py-4">
            <Trophy className="w-5 h-5"/>
            <span className="font-bebas text-xl tracking-wider">Create Warrior Cup</span>
          </Btn>

          <div className="text-center text-white/20 text-xs pt-1 tracking-[0.4em] font-bebas">GO BLUE</div>
        </div>
      </div>
    </BG>
  );

  if (!tData) return (
    <BG>
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="text-center">
          <div className="mb-4 flex justify-center"><BlockW size={56}/></div>
          <div className="text-white/50 text-lg font-bebas tracking-widest">Loading…</div>
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
        <div className="rounded-2xl p-4 card-dark-accent">
          <div className="text-xs font-bold text-[#C9A227] mb-3 tracking-widest uppercase flex items-center gap-2">
            <Shield className="w-3.5 h-3.5"/>Tournament Access Codes
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {label:'Tournament ID', value:tData.id, color:'text-[#C9A227]'},
              {label:'Player Code', value:tData.passcode, color:'text-blue-300'},
              {label:'Admin Code', value:tData.adminPasscode, color:'text-orange-300'},
            ].map(({label,value,color})=>(
              <div key={label} className="rounded-xl p-3" style={{background:'rgba(0,0,0,0.3)'}}>
                <div className="text-xs text-white/40 mb-1">{label}</div>
                <div className={`font-bebas font-bold text-xl ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tournament Name */}
        <div className="rounded-2xl p-4 card-dark">
          <label className="text-xs font-semibold text-white/50 mb-2 block tracking-widest uppercase">Tournament Name</label>
          <input value={tData.name} onChange={e=>updateTournament(d=>({...d,name:e.target.value}))}
            className="w-full px-4 py-3 rounded-xl text-white font-bebas font-bold text-lg border border-white/10 focus:border-[#006BB6] outline-none"
            style={{background:'rgba(255,255,255,0.06)'}}/>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-3">
          {(['team1','team2'] as const).map(key=>(
            <div key={key} className={`rounded-2xl p-4 ${key==='team1'?'card-blue':'card-red'}`}>
              <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">{key==='team1'?'Team 1':'Team 2'}</div>
              <input value={tData.teamNames[key]} onChange={e=>updateTournament(d=>({...d,teamNames:{...d.teamNames,[key]:e.target.value}}))}
                className={`w-full px-2 py-1.5 rounded-xl font-bebas font-bold text-base border outline-none ${key==='team1'?'text-blue-300 border-blue-500/30':'text-red-300 border-red-500/30'}`}
                style={{background:'rgba(0,0,0,0.3)'}}/>
              <div className="text-xs text-white/30 mt-2">{tData.teams[key].length}/4 players</div>
            </div>
          ))}
        </div>

        {/* Players */}
        <div className="rounded-2xl p-4 card-dark">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bebas font-bold text-white text-lg">Players</h2>
            <Btn color="green" sm onClick={()=>updateTournament(d=>({...d,players:[...d.players,{id:'p'+Date.now(),name:'New Player',handicapIndex:0,stats:{matchesPlayed:0,matchesWon:0,pointsContributed:0,netUnderPar:0,skinsWon:0}}]}))}>
              <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add</span>
            </Btn>
          </div>
          <div className="space-y-2">
            {(tData.players??[]).map(p=>(
              <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-white/8 flex-wrap" style={{background:'rgba(255,255,255,0.04)'}}>
                <input value={p.name} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,name:e.target.value}:x)}))}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-white text-sm font-bold border border-white/10 outline-none" style={{background:'rgba(255,255,255,0.07)',minWidth:'80px'}}/>
                <span className="text-white/30 text-xs">HI:</span>
                <input type="number" value={p.handicapIndex} onChange={e=>updateTournament(d=>({...d,players:d.players.map(x=>x.id===p.id?{...x,handicapIndex:parseFloat(e.target.value)||0}:x)}))}
                  className="w-14 px-2 py-1.5 rounded-lg text-white text-sm text-center border border-white/10 outline-none" style={{background:'rgba(255,255,255,0.07)'}}/>
                {tee&&<span className="text-xs text-[#C9A227] font-bold">HC {courseHcp(p.handicapIndex,tee.slope)}</span>}
                <button onClick={()=>updateTournament(d=>({...d,teams:{team1:d.teams.team1.includes(p.id)?d.teams.team1.filter(x=>x!==p.id):[...d.teams.team1.filter(x=>x!==p.id),p.id],team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${tData.teams.team1.includes(p.id)?'bg-blue-600 text-white border-blue-500':'border-white/10 text-white/40 hover:border-blue-500/50'}`}>{tData.teamNames.team1}</button>
                <button onClick={()=>updateTournament(d=>({...d,teams:{team2:d.teams.team2.includes(p.id)?d.teams.team2.filter(x=>x!==p.id):[...d.teams.team2.filter(x=>x!==p.id),p.id],team1:d.teams.team1.filter(x=>x!==p.id)}}))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${tData.teams.team2.includes(p.id)?'bg-red-600 text-white border-red-500':'border-white/10 text-white/40 hover:border-red-500/50'}`}>{tData.teamNames.team2}</button>
                <button onClick={()=>updateTournament(d=>({...d,players:d.players.filter(x=>x.id!==p.id),teams:{team1:d.teams.team1.filter(x=>x!==p.id),team2:d.teams.team2.filter(x=>x!==p.id)}}))}
                  className="p-1.5 text-white/20 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            ))}
            {!tData.players?.length&&<div className="text-center text-white/30 py-6">No players yet</div>}
          </div>
        </div>

        {/* Courses */}
        <div className="rounded-2xl p-4 card-dark">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bebas font-bold text-white text-lg">Courses & Tees</h2>
            <Btn color="teal" sm onClick={()=>setScreen('courseSearch')}>
              <span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Course</span>
            </Btn>
          </div>
          <p className="text-xs text-white/30 mb-4">Default tee shown. Each match can override independently.</p>
          {(tData.courses??[]).map(c=>(
            <div key={c.id} className={`mb-3 p-3 rounded-xl border-2 transition-all ${tData.activeCourseId===c.id?'border-[#C9A227]/60':'border-white/8'}`}
              style={{background:tData.activeCourseId===c.id?'rgba(201,162,39,0.08)':'rgba(255,255,255,0.03)'}}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-bold text-white text-sm">{c.name}</div>
                  {c.location&&<div className="text-xs text-white/30">{c.location}</div>}
                </div>
                <button onClick={()=>updateTournament(d=>({...d,courses:d.courses.filter(x=>x.id!==c.id)}))}
                  className="p-1.5 text-white/20 hover:text-red-400"><Trash2 className="w-3 h-3"/></button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {c.tees.map(t=>{
                  const isActive = tData.activeCourseId===c.id && tData.activeTeeId===t.name;
                  return (
                    <button key={t.name} onClick={()=>updateTournament(d=>({...d,activeCourseId:c.id,activeTeeId:t.name}))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive?'border-[#C9A227] text-[#C9A227]':'border-white/10 text-white/50 hover:border-white/30'}`}
                      style={{background:isActive?'rgba(201,162,39,0.12)':'rgba(255,255,255,0.04)'}}>
                      {t.name} · {t.slope}/{t.rating} · P{t.par}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

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
        <div className={`p-3 rounded-xl border-2 ${isT1?'card-blue':'card-red'}`}>
          <div className={`text-xs font-bold mb-2 tracking-wider ${isT1?'text-blue-300':'text-red-300'}`}>{label}</div>
          {isSgl?(
            <select value={m.pairings[pk]?.[0]??''} onChange={e=>setMatchPairing(pk,0,e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-white text-sm border border-white/10 outline-none appearance-none" style={{background:'rgba(10,22,40,0.9)'}}>
              {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[0]}>{o.label}</option>)}
            </select>
          ):(
            <div className="space-y-1.5">
              {[0,1].map(slot=>(
                <select key={slot} value={m.pairings[pk]?.[slot]??''} onChange={e=>setMatchPairing(pk,slot,e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm border border-white/10 outline-none appearance-none" style={{background:'rgba(10,22,40,0.9)'}}>
                  {playerOpts(pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[pk]?.[slot]}>{o.label}</option>)}
                </select>
              ))}
            </div>
          )}
          {(m.pairingHcps[pk]??0)>0&&(
            <div className={`text-xs font-bold mt-1.5 ${isT1?'text-blue-300':'text-red-300'}`}>
              HC {m.pairingHcps[pk]}<span className="text-gray-500 font-normal ml-1">vs {m.pairingHcps[oppPk]??0} · diff {Math.abs((m.pairingHcps[pk]??0)-(m.pairingHcps[oppPk]??0))}</span>
            </div>
          )}
        </div>
      );

      const borderColor = m.completed ? 'border-emerald-500/50' : result ? 'border-yellow-500/40' : 'border-white/10';
      const bgStyle: React.CSSProperties = m.completed ? {background:'rgba(5,46,22,0.4)'} : result ? {background:'rgba(113,63,18,0.3)'} : {background:'rgba(255,255,255,0.05)'};

      return (
        <div className={`p-4 rounded-2xl border-2 ${borderColor}`} style={bgStyle}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bebas font-bold text-white">{fmt.name}</span>
                <Badge color={m.startHole===1?'blue':'purple'}>{m.startHole===1?'Front 9':'Back 9'}</Badge>
                <Badge color="gray">{m.holes}H</Badge>
                <Badge color="gold">{totalPts}pts</Badge>
                {m.completed&&<Badge color="green">✓ Done</Badge>}
              </div>
              {matchCourseName&&<div className="text-xs text-white/30 mb-1">{matchCourseName} · {matchTee?.name} Tees</div>}
              {result&&(
                <div className="text-sm font-bold">
                  <span className="text-blue-300">{tData.teamNames.team1}: {result.teamPoints.team1}pt</span>
                  <span className="text-white/20 mx-2">|</span>
                  <span className="text-red-300">{tData.teamNames.team2}: {result.teamPoints.team2}pt</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-end">
              {role==='admin'&&!m.completed&&(
                <button onClick={()=>toggleExpanded(m.id)} className="text-white/40 hover:text-white text-xs font-bold border border-white/10 px-2.5 py-1.5 rounded-lg">
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
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <Sel label="Course & Tee for this match" value={`${m.courseId??tData.activeCourseId}::${m.teeId??tData.activeTeeId}`}
                onChange={setMatchCourseTee} options={allTeeOpts}/>
              {isSgl ? (
                <div>
                  <div className="text-xs font-bold text-gray-600 mb-2 tracking-wider uppercase">4 Individual Matchups (1pt each)</div>
                  <div className="grid grid-cols-1 gap-2">
                    {([['t1p1','t2p1'],['t1p2','t2p2'],['t1p3','t2p3'],['t1p4','t2p4']] as const).map(([a,b],i)=>(
                      <div key={i} className="p-3 rounded-xl border border-white/10" style={{background:'rgba(255,255,255,0.04)'}}>
                        <div className="text-xs font-bold text-white/40 mb-2">Match {i+1}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs text-blue-300 font-bold mb-1">{tData.teamNames.team1}</div>
                            <select value={m.pairings[a]?.[0]??''} onChange={e=>setMatchPairing(a,0,e.target.value)}
                              className="w-full px-2 py-2 rounded-lg text-white text-xs border border-white/10 outline-none appearance-none" style={{background:'rgba(10,22,40,0.9)'}}>
                              {playerOpts(t1pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[a]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="text-xs text-red-300 font-bold mb-1">{tData.teamNames.team2}</div>
                            <select value={m.pairings[b]?.[0]??''} onChange={e=>setMatchPairing(b,0,e.target.value)}
                              className="w-full px-2 py-2 rounded-lg text-white text-xs border border-white/10 outline-none appearance-none" style={{background:'rgba(10,22,40,0.9)'}}>
                              {playerOpts(t2pool).map(o=><option key={o.value} value={o.value} disabled={usedIds.includes(o.value)&&o.value!==m.pairings[b]?.[0]}>{o.label}</option>)}
                            </select>
                          </div>
                        </div>
                        {(m.pairingHcps[a]||m.pairingHcps[b])&&(
                          <div className="text-xs text-white/30 mt-1 text-center">HC {m.pairingHcps[a]??0} vs {m.pairingHcps[b]??0}</div>
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
        <div className="p-4 rounded-2xl card-dark-accent rounded-2xl">
          <div className="font-bebas font-bold text-[#C9A227] mb-3 text-lg">New Match</div>
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
          <div className="text-sm font-bold text-[#C9A227]/80 mb-3">
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
              <div className="text-white/30 text-xs font-bold tracking-widest uppercase mb-1">Total</div>
              <div className="font-bebas font-bold text-white text-2xl">{possiblePts}</div>
              <div className="text-xs text-[#C9A227]/70">Win at {toWin.toFixed(1)}</div>
            </Card>
            <Card className="p-4 text-center card-red">
              <div className="font-bebas font-bold text-red-300 text-5xl leading-none">{t2pts}</div>
              <div className="font-bold text-red-200 text-sm mt-1 truncate">{tData.teamNames.team2}</div>
              {possiblePts>0&&<div className="text-xs text-white/30 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
            </Card>
          </div>

          {/* Matches */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bebas font-bold text-white text-xl">Match Schedule</h2>
              {role==='admin'&&<Btn color="green" sm onClick={()=>setShowMatchBuilder(true)} disabled={showMatchBuilder}><span className="flex items-center gap-1"><Plus className="w-3 h-3"/>Add Match</span></Btn>}
            </div>
            {showMatchBuilder&&role==='admin'&&<div className="mb-4"><AddMatchForm/></div>}
            {!tData.matches?.length&&!showMatchBuilder&&(
              <div className="text-center text-white/30 py-12">
                <Flag className="w-10 h-10 mx-auto mb-3 text-white/20"/>
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
                <div key={i} className="p-4 rounded-2xl card-dark">
                  <div className="text-xs font-bold text-white/30 mb-3 tracking-widest uppercase">Match {i+1}</div>
                  <PairEntry pk={a}/>
                  <div className="text-center text-white/20 text-xs my-2 font-bold">VS</div>
                  <PairEntry pk={b}/>
                </div>
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
          <div className="relative rounded-3xl overflow-hidden p-6 card-dark glow-blue border border-white/15">
            <div className="absolute inset-0 opacity-5 flex items-center justify-center">
              <div className="text-blue-600"><BlockW size={180}/></div>
            </div>
            <div className="relative flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="font-bebas font-black text-6xl text-blue-200 leading-none drop-shadow-lg">{t1pts}</div>
                <div className="font-bebas font-bold text-blue-300 text-lg mt-1">{tData.teamNames.team1}</div>
                {possiblePts>0&&<div className="text-xs text-white/30 mt-1">{Math.max(0,toWin-t1pts).toFixed(1)} to win</div>}
              </div>
              <div className="text-center px-4">
                <div className="text-white/20 font-bebas text-2xl font-bold">VS</div>
                <div className="text-[#C9A227]/70 text-xs mt-1">{possiblePts}pts total</div>
                <div className="text-white/30 text-xs">{played} played</div>
                <div className="text-white/30 text-xs">{remaining} left</div>
              </div>
              <div className="text-center flex-1">
                <div className="font-bebas font-black text-6xl text-red-200 leading-none drop-shadow-lg">{t2pts}</div>
                <div className="font-bebas font-bold text-red-300 text-lg mt-1">{tData.teamNames.team2}</div>
                {possiblePts>0&&<div className="text-xs text-white/30 mt-1">{Math.max(0,toWin-t2pts).toFixed(1)} to win</div>}
              </div>
            </div>
            <div className="relative mt-4 text-center">
              <div className="text-xs text-[#C9A227]/60 font-bold tracking-widest">WIN AT {toWin.toFixed(1)} POINTS</div>
            </div>
          </div>

          {/* Match Results */}
          {(tData.matchResults??[]).map((r,i)=>{
            const m=getMatch(r.matchId); if(!m) return null;
            const t1won = r.teamPoints.team1 > r.teamPoints.team2;
            const t2won = r.teamPoints.team2 > r.teamPoints.team1;
            return (
              <div key={i} className="p-4 rounded-2xl card-dark">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-sm">{FORMATS[m.format]?.name} · {m.startHole===1?'Front':'Back'} 9</div>
                    <div className="text-xs text-white/30">{new Date(r.completedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-3 text-center">
                    <div>
                      <div className={`font-bebas font-black text-2xl ${t1won?'text-blue-600':'text-gray-400'}`}>{r.teamPoints.team1}</div>
                      <div className="text-xs text-blue-600">{tData.teamNames.team1}</div>
                    </div>
                    <div className="text-white/20 font-bold">–</div>
                    <div>
                      <div className={`font-bebas font-black text-2xl ${t2won?'text-red-600':'text-gray-400'}`}>{r.teamPoints.team2}</div>
                      <div className="text-xs text-red-600">{tData.teamNames.team2}</div>
                    </div>
                  </div>
                </div>
              </div>
          );
          })}

          {/* MVP Race */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-yellow-600"/>
              <h2 className="font-bebas font-bold text-white text-xl">MVP Race</h2>
            </div>
            <div className="space-y-2">
              {contribs.map((p,i)=>{
                const isTop = i===0;
                const isT1 = tData.teams.team1.includes(p.id);
                return (
                  <div key={p.id} className={`p-3 rounded-xl border transition-all ${isTop?'border-yellow-500/50':'border-white/10'}`} style={{background:isTop?'rgba(201,162,39,0.12)':'rgba(255,255,255,0.04)'}}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{i===0?'🏆':i===1?'🥈':i===2?'🥉':`${i+1}`}</span>
                        <div className="min-w-0">
                          <div className={`font-bebas font-bold truncate ${isTop?'text-yellow-200':'text-white'}`}>{p.name}</div>
                          <div className={`text-xs ${isT1?'text-blue-600':'text-red-600'}`}>{isT1?tData.teamNames.team1:tData.teamNames.team2}</div>
                        </div>
                      </div>
                      <div className="flex gap-3 text-center text-xs shrink-0">
                        {([
                          ['Pts', p.pts.toFixed(1), 'text-emerald-400'],
                          ['Net↓', p.net, 'text-purple-400'],
                          ['Skins', p.skins.toFixed(1), 'text-yellow-400'],
                          ['W/P', `${p.stats?.matchesWon||0}/${p.stats?.matchesPlayed||0}`, 'text-blue-600'],
                        ] as const).map(([l,v,c])=>(
                          <div key={l}>
                            <div className="text-white/30 mb-0.5">{l}</div>
                            <div className={`font-bold ${c}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!contribs.length&&<div className="text-center text-white/30 py-8">No player data yet</div>}
            </div>
          </Card>
        </div>
      </BG>
    );
  }

  return null;
}
