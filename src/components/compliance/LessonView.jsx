// One lesson of a class: text (paragraphs, "- " bullets, a highlighted "Key takeaway:"), an optional
// video (YouTube and Vimeo play here; other links open) and an optional handout.
import React from 'react';
import { FileText, PlayCircle, Lightbulb } from 'lucide-react';

export function videoEmbed(url) {
  const u = String(url || '');
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function Body({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    if (bullet) { (list ||= []).push(bullet[1]); continue; }
    if (list) { blocks.push({ list }); list = null; }
    if (line) blocks.push({ p: line });
  }
  if (list) blocks.push({ list });
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
      {blocks.map((b, i) => {
        if (b.list) return <ul key={i} className="list-disc pl-5 space-y-1.5">{b.list.map((x, j) => <li key={j}>{x}</li>)}</ul>;
        const take = b.p.match(/^key takeaway:\s*(.*)/i);
        if (take) return (
          <div key={i} className="flex gap-2 rounded-xl bg-primary/10 p-3 text-sm">
            <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" /><p><span className="font-semibold">Key takeaway: </span>{take[1]}</p>
          </div>
        );
        return <p key={i}>{b.p}</p>;
      })}
    </div>
  );
}

export default function LessonView({ lesson }) {
  const embed = videoEmbed(lesson.video_url);
  return (
    <div className="space-y-4">
      {embed && (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe src={embed} title={lesson.title || 'Video'} className="h-full w-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      {lesson.video_url && !embed && (
        <a href={lesson.video_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border p-3 text-sm text-primary"><PlayCircle className="w-4 h-4" /> Watch the video</a>
      )}
      <Body text={lesson.body} />
      {lesson.file_url && (
        <a href={lesson.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border p-3 text-sm text-primary"><FileText className="w-4 h-4" /> {lesson.file_name || 'Open the handout'}</a>
      )}
    </div>
  );
}
