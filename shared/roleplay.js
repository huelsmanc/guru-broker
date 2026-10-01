// Sales coach voice role-play: the characters agents practice on, and how calls are graded.
// Each character has a public card (what the agent sees) and a private brief (only the AI sees),
// including a hidden motivation the agent has to uncover by asking good questions.

export const DIFFICULTIES = {
  easy: { label: 'Easy', blurb: 'Friendly. Warms up quickly and gives you openings.' },
  realistic: { label: 'Realistic', blurb: 'Busy and a little guarded. Needs a real reason to keep talking.' },
  tough: { label: 'Tough', blurb: 'Short answers, pushes back hard, tries to get off the phone.' },
};

const DIFF_RULES = {
  easy: 'Be fairly friendly and patient. Raise your objections once, gently. If the agent asks one or two decent questions about your situation, share your hidden motivation. Agree to the goal if the agent asks for it reasonably.',
  realistic: 'Act like a real, busy person: polite but guarded. Raise each objection and push back once more if the answer is generic or salesy. Only share your hidden motivation if the agent asks genuine open-ended questions about your situation and listens. Agree to the goal only if the agent has earned trust and clearly asks for it.',
  tough: 'Be skeptical, impatient and hard to win. Give short answers. Push back on everything at least twice, interrupt long pitches ("look, I have to go"), mention you are talking to other agents, and try to end the call early. Only reveal your hidden motivation if the agent builds real rapport and asks sharp, specific questions. Agree to the goal only if the agent handles your objections well and asks confidently.',
};

