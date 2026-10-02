import React from 'react';

// Public support page (the App Store requires a support link).
const CONTACT = 'support@gurubroker.app';
const QA = [
  ["I didn't get my invite or sign-in link", "Check spam or promotions. Links work once and expire after about an hour; on the sign-in page tap \"Email me a sign-in link\" for a fresh one, or ask your broker to resend your invite."],
  ['I forgot my password', 'On the sign-in page, tap "Forgot password?" and follow the email.'],
  ["I'm not getting notifications", 'In the app: My Profile → Notifications → Turn on. On iPhone, also check Settings → Notifications → Guru Broker. In a browser on iPhone, add Guru Broker to your Home Screen first (Share → Add to Home Screen).'],
  ['How do I save or share a PDF?', 'Tap Download or Export. In the iPhone app, the share sheet opens so you can save to Files, email, text or print it.'],
  ['How do I delete my account?', 'My Profile → Delete account. Records your brokerage must keep (like signed transaction documents) stay with the brokerage.'],
  ['Something looks wrong with a deal or commission', 'Contact your broker or office administrator first; they can see and fix deal details.'],
];

export default function Support() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 text-[15px] leading-relaxed text-slate-700">
        <p className="text-sm text-slate-500">Guru Broker</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Help and support</h1>
        <p className="mt-3">Email <a className="text-blue-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> and we'll get back to you within one business day. Include your brokerage name and a screenshot if you can.</p>
        <div className="mt-8 divide-y">
          {QA.map(([q, a]) => (
            <div key={q} className="py-4">
              <p className="font-semibold text-slate-900">{q}</p>
              <p className="mt-1">{a}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-8"><a className="underline" href="/privacy">Privacy policy</a></p>
      </div>
    </div>
  );
}
