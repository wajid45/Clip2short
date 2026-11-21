import { TRIAL } from "@shortlark/shared/plans";
import type { QA } from "../site/kit";

/** Every question on the site, grouped. The home page shows the first few of "Getting started". */
export const FAQ_GROUPS: { id: string; title: string; items: QA[] }[] = [
  {
    id: "start",
    title: "Getting started",
    items: [
      {
        q: "Who is Clip2Short for?",
        a: "Clippers, streamers and editors who turn long streams, podcasts and videos into Shorts and Reels. Paste a VOD and get a ranked list of moments with timecodes, hooks and captions in minutes instead of hours of scrubbing.",
      },
      {
        q: "Which sources can I import?",
        a: "Public or unlisted YouTube videos and VODs, Vimeo videos (including private ones shared with their link), and direct links to .mp4 or .webm files.",
      },
      {
        q: "Why do I pick a category?",
        a: "Each category runs its own AI engine: a goal, a clutch play and a quotable line are different kinds of moment. The engine for Podcasts, Gaming, Movies, Sports or Other knows what a highlight looks like in that kind of video, how long the clip should run, and labels each moment for you.",
      },
      {
        q: "Do you cut the video for me?",
        a: "For direct video files, yes: download any clip as an MP4, in its original shape or cropped to vertical 9:16. YouTube and Vimeo don't allow their videos to be downloaded, so for those Clip2Short gives you exact in and out points to cut in your editor, and posts with a link that opens the original at the right second.",
      },
      {
        q: "What if a video has no captions?",
        a: "Clip2Short tries creator captions, auto-captions, translations and Vimeo text tracks, then an AI fetch agent. If none work, paste a transcript. Every clip shows whether its timing is exact or estimated.",
      },
    ],
  },
  {
    id: "billing",
    title: "Credits and billing",
    items: [
      {
        q: "How do credits work?",
        a: `1 credit = 1 minute of video the AI analyses, so a 2-hour stream uses 120 credits. Running it again on the same video costs a quarter of that, and failed analyses are refunded automatically. Posting never costs credits. New accounts get ${TRIAL.credits} free credits for ${TRIAL.days} days, no card needed.`,
      },
      {
        q: "Do unused plan credits roll over?",
        a: "Plan credits refresh at the start of each billing period, so use them within the period. Credits granted by our team show their own expiry, or none.",
      },
      {
        q: "Can I change or cancel my plan?",
        a: "Yes, anytime from Billing in the app. A cancellation keeps your plan until the end of the period you paid for.",
      },
      {
        q: "What happens if an analysis fails?",
        a: "The credits it used come straight back to your balance, and the video page explains what went wrong (usually missing captions) and how to fix it.",
      },
      {
        q: "Is there a refund policy?",
        a: (
          <>
            Yes. The <a className="text-signal underline underline-offset-4" href="/refunds">refund policy</a> explains cancellations, failed analyses and refunds in plain language.
          </>
        ),
      },
    ],
  },
  {
    id: "clipping",
    title: "Clipping and AI",
    items: [
      {
        q: "How does the AI score a moment?",
        a: "Every moment gets a 0 to 100 score built from four parts: the hook in the first seconds, whether it stands alone without context, the payoff, and how quotable it is. Each pick comes with a plain-English reason, so you can disagree with it.",
      },
      {
        q: "Can I change where a clip starts and ends?",
        a: "Yes. The editor moves in and out points to the frame, and you can preview the cut before exporting or posting.",
      },
      {
        q: "Does it write the caption and hook?",
        a: "Yes, for each network. They are drafted from what was actually said in the clip, and you can edit them before posting.",
      },
      {
        q: "Can I clip other streamers' videos?",
        a: "Only when you have permission. Many streamers run clipping programs or welcome clippers in their community rules. Clip your own content or creators who have authorised it, credit them, and follow each platform's rules. Sports broadcasts and films are especially tightly protected.",
      },
    ],
  },
  {
    id: "posting",
    title: "Posting",
    items: [
      {
        q: "Where can I post?",
        a: "YouTube Shorts, Instagram Reels and Facebook Pages. Instagram needs a Business or Creator account linked to a Facebook Page.",
      },
      {
        q: "Can I schedule posts?",
        a: "Yes. Post now or pick a time; scheduled posts go out in the next 15-minute slot. Failed posts stay in the queue with a retry button and the reason.",
      },
      {
        q: "Do I see how posts perform?",
        a: "Views, likes, comments and shares are pulled from each network's own API, per network and per post.",
      },
    ],
  },
  {
    id: "account",
    title: "Account and privacy",
    items: [
      {
        q: "Is my data safe?",
        a: (
          <>
            Passwords are hashed, social tokens are encrypted at rest, and payments are handled by Stripe. The <a className="text-signal underline underline-offset-4" href="/security">security page</a> has the details.
          </>
        ),
      },
      {
        q: "Can I delete my account?",
        a: "Yes, from Settings in the app. It removes your videos, clips, connected accounts and posts history, and cancels any subscription.",
      },
    ],
  },
];

export const ALL_FAQ: QA[] = FAQ_GROUPS.flatMap((g) => g.items);

/** Plain-text answers for FAQPage structured data. */
export function faqText(a: QA["a"]): string {
  return typeof a === "string" ? a : "";
}
