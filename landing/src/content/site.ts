import type { CategoryId } from "@shortlark/shared/categories";

/* ── Use cases ──────────────────────────────────────────────────────────── */

export interface UseCase {
  slug: string;
  title: string;
  tagline: string;
  intro: string;
  engines: CategoryId[];
  pains: { title: string; body: string }[];
  steps: { title: string; body: string }[];
  points: string[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "streamers",
    title: "Streamers and clippers",
    tagline: "Marathon VODs into daily Shorts",
    intro:
      "Drop a six-hour stream and get a ranked shortlist of the plays, fails and reactions worth posting while the stream is still trending.",
    engines: ["gaming", "sports", "other"],
    pains: [
      { title: "Hours of scrubbing", body: "Finding the five best minutes of a six-hour VOD means watching most of it again, or guessing from chat." },
      { title: "The moment goes cold", body: "Clips posted the next day miss the wave. The first good clip of a big moment gets the views." },
      { title: "Captions for every network", body: "The same clip needs a different hook and caption for Shorts, Reels and Facebook." },
    ],
    steps: [
      { title: "Pick Gaming and paste the VOD", body: "The gaming engine reads the stream through the streamer's reactions: the shout, the laugh, the panic narration." },
      { title: "Get a ranked shortlist", body: "Clutch plays, wins, fails and chat moments, each with a score, a label and a plain-English reason." },
      { title: "Trim to the frame", body: "Nudge in and out points, keep the build-up and the reaction, export vertical 9:16 for video files." },
      { title: "Post while it's trending", body: "Publish to YouTube Shorts, Instagram Reels and Facebook now, or schedule the next 15-minute slot." },
    ],
    points: ["Main events focus for gameplay", "Clip what chat reacted to", "Post the best moment first"],
  },
  {
    slug: "podcasters",
    title: "Podcasters",
    tagline: "Episodes into quotable Reels",
    intro: "Find the lines people will repeat. Every pick comes with a hook, a caption and the reason it was chosen.",
    engines: ["podcast", "other"],
    pains: [
      { title: "Great lines get buried", body: "The best minute of a ninety-minute episode is easy to miss on a re-listen at double speed." },
      { title: "Clips that need context", body: "A clip that starts on the host's question loses viewers before the answer lands." },
      { title: "Writing posts takes longer than cutting", body: "Every clip needs a hook and a caption that make a stranger press play." },
    ],
    steps: [
      { title: "Pick Podcasts and paste the episode", body: "Video podcasts from YouTube or Vimeo, or a direct file link." },
      { title: "Get hot takes, stories and advice", body: "The podcast engine starts each clip on the claim, not the question, and ends after the explanation lands." },
      { title: "Keep the quotable ones", body: "Scores for hook, stand-alone clarity, payoff and quotability show which clips will travel." },
      { title: "Post with a caption per network", body: "Drafted from what was actually said, ready to edit before it goes out." },
    ],
    points: ["Insights and funniest focuses", "Hooks taken from the transcript", "Captions ready for each network"],
  },
  {
    slug: "agencies",
    title: "Agencies and editors",
    tagline: "Many channels, one queue",
    intro: "Connect up to 40 accounts, schedule a week of posts in an afternoon and see what performed across every channel.",
    engines: ["podcast", "gaming", "sports", "movies", "other"],
    pains: [
      { title: "Every client is a different format", body: "A podcast, a stream and a sports show need different ideas of what a highlight is." },
      { title: "Posting across many accounts", body: "Logging in and out of every client's channels eats the afternoon." },
      { title: "Reporting", body: "Clients want to know which clips worked, per network." },
    ],
    steps: [
      { title: "One category per client format", body: "Each import runs the engine that fits it, so a podcast and a match are clipped differently." },
      { title: "Shortlist in minutes", body: "Ranked moments with timecodes for every video, so editors spend time cutting, not searching." },
      { title: "Schedule the week", body: "Queue posts for every connected account; due posts go out every 15 minutes." },
      { title: "Report from the source", body: "Views, likes, comments and shares per post, pulled from each network's API." },
    ],
    points: ["Bulk edit and CSV export", "Scheduling every 15 minutes", "Analytics per platform"],
  },
];

/* ── Integrations ───────────────────────────────────────────────────────── */