export const SCENARIOS = [
  {
    key: 'expired',
    title: 'Expired listing',
    emoji: '⏰',
    persona: 'Linda Morales',
    voice: 'coral',
    setup: 'You are calling Linda the day after her listing expired. Her home sat on the market for 4 months at $649,000 with another agent and never sold.',
    goal: 'Book a listing appointment.',
    brief: `You are Linda Morales, 52, a homeowner. Your house was listed for 4 months at $649,000 with another agent and the listing expired yesterday. Since it expired you have gotten a dozen calls from agents and you are tired of it.
Your objections: the last agent overpriced it and then disappeared ("he never called me back"); you think you might just take it off the market; all agents promise the same thing; you're annoyed at being called.
Hidden motivation (do not volunteer it): your husband accepted a job in Charlotte and starts in March, so you really do need to sell by spring. You are worried about carrying two homes.
You answer the phone when the call starts.`,
    opener: 'Answer the phone a little warily, like "Hello?" or "This is Linda."',
  },
  {
    key: 'fsbo',
    title: 'For sale by owner',
    emoji: '🏡',
    persona: 'Mike Brennan',
    voice: 'ash',
    setup: 'Mike is selling his own home and has a "For Sale By Owner" sign in the yard. You found his number on the sign.',
    goal: 'Get a meeting to walk through the home.',
    brief: `You are Mike Brennan, 45, an engineer selling your home yourself for $529,000 to save the commission. You have had 6 showings in 3 weeks and no offers.
Your objections: "I don't need an agent, Zillow is free"; "why should I pay you $30,000 to put it on the MLS?"; "buyers' agents can still bring me buyers"; you're proud of doing it yourself.
Hidden motivation (do not volunteer it): you already had one buyer whose financing fell apart at the last minute and it cost you a month. You are nervous about the legal paperwork and about lowball offers, and your wife wants it sold before school starts.
You answer the phone when the call starts.`,
    opener: 'Answer like "Yeah, this is Mike." Sound like you suspect it is an agent.',
  },
  {
    key: 'zestimate',
    title: 'Overpriced seller',
    emoji: '📈',
    persona: 'Patricia Owens',
    voice: 'sage',
    setup: 'You are at a listing appointment with Patricia. Your CMA says $470,000. Zillow says $520,000 and she has seen it.',
    goal: 'Agree on a list price backed by the comps.',
    brief: `You are Patricia Owens, 67, a retired teacher selling the house you have lived in for 30 years. You are meeting the agent at your kitchen table to talk about listing. Zillow's Zestimate says $520,000. The agent's comparable sales say about $470,000.
Your objections: "Zillow says $520,000"; "my neighbor's house sold for more"; "we put in a new roof and kitchen"; "another agent said he could get $525,000"; "we can always come down later".
Hidden motivation (do not volunteer it): you need to net about $480,000 to buy a condo near your grandkids in Connecticut, and you are afraid of being stuck if it sits.
The agent has just sat down with you. You speak first.`,
    opener: 'Start warmly, offer coffee, then say you looked it up on Zillow and you are thinking $520,000.',
  },
  {
    key: 'wait_rates',
    title: 'Buyer waiting on rates',
    emoji: '⏳',
    persona: 'Jordan Lee',
    voice: 'verse',
    setup: 'Jordan is a pre-approved first-time buyer who went quiet. You are calling to check in.',
    goal: 'Book a time to tour homes this week.',
    brief: `You are Jordan Lee, 31, a first-time buyer who is pre-approved up to $450,000. You toured a few homes two months ago and then stopped responding.
Your objections: "we're going to wait for rates to come down"; "prices are crazy right now"; "maybe next year"; "we don't want to overpay".
Hidden motivation (do not volunteer it): your landlord told you he is selling the building and your lease ends in 3 months, and your rent would jump $400 if you renew somewhere else. You and your partner are stressed about it.
You answer the phone when the call starts.`,
    opener: 'Answer casually: "Hey, this is Jordan."',
  },
  {
    key: 'commission',
    title: 'Commission pushback',
    emoji: '💸',
    persona: 'Greg Halvorsen',
    voice: 'cedar',
    setup: 'Greg is interviewing three agents to sell his $800,000 home. He likes you but just asked you to cut your fee.',
    goal: 'Get the listing signed at your fee.',
    brief: `You are Greg Halvorsen, 58, a business owner selling an $800,000 home. You are interviewing three agents. You liked this agent's presentation, but a discount brokerage offered to list for 1%.
Your objections: "the other company will do it for 1%"; "it's a great house, it'll sell itself"; "what do you actually do for that money?"; "if you want the listing, sharpen your pencil".
Hidden motivation (do not volunteer it): years ago you sold a rental with a cheap agent who left $40,000 on the table in negotiations, and you care much more about the final price than the fee. You respect confidence and hate desperation.
You speak first: you have just finished reviewing the agent's listing proposal.`,
    opener: 'Say you liked the presentation, then ask flatly whether they can match the 1% the other company offered.',
  },
  {
    key: 'cold_call',
    title: 'Cold call, neighborhood',
    emoji: '📞',
    persona: 'Dana Whitfield',
    voice: 'shimmer',
    setup: 'A house on Dana\'s street just sold above asking. You are calling neighbors to let them know and find anyone thinking of moving.',
    goal: 'Get permission to send a home value report and follow up, or book a visit.',
    brief: `You are Dana Whitfield, 49, a homeowner. You are in the middle of making dinner when an agent you don't know calls.
Your objections: "how did you get my number?"; "we're not selling"; "just send me something"; "I'm busy right now".
Hidden motivation (do not volunteer it): your youngest just left for college and you and your husband have been quietly talking about downsizing in the next 6 to 12 months. You are curious what your house is worth but don't want to be pressured.
You answer the phone when the call starts.`,
    opener: 'Answer a little distracted: "Hello?" with some kitchen noise implied.',
  },
  {
    key: 'buyer_agreement',
    title: 'Buyer won\'t sign agreement',
    emoji: '✍️',
    persona: 'Sam Patel',
    voice: 'alloy',
    setup: 'Sam wants you to show him a house this weekend but balks when you mention signing a buyer representation agreement first.',
    goal: 'Get the buyer agreement signed before the showing.',
    brief: `You are Sam Patel, 36, looking to buy your first home around $400,000. You found a house online and want an agent to show it to you this Saturday. The agent just told you that you need to sign a buyer agreement first.
Your objections: "why do I have to sign anything just to look at a house?"; "I don't want to be locked in"; "I'll just call the listing agent then"; "who pays you?".
Hidden motivation (do not volunteer it): a friend got stuck in a 6-month agreement with an agent who ghosted her, and you are afraid of the same thing. A short agreement for just this house, or one you can cancel, would make you comfortable.
You speak first: you are replying to what the agent just said about signing.`,
    opener: 'Say, a bit surprised: "Wait, I have to sign something just to see one house?"',
  },
];

export const scenarioCard = (s) => ({ key: s.key, title: s.title, emoji: s.emoji, persona: s.persona, setup: s.setup, goal: s.goal });

