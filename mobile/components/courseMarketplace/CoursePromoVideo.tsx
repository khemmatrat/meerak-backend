import React from "react";

function youtubeEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = u.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return `https://www.youtube.com/embed/${parts[embedIdx + 1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export default function CoursePromoVideo({ url, title }: { url: string; title: string }) {
  if (!url?.trim()) return null;
  const embed = youtubeEmbedUrl(url);
  return (
    <section className="luxury-card rounded-3xl overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <h2 className="text-lg font-bold text-slate-100">วิดีโอแนะนำคอร์ส</h2>
      </div>
      <div className="aspect-video bg-black">
        {embed ? (
          <iframe
            title={`${title} promo`}
            src={embed}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={url} controls className="w-full h-full object-contain" playsInline />
        )}
      </div>
    </section>
  );
}
