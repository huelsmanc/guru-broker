import React from 'react';

// Public privacy policy (linked from the App Store listing and the sign-in page).
// Plain language; review with your attorney before relying on it.
const UPDATED = 'October 2, 2026';
const CONTACT = 'support@gurubroker.app';

function H({ children }) { return <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">{children}</h2>; }

export default function Privacy() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-10">
      <article className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 text-[15px] leading-relaxed text-slate-700">
        <p className="text-sm text-slate-500">Guru Broker</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Privacy policy</h1>
        <p className="text-sm text-slate-500 mt-1">Last updated {UPDATED}</p>

        <p className="mt-6">Guru Broker is software real estate brokerages use to run their business: deals, documents, e-signatures, commissions, messaging, marketing and training. This policy explains what we collect, why, and the choices you have. It covers the website at gurubroker.app and the Guru Broker iPhone app.</p>

        <H>Who controls your information</H>
        <p>Your brokerage invites you and decides who on its team can see what. For information about your brokerage's clients and deals, your brokerage is responsible for it and we process it on their behalf. For questions about your brokerage's use of your information, contact your broker first; you can always contact us too.</p>

        <H>What we collect</H>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>Account details:</b> your name, email, phone, photo, title, license number, role and brokerage.</li>
          <li><b>Work you put in:</b> deals, contacts, documents and files, checklists, signatures, messages and call records, marketing designs, mailing lists and notes.</li>
          <li><b>Payment and payout details:</b> card payments for print orders and store purchases are handled by Stripe or the brokerage's store; we never see or store full card numbers. Commission payouts are processed by our payments partner; we don't store full bank account numbers.</li>
          <li><b>Device and usage information:</b> sign-in times, browser or device type, notification tokens so we can send you alerts, and error reports when something breaks, so we can fix it.</li>
          <li><b>Camera, microphone and photos (iPhone app):</b> only when you choose to take or pick a photo, upload a document, or join a call. We don't access them otherwise.</li>
        </ul>

        <H>How we use it</H>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To run the service for you and your brokerage: show your deals, deliver messages and notifications, send documents for signature, calculate and pay commissions, and print or mail what you order.</li>
          <li>To keep accounts secure (sign-in, two-step sign-in, fraud prevention) and to find and fix problems.</li>
          <li>To send emails you need: invitations, sign-in links, signature requests, receipts and notifications. You can turn notification types off in My Profile.</li>
        </ul>
        <p className="mt-2">We don't sell your information, and we don't use it for advertising.</p>

        <H>AI features</H>
        <p>Some features use artificial intelligence (for example, writing marketing copy, reading a contract you upload, or coaching practice). When you use them, the relevant text or document is sent to our AI provider to produce the result. It isn't used to train their models under our agreement with them.</p>

        <H>Who we share it with</H>
        <p>Only service providers that help us run Guru Broker, under contracts that limit their use of your information: hosting and database (Vercel, Supabase), email (Resend), payments and payouts (Stripe and our payouts partner), printing and mailing (Lob, Gelato), the brokerage's gear store (Shopify), AI processing, maps and property photos, and the MLS data feeds your brokerage connects. We may also share information if the law requires it, or to protect people's safety or our rights.</p>

        <H>How long we keep it</H>
        <p>We keep your information while your account is active and as long as your brokerage needs it for its records (real estate transaction records often must be kept for several years). Error reports are deleted after they're resolved, within 90 days.</p>

        <H>Your choices</H>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Update your profile at any time in My Profile.</li>
          <li>Delete your account in My Profile → Delete account. Records your brokerage must keep (such as signed transaction documents) stay with the brokerage.</li>
          <li>Turn notifications off in My Profile or your phone's settings.</li>
          <li>Ask us for a copy of your information, or to correct or delete it, by emailing <a className="text-blue-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</li>
        </ul>

        <H>Security</H>
        <p>Information is encrypted in transit and at rest, access is limited by role, and sensitive actions can require two-step sign-in. No system is perfect, so please use a strong password and tell us right away if you suspect a problem.</p>

        <H>Children</H>
        <p>Guru Broker is for real estate professionals and isn't meant for anyone under 18.</p>

        <H>Changes</H>
        <p>If we change this policy in a meaningful way, we'll update the date above and let you know in the app or by email.</p>

        <H>Contact</H>
        <p>Questions or requests: <a className="text-blue-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </article>
    </div>
  );
}