/** The private instructions for the AI playing the character. */
export function personaInstructions(s, difficulty = 'realistic', agentName = '') {
  return `You are role-playing a real estate sales conversation so a real estate agent can practice. Stay fully in character as the person described below for the whole call. Never say you are an AI, never coach, never break character, even if the agent stumbles.

CHARACTER
${s.brief}

THE AGENT'S GOAL (do not tell them): ${s.goal}

DIFFICULTY: ${DIFFICULTIES[difficulty]?.label || 'Realistic'}. ${DIFF_RULES[difficulty] || DIFF_RULES.realistic}

HOW TO TALK
- This is a spoken conversation${s.key === 'zestimate' || s.key === 'commission' ? ' in person' : ' on the phone'}. Talk like a real person: short turns (usually one to three sentences), natural fillers now and then, contractions, occasional hesitation.
- React to what the agent actually says. If they ask a good question, answer it honestly in character. If they pitch or use canned lines, get more guarded.
- Do not list all your objections at once. Bring them up naturally as the conversation goes.
- Make up small realistic details if asked (street, years in the home, kids' names) and keep them consistent.
- If the agent clearly earns the goal and asks for it, agree in a natural way and help settle a time or next step, then wrap up politely.
- If the agent says "end role-play" or "stop", say a quick goodbye in character.
- Speak English with a natural American accent.${agentName ? `\n- The agent's first name is ${String(agentName).split(' ')[0]} if they introduce themselves; you don't know it before that.` : ''}

START: ${s.opener}`;
}

const FILLERS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'kind of', 'sort of', 'i mean'];

/** Numbers measured from the transcript itself (not by the AI). */
export function callStats(transcript = []) {
  const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  let agentWords = 0; let otherWords = 0; let questions = 0; let longest = 0;
  const filler = {};
  for (const line of transcript) {
    const n = words(line.text);
    if (line.role === 'agent') {
      agentWords += n;
      questions += (String(line.text).match(/\?/g) || []).length;
      longest = Math.max(longest, n);
      const low = ` ${String(line.text).toLowerCase().replace(/[^a-z' ]/g, ' ')} `;
      for (const f of FILLERS) { const c = low.split(` ${f} `).length - 1; if (c) filler[f] = (filler[f] || 0) + c; }
    } else otherWords += n;
  }
  const total = agentWords + otherWords;
  return {
    agent_words: agentWords,
    prospect_words: otherWords,
    talk_ratio: total ? Math.round((agentWords / total) * 100) : 0, // % of words that were the agent's
    questions,
    longest_turn_words: longest,
    filler_words: Object.values(filler).reduce((a, b) => a + b, 0),
    filler_detail: filler,
  };
}

export const SCORECARD_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: 'Overall 0-100' },
    outcome: { type: 'string', enum: ['goal_reached', 'partial', 'missed'] },
    headline: { type: 'string', description: 'One sentence verdict, like a coach would say it' },
    motivation_uncovered: { type: 'boolean' },
    asked_for_goal: { type: 'boolean', description: 'Did the agent clearly ask for the appointment/commitment?' },
    categories: {
      type: 'object',
      properties: {
        rapport: { type: 'number', description: '1-10' },
        discovery: { type: 'number', description: '1-10: open questions, listening, uncovering motivation' },
        objection_handling: { type: 'number', description: '1-10' },
        value: { type: 'number', description: '1-10: showed why they are worth it, specific not generic' },
        closing: { type: 'number', description: '1-10: asked for the next step with confidence' },
      },
      required: ['rapport', 'discovery', 'objection_handling', 'value', 'closing'],
    },
    strengths: { type: 'array', items: { type: 'string' }, description: '2-3 specific things done well' },
    moments: {
      type: 'array',
      description: '2-4 key moments to improve, quoting the agent',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, issue: { type: 'string' }, try_instead: { type: 'string', description: 'word-for-word better line' } },
        required: ['quote', 'issue', 'try_instead'],
      },
    },
    next_drill: { type: 'string', description: 'What to practice next time' },
  },
  required: ['score', 'outcome', 'headline', 'motivation_uncovered', 'asked_for_goal', 'categories', 'strengths', 'moments', 'next_drill'],
};

export function scoringPrompt(s, difficulty, transcript, stats) {
  const lines = transcript.map((l) => `${l.role === 'agent' ? 'AGENT' : s.persona.toUpperCase()}: ${l.text}`).join('\n');
  return `Grade this real estate sales practice call like a demanding but encouraging top-producing sales coach.

Scenario: ${s.title}. ${s.setup}
Agent's goal: ${s.goal}
Difficulty: ${DIFFICULTIES[difficulty]?.label || difficulty}
The prospect's hidden motivation (the agent was not told): ${(s.brief.match(/Hidden motivation[^:]*:\s*([\s\S]*?)(\n|$)/) || [])[1] || 'n/a'}

Measured: the agent spoke ${stats.talk_ratio}% of the words, asked ${stats.questions} questions, used ${stats.filler_words} filler words, longest monologue ${stats.longest_turn_words} words.

Transcript:
${lines || '(no conversation)'}

Be specific and quote the agent. Score fairly for the difficulty: reaching the goal on Tough deserves a high score. If the call was very short or the agent barely spoke, score low and say so. "try_instead" lines must be natural, word-for-word things the agent could say.`;
}
