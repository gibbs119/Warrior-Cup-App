// app/api/course-search/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) return NextResponse.json({ error: 'No query provided' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Golf course scorecard data for: "${query}". Return ONLY a JSON array, no other text:
[{"name":"Course Name","location":"City, ST","tees":[{"name":"Blue","slope":133,"rating":72.3,"par":72,"holes":[{"h":1,"par":4,"yards":400,"rank":5},{"h":2,"par":3,"yards":180,"rank":15},{"h":3,"par":4,"yards":360,"rank":9},{"h":4,"par":5,"yards":520,"rank":1},{"h":5,"par":4,"yards":380,"rank":11},{"h":6,"par":4,"yards":350,"rank":13},{"h":7,"par":3,"yards":160,"rank":17},{"h":8,"par":5,"yards":510,"rank":3},{"h":9,"par":4,"yards":390,"rank":7},{"h":10,"par":4,"yards":370,"rank":18},{"h":11,"par":4,"yards":430,"rank":2},{"h":12,"par":3,"yards":200,"rank":14},{"h":13,"par":4,"yards":390,"rank":16},{"h":14,"par":5,"yards":500,"rank":12},{"h":15,"par":4,"yards":370,"rank":8},{"h":16,"par":3,"yards":190,"rank":10},{"h":17,"par":5,"yards":520,"rank":6},{"h":18,"par":4,"yards":420,"rank":4}]}]}]
Include all tee boxes. rank=handicap difficulty 1=hardest. Use 0 if unknown. JSON array only.`
      }]
    })
  });

  const data = await resp.json();
  if (!resp.ok) return NextResponse.json({ error: data?.error?.message ?? 'Claude API error' }, { status: 500 });

  const allText = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

  // Parse JSON from response
  const clean = allText.replace(/```json|```/g, '').trim();
  let courses = null;
  try { courses = JSON.parse(clean); } catch {
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s !== -1 && e > s) try { courses = JSON.parse(clean.slice(s, e + 1)); } catch {}
  }

  if (!courses?.length) return NextResponse.json({ error: 'No course data found' }, { status: 404 });
  return NextResponse.json({ courses });
}
