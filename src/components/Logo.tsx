/** The Guionista mark: a screenplay page (scene heading, action, a centred cue and its dialogue) on an amber tile. Pure SVG, no image file. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Guionista" className={className}>
      <defs>
        <linearGradient id="gl-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3c565" /><stop offset="1" stopColor="#d99a2b" /></linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#gl-tile)" />
      <path d="M13 8h16l8 8v24a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" fill="#15171c" />
      <path d="M29 8v6a2 2 0 0 0 2 2h6Z" fill="#3a3d45" />
      <g fill="#f3c565">
        <rect x="15" y="19" width="14" height="2" rx="1" />
        <rect x="15" y="24" width="18" height="2" rx="1" opacity=".55" />
        <rect x="21" y="30" width="8" height="2" rx="1" />
        <rect x="18" y="34" width="14" height="2" rx="1" opacity=".55" />
      </g>
    </svg>
  );
}

export function Logo({ size = 40, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark size={size} />
      <span className={`font-script font-bold uppercase leading-none tracking-[0.18em] ${tone === "light" ? "text-white" : "text-[#14161b]"}`} style={{ fontSize: size * 0.5 }}>Guionista</span>
    </span>
  );
}