export const IMPORT_SOURCES = [
  { name: "YouTube", body: "Public and unlisted videos and VODs. Shortlark reads the title, length and captions; it never downloads the video." },
  { name: "Vimeo", body: "Public videos, and private ones shared with their link. Text tracks are used as captions when present." },
  { name: "Video files", body: "Direct links to .mp4 and .webm files. These can be cut and downloaded as MP4, original shape or vertical 9:16." },
];

export const DESTINATIONS = [
  {
    platform: "youtube" as const,
    name: "YouTube Shorts",
    body: "Upload clips to your channel with a title, description and visibility. Vertical videos under three minutes become Shorts. View counts are read back for analytics.",
    access: "Signs in with Google and asks for permission to manage your YouTube account (upload and read statistics).",
  },
  {
    platform: "instagram" as const,
    name: "Instagram Reels",
    body: "Publish Reels with a caption to an Instagram Business or Creator account. Likes, comments and plays are read back where Instagram allows.",
    access: "Connects through Facebook Login; the Instagram account must be linked to a Facebook Page you manage.",
  },
  {
    platform: "facebook" as const,
    name: "Facebook Pages",
    body: "Post videos to the Pages you manage, now or on a schedule, and read their engagement.",
    access: "Connects through Facebook Login and lists the Pages you choose to share.",
  },
];

/* ── Changelog (real releases only) ─────────────────────────────────────── */

export const CHANGELOG: { date: string; title: string; items: string[] }[] = [
  {
    date: "November 2026",
    title: "Category engines",
    items: [
      "Pick Podcasts, Gaming, Movies, Sports or Other when you import; each runs its own AI engine and model.",
      "Every clip now carries a moment label such as Goal event, Clutch play or Hot take.",
      "The video page shows which engine found its moments.",
    ],
  },
  {
    date: "November 2026",
    title: "New look and admin tools",
    items: [
      "A redesigned site and app with a white theme and orange accents.",
      "A separate admin console with authenticator sign-in for the Shortlark team.",
      "Accounts can be suspended and credits granted with a note you can see in Billing.",
    ],
  },
  {
    date: "November 2026",
    title: "Accounts and settings",
    items: [
      "Reset a forgotten password by email.",
      "Change your name, email and password, or delete your account, from Settings.",
      "A Help page and a contact form.",
    ],
  },
  {
    date: "November 2026",
    title: "Faster, more reliable analysis",
    items: [
      "The AI now runs on Google Gemini with structured output, so moments come back in a consistent shape.",
      "Failed analyses refund their credits automatically and explain what went wrong.",
    ],
  },
];

/* ── Guides ─────────────────────────────────────────────────────────────── */

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  sections: { heading: string; paragraphs: string[] }[];
}

export const GUIDES: Guide[] = [
  {
    slug: "find-the-best-moments-in-a-long-stream",
    title: "How to find the best moments in a long stream",
    summary: "What makes a moment clip-worthy, and how to spot one without watching six hours again.",
    minutes: 5,
    sections: [
      {
        heading: "Start from the reaction, not the action",
        paragraphs: [
          "On a stream, the best moments are rarely silent. The streamer shouts, laughs, goes quiet, or starts narrating fast. Those changes in voice are the easiest markers to find, and they are what viewers react to as well.",
          "Begin each clip a few seconds before the build-up, include the moment itself, and end once the reaction has landed. Cutting off the reaction is the most common way a good clip falls flat.",
        ],
      },
      {
        heading: "Ask four questions of every candidate",
        paragraphs: [
          "Does the first three seconds stop the scroll? Would a stranger understand it with no context? Is there a payoff: a punchline, a result, a lesson? Is there one line people would repeat in the comments?",
          "A moment that fails the second question usually needs a different start point rather than a different moment. Move the in point to the line that sets it up, and try again.",
        ],
      },
      {
        heading: "Post the best one first",
        paragraphs: [
          "When a stream is trending, the first good clip of a big moment collects most of the views. Rank your shortlist and publish the strongest clip before polishing the rest.",
        ],
      },
    ],
  },
  {
    slug: "clipping-with-permission",
    title: "Clipping with permission: a short etiquette guide",
    summary: "How clipping programs work, how to credit creators, and which content to leave alone.",
    minutes: 4,
    sections: [
      {
        heading: "Clip what you own, or what you are invited to clip",
        paragraphs: [
          "Your own streams and podcasts are yours to clip. Many creators also welcome clippers: some run formal clipping programs, others say so in their channel rules or community. When in doubt, ask.",
          "Sports broadcasts and films are tightly protected by their rights holders. Clip them only when you hold the rights or have explicit permission, and expect the networks to remove clips that don't.",
        ],
      },
      {
        heading: "Credit clearly",
        paragraphs: [
          "Name the creator in the caption and link the original when the network allows it. Shortlark posts YouTube and Vimeo clips with a link that opens the original at the right second, which sends viewers back to the source.",
        ],
      },
      {
        heading: "Follow each network's rules",
        paragraphs: [
          "YouTube, Instagram and Facebook each have rules on reused content, impersonation and spam. Posting the same clip many times across accounts, or with misleading captions, risks strikes on your accounts.",
        ],
      },
    ],
  },
  {
    slug: "hooks-and-captions-that-hold-viewers",
    title: "Hooks and captions that hold viewers",
    summary: "The first words of a clip and the line above it decide whether anyone stays. A few patterns that work.",
    minutes: 4,
    sections: [
      {
        heading: "Open on the strongest line",
        paragraphs: [
          "Viewers decide in the first seconds. Start on a bold claim, a surprising number, a question or the moment of conflict, not on \"so\" or \"anyway\". Trimming one sentence off the start often doubles how long people watch.",
        ],
      },
      {
        heading: "Make the caption promise what the clip delivers",
        paragraphs: [
          "A caption that oversells gets skipped and reported. Describe the moment in plain words and add one reason to watch: who, what happened, and why it matters.",
          "Write it for the network. A Short can lean on the title; a Reel caption is read under the video; a Facebook post benefits from a sentence of context.",
        ],
      },
      {
        heading: "Let the transcript do the work",
        paragraphs: [
          "The best hooks are usually already in the transcript. Shortlark drafts the hook from the clip's actual opening words and writes captions from what was said, so you edit rather than start from a blank box.",
        ],
      },
    ],
  },
];

/* ── Demo (illustrative example results) ────────────────────────────────── */

export interface DemoMoment {
  start: string;
  end: string;
  label: string;
  title: string;
  score: number;
  reason: string;
}

export const DEMO: Record<"sports" | "gaming" | "podcast", { video: string; length: string; moments: DemoMoment[] }> = {
  sports: {
    video: "Cup final watch-along stream",
    length: "2:14:08",
    moments: [
      { start: "1:19:40", end: "1:20:15", label: "Goal event", title: "Top-corner free kick levels it at 1-1", score: 94, reason: "The commentary peaks and the score is named, so the clip makes sense without the build-up." },
      { start: "1:58:55", end: "1:59:45", label: "Match winner", title: "Stoppage-time counterattack wins it", score: 91, reason: "A complete story in 50 seconds: the break, the finish and the crowd." },
      { start: "1:03:12", end: "1:03:48", label: "Big save", title: "Goal-line double save", score: 86, reason: "Two saves in five seconds with a disbelieving call from the host." },
    ],
  },
  gaming: {
    video: "Ranked grind, day 3",
    length: "6:12:44",
    moments: [
      { start: "3:41:07", end: "3:41:48", label: "Clutch play", title: "One shot, zero hesitation", score: 94, reason: "A sudden shout marks the play; the clip keeps the build-up and the reaction." },
      { start: "1:12:30", end: "1:13:02", label: "Chat reaction", title: "Chat called it first", score: 88, reason: "The streamer reads chat's prediction aloud seconds before it happens." },
      { start: "5:02:11", end: "5:02:40", label: "Fail", title: "The jump that should have worked", score: 81, reason: "A fail with a laugh that lands; strong hook in the first second." },
    ],
  },
  podcast: {
    video: "Episode 112: Building in public",
    length: "1:32:20",
    moments: [
      { start: "0:41:05", end: "0:42:02", label: "Hot take", title: "Why most launches should be quiet", score: 92, reason: "Opens on a contrarian claim and pays it off with a concrete example." },
      { start: "1:05:48", end: "1:06:50", label: "Story", title: "The email that saved the company", score: 89, reason: "A complete story with a twist; no setup needed." },
      { start: "0:18:20", end: "0:19:05", label: "Advice", title: "The one metric worth watching weekly", score: 84, reason: "A clear, repeatable piece of advice in under a minute." },
    ],
  },
};
