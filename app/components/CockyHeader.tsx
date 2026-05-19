"use client";

import { useEffect, useRef, useState } from "react";

type HeaderMode = "verify" | "dashboard" | "project" | "super-admin";
type WalletProvider = "xaman" | "joey" | "";

type NavItem = {
  label: string;
  href: string;
  external?: boolean;
  highlight?: boolean;
};

type CockyHeaderProps = {
  mode?: HeaderMode;
  discordName?: string;
  showDiscordLogin?: boolean;
};

const navItems: NavItem[] = [
  { label: "Verify", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Claims.Cafe", href: "https://claims.cafe", external: true },
  { label: "CALCo.Cafe", href: "https://calco.cafe", external: true },
  {
    label: "Mint CAC NFTs",
    href: "https://xrp.cafe/collection/famc",
    external: true,
    highlight: true,
  },
];

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

export default function CockyHeader({
  mode = "verify",
  discordName = "",
  showDiscordLogin = true,
}: CockyHeaderProps) {
  const menuButtonRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const xamanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");

  const [wallet, setWallet] = useState("");
  const [walletProvider, setWalletProvider] = useState<WalletProvider>("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletMode, setWalletMode] = useState<WalletProvider>("");
  const [walletQr, setWalletQr] = useState("");
  const [walletDeepLink, setWalletDeepLink] = useState("");

  useEffect(() => {
    setCurrentPath(window.location.pathname);

    const savedWallet =
      localStorage.getItem("cocky_connected_wallet") ||
      localStorage.getItem("cocky_verified_wallet") ||
      "";

    const savedProvider =
      (localStorage.getItem("cocky_connected_wallet_provider") as WalletProvider) ||
      (localStorage.getItem("cocky_verified_provider") as WalletProvider) ||
      "";

    if (savedWallet) {
      setWallet(savedWallet);
      setWalletProvider(savedProvider || "xaman");
    }

    function handleOutsideMenuClick(event: MouseEvent) {
      const target = event.target as Node;

      if (menuButtonRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;

      setMenuOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideMenuClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideMenuClick);

      if (xamanPollRef.current) {
        clearInterval(xamanPollRef.current);
        xamanPollRef.current = null;
      }
    };
  }, []);

  function isCurrentPage(item: NavItem) {
    if (item.external) return false;
    if (item.href === "/") return currentPath === "/";
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  }

  function discordLoginHref() {
  if (mode === "super-admin") {
    return "/api/discord/login?return_to=/super-admin";
  }

  if (mode === "dashboard") {
    return "/api/discord/login?return_to=/dashboard";
  }

  if (mode === "project") {
    return "/api/discord/login?return_to=/dashboard";
  }

  return "/api/discord/login?return_to=/";
}

  function shortWallet(address: string) {
    if (!address) return "";
    return `${address.slice(0, 5)}..${address.slice(-4)}`;
  }

  function saveWallet(address: string, provider: WalletProvider) {
    setWallet(address);
    setWalletProvider(provider);

    localStorage.setItem("cocky_connected_wallet", address);
    localStorage.setItem("cocky_connected_wallet_provider", provider);

    localStorage.setItem("cocky_verified_wallet", address);
    localStorage.setItem("cocky_verified_provider", provider);
  }

  function disconnectWallet() {
    if (xamanPollRef.current) {
      clearInterval(xamanPollRef.current);
      xamanPollRef.current = null;
    }

    setWallet("");
    setWalletProvider("");
    setWalletQr("");
    setWalletDeepLink("");
    setWalletLoading(false);
    setWalletModalOpen(false);
    setWalletMode("");

    localStorage.removeItem("cocky_connected_wallet");
    localStorage.removeItem("cocky_connected_wallet_provider");
    localStorage.removeItem("cocky_verified_wallet");
    localStorage.removeItem("cocky_verified_provider");
  }

  async function connectXaman() {
    try {
      if (xamanPollRef.current) {
        clearInterval(xamanPollRef.current);
        xamanPollRef.current = null;
      }

      setWalletLoading(true);
      setWalletMode("xaman");
      setWalletModalOpen(true);
      setWalletQr("");
      setWalletDeepLink("");

      const res = await fetch("/api/xaman/login", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.uuid) {
        throw new Error(data.error || "Could not start Xaman login.");
      }

      setWalletQr(data.qr || "");
      setWalletDeepLink(data.deepLink || data.deeplink || "");
      setWalletLoading(false);

      xamanPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/xaman/status/${data.uuid}`, {
            cache: "no-store",
          });

          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          if (statusData.signed && statusData.wallet) {
            if (xamanPollRef.current) {
              clearInterval(xamanPollRef.current);
              xamanPollRef.current = null;
            }

            saveWallet(statusData.wallet, "xaman");
            setWalletLoading(false);
            setWalletModalOpen(false);
            setWalletQr("");
            setWalletDeepLink("");
            setWalletMode("");
          }

          if (statusData.expired) {
            if (xamanPollRef.current) {
              clearInterval(xamanPollRef.current);
              xamanPollRef.current = null;
            }

            setWalletLoading(false);
          }
        } catch (err) {
          console.error(err);

          if (xamanPollRef.current) {
            clearInterval(xamanPollRef.current);
            xamanPollRef.current = null;
          }

          setWalletLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setWalletLoading(false);
      alert(err?.message || "Xaman connection failed.");
    }
  }

  async function connectJoey() {
    let walletConnectModal: any = null;

    try {
      setWalletMode("joey");
      setWalletLoading(true);
      setWalletModalOpen(true);
      setWalletQr("");
      setWalletDeepLink("");

      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

      if (!projectId) {
        throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");
      }

      const SignClient = (await import("@walletconnect/sign-client")).default;
      const { WalletConnectModal } = await import("@walletconnect/modal");

      const signClient = await SignClient.init({
        projectId,
        metadata: {
          name: "Cocky Portal",
          description: "Cocky Portal XRPL wallet connection",
          url: window.location.origin,
          icons: [`${window.location.origin}/cblogo.png`],
        },
      });

      walletConnectModal = new WalletConnectModal({
        projectId,
        chains: ["xrpl:0"],
      });

      const { uri, approval } = await signClient.connect({
        requiredNamespaces: {
          xrpl: {
            methods: ["xrpl_signTransaction"],
            chains: ["xrpl:0"],
            events: ["accountsChanged", "disconnect"],
          },
        },
      });

      if (uri) {
        setWalletModalOpen(false);
        setWalletLoading(false);
        setWalletMode("");
        walletConnectModal.openModal({ uri });
      }

      const session = await approval();
      walletConnectModal.closeModal();

      const account = session.namespaces?.xrpl?.accounts?.[0] || "";
      const address = account.split(":").pop() || "";

      if (!address || !address.startsWith("r")) {
        throw new Error("No XRPL wallet address returned from Joey.");
      }

      saveWallet(address, "joey");
      setWalletLoading(false);
      setWalletModalOpen(false);
      setWalletMode("");
    } catch (err: any) {
      console.error(err);

      if (walletConnectModal) {
        walletConnectModal.closeModal();
      }

      setWalletLoading(false);
      setWalletModalOpen(false);
      setWalletMode("");

      alert(err?.message || "Joey WalletConnect failed.");
    }
  }

  const menuItems = navItems.filter((item) => !isCurrentPage(item));

  return (
    <>
      {walletModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6 text-center shadow-[0_0_50px_rgba(34,211,238,0.2)]">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-left text-2xl font-black text-white">
                {walletMode === "joey" ? "Connect with Joey" : "Connect with Xaman"}
              </h3>

              <button
                onClick={() => {
                  setWalletModalOpen(false);
                  setWalletLoading(false);
                  setWalletQr("");
                  setWalletDeepLink("");
                }}
                className="rounded-full border border-red-500 px-3 py-1 text-xs font-black text-red-400"
              >
                Close
              </button>
            </div>

            {walletMode === "joey" ? (
              <div className="mt-6">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-orange-400/40 bg-orange-400/10 shadow-[0_0_35px_rgba(251,146,60,0.18)]">
                  <img
                    src="/joey.png"
                    alt="Joey Wallet"
                    className="h-16 w-16 object-contain"
                  />
                </div>

                <p className="mt-5 text-lg font-black text-white">
                  Opening WalletConnect...
                </p>

                {walletLoading && (
                  <div className="mx-auto mt-5 h-10 w-10 animate-spin rounded-full border-4 border-orange-400/25 border-t-orange-400" />
                )}

                <p className="mt-4 text-sm text-zinc-500">
                  Scan the WalletConnect QR or approve the session in Joey.
                </p>
              </div>
            ) : (
              <>
                {walletLoading && (
                  <p className="mt-6 font-bold text-cyan-400">
                    Creating request...
                  </p>
                )}

                {walletQr && (
                  <img
                    src={walletQr}
                    alt="Xaman QR"
                    className="mx-auto mt-6 h-64 w-64 rounded-2xl border border-zinc-800"
                  />
                )}

                {walletDeepLink && (
                  <a
                    href={walletDeepLink}
                    className="mt-5 block rounded-2xl bg-emerald-500 py-4 text-lg font-black text-black"
                  >
                    Open in Xaman
                  </a>
                )}

                <p className="mt-4 text-sm text-zinc-500">
                  Desktop users can scan the QR. Mobile users can tap the button.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <section className="relative z-50 mx-auto max-w-7xl px-3 pt-3 sm:px-5 sm:pt-5">
        <header className="rounded-[2rem] border border-[#3a2b16] bg-[#15110c]/95 p-3 text-[#fff4d8] shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur sm:p-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <a
              href="/"
              className="flex items-center justify-center gap-3 sm:justify-start sm:gap-4"
            >
              <img
                src="/cblogo.png"
                alt="Cocky Portal"
                className="h-16 w-16 rounded-full border border-yellow-300/70 object-cover shadow-[0_0_18px_rgba(255,210,31,0.34),0_0_28px_rgba(53,231,224,0.14)] sm:h-20 sm:w-20"
              />

              <div>
                <div className="flex items-baseline gap-1 text-3xl font-black leading-none sm:text-4xl">
                  <span className="text-yellow-300">Cocky</span>
                  <span className="text-cyan-300">Portal</span>
                </div>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-300 sm:mt-2 sm:text-xs sm:tracking-[0.3em]">
                  XRPL Discord Verification
                </p>
              </div>
            </a>

            <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end">
              {discordName ? (
                <a
                  href="/api/discord/logout"
                  className="rounded-xl border border-cyan-400/45 bg-cyan-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 transition hover:-translate-y-0.5 hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-300 active:scale-95 sm:py-3 sm:text-xs"
                  title="Disconnect Discord"
                >
                  Discord: {discordName}
                </a>
              ) : showDiscordLogin ? (
                <a
                  href={discordLoginHref()}
                  className="rounded-xl border border-cyan-400/60 bg-cyan-500/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 transition hover:-translate-y-0.5 hover:bg-cyan-500/25 hover:shadow-[0_0_22px_rgba(34,211,238,0.25)] active:scale-95 sm:py-3 sm:text-xs"
                >
                  Connect Discord
                </a>
              ) : null}

              {wallet ? (
                <button
                  type="button"
                  onClick={disconnectWallet}
                  className="group flex min-w-0 items-center gap-2 rounded-xl border border-emerald-400/45 bg-emerald-500/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.16)] transition hover:-translate-y-0.5 hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-300 active:scale-95 sm:py-3 sm:text-xs"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] group-hover:bg-red-400" />
                  <span>{shortWallet(wallet)}</span>
                  <span className="hidden text-[10px] group-hover:inline">
                    Disconnect
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={connectXaman}
                    disabled={walletLoading}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-400/60 bg-blue-500/15 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-white shadow-[0_0_14px_rgba(59,130,246,0.12)] transition hover:-translate-y-0.5 hover:bg-blue-500/25 hover:shadow-[0_0_22px_rgba(59,130,246,0.30)] active:scale-95 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-xs"
                  >
                    <img src="/xaman.png" alt="Xaman" className="h-5 w-5 object-contain" />
                    Xaman
                  </button>

                  <button
                    onClick={connectJoey}
                    disabled={walletLoading}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-orange-400/60 bg-orange-500/15 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-white shadow-[0_0_14px_rgba(251,146,60,0.12)] transition hover:-translate-y-0.5 hover:bg-orange-500/25 hover:shadow-[0_0_22px_rgba(251,146,60,0.30)] active:scale-95 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-xs"
                  >
                    <img src="/joey.png" alt="Joey" className="h-5 w-5 object-contain" />
                    Joey
                  </button>
                </>
              )}

              <a
                href="https://xrp.cafe/collection/famc"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-emerald-300/60 bg-emerald-400/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-400/30 hover:shadow-[0_0_22px_rgba(52,211,153,0.3)] active:scale-95 sm:py-3 sm:text-xs"
              >
                Mint
              </a>

              <div ref={menuButtonRef} className="relative">
                <button
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="rounded-xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-300 transition hover:-translate-y-0.5 hover:bg-yellow-400/20 hover:shadow-[0_0_22px_rgba(250,204,21,0.22)] active:scale-95 sm:py-3 sm:text-xs"
                >
                  Menu
                </button>
              </div>
            </div>
          </div>
        </header>
      </section>

      {menuOpen && (
        <div
          ref={menuPanelRef}
          className="rounded-3xl border border-[#3a2b16] bg-[#15110c]/95 p-4 text-[#fff4d8] shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            top: "7.5rem",
            right: "0.75rem",
            width: "min(18rem, calc(100vw - 1.5rem))",
            zIndex: 99999,
            pointerEvents: "auto",
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
            Cocky Menu
          </p>

          <div className="mt-4 grid gap-2">
            {menuItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className={`rounded-xl border px-4 py-3 text-xs font-black uppercase transition hover:-translate-y-0.5 active:scale-95 ${
                  item.highlight
                    ? "border-emerald-300/60 bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/30"
                    : "border-zinc-800 bg-black/35 text-white hover:border-cyan-400/35 hover:bg-white/10"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="mt-4 border-t border-zinc-800 pt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
              Socials
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {socials.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  title={social.name}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50"
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
        </div>
      )}
    </>
  );
}