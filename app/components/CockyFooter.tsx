"use client";

const socials = [
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@calco.cafe?_r=1&_t=ZP-964Tn1Jj4Vb",
    icon: "/tiktok.png",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/calco.cafe?igsh=NTc4MTIwNjQ2YQ%3D%3D&utm_source=qr",
    icon: "/ig.png",
  },
  {
    name: "X",
    href: "https://x.com/cockyapelaserco?s=21",
    icon: "/x.png",
  },
  {
    name: "Telegram",
    href: "https://t.me/cockyapes/1",
    icon: "/tg.png",
  },
  {
    name: "Discord",
    href: "https://discord.gg/a5TU4CYK9E",
    icon: "/discord.png",
  },
];

export default function CockyFooter() {
  return (
    <footer className="relative z-10 mx-auto mt-14 max-w-7xl px-5 pb-24 text-[#fff4d8]">
      <div className="rounded-[2rem] border border-[#3a2b16] bg-[#15110c]/95 p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur md:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.95fr)_minmax(520px,1.35fr)] lg:items-start">
          <div>
            <div className="flex items-center gap-4">
              <img
                src="/cblogo.png"
                alt="Cocky Portal"
                className="h-14 w-14 rounded-full border border-yellow-300/70 object-cover shadow-[0_0_18px_rgba(255,210,31,0.34),0_0_28px_rgba(53,231,224,0.14)] md:h-16 md:w-16"
              />

              <div>
                <p className="text-3xl font-black leading-none">
                  <span className="text-yellow-300">Cocky</span>
                  <span className="text-cyan-300"> Portal</span>
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">
                  XRPL Discord Verification
                </p>
              </div>
            </div>

            <p className="mt-4 max-w-md text-sm font-bold leading-relaxed text-zinc-400">
              NFT role verification, trait-gated Discord access, merch rewards,
              and XRPL-powered utility tools by CALCo.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-[180px_1fr] lg:justify-self-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                Directory
              </p>

              <div className="mt-4 grid w-[170px] gap-2">
                <a
                  href="/"
                  className="inline-flex h-10 w-full items-center rounded-xl border border-zinc-800 bg-black/35 px-4 text-xs font-black uppercase text-white transition hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-white/10"
                >
                  ✅ Verify
                </a>

                <a
                  href="/dashboard"
                  className="inline-flex h-10 w-full items-center rounded-xl border border-zinc-800 bg-black/35 px-4 text-xs font-black uppercase text-white transition hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-white/10"
                >
                  🛠️ Dashboard
                </a>

                <a
                  href="https://xrp.cafe/collection/famc"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center rounded-xl border border-emerald-300/60 bg-emerald-400/20 px-4 text-xs font-black uppercase text-emerald-200"
                >
                  🦍 Mint CAC NFTs
                </a>

                <a
                  href="https://claims.cafe"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 text-xs font-black uppercase text-yellow-300 transition hover:-translate-y-0.5 hover:bg-yellow-400/20"
                >
                  🎁 Claims.Cafe
                </a>

                <a
                  href="https://calco.cafe"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center rounded-xl border border-zinc-800 bg-black/35 px-4 text-xs font-black uppercase text-white transition hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-white/10"
                >
                  🏷️ CALCo.Cafe
                </a>
              </div>
            </div>

            <div className="grid content-start gap-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                  Socials
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  {socials.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      title={social.name}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 transition hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-white/10"
                    >
                      <img
                        src={social.icon}
                        alt={social.name}
                        className="h-5 w-5 object-contain"
                      />
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 shadow-[0_0_18px_rgba(34,211,238,0.06)]">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                  Note
                </p>

                <div className="mt-2 grid gap-2 text-[10px] font-bold leading-relaxed text-zinc-500">
                  <p>
                    Cocky Portal verifies NFT, token, and trait ownership for
                    Discord role access. Role access is based on project rules,
                    wallet contents, server configuration, and indexed metadata.
                  </p>

                  <p>
                    NFT and wallet-based utilities are community access tools,
                    not investment products, securities, financial advice, or
                    promises of profit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
            © {new Date().getFullYear()} Cocky Portal / CALCo
          </p>

          <p className="rounded-full border border-cyan-400/40 bg-black/40 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.12)]">
            ⚡ Built on the XRPL
          </p>
        </div>
      </div>
    </footer>
  );
}