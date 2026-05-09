"use client";

import { useEffect, useRef, useState } from "react";

type WalletProvider = "xaman" | "joey" | "";
type VerifyState = "idle" | "checking" | "success" | "error" | "missing-discord";

const WALLET_KEY = "cocky_verified_wallet";
const PROVIDER_KEY = "cocky_verified_provider";

export default function Home() {
  const [qr, setQr] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [wallet, setWallet] = useState("");
  const [walletProvider, setWalletProvider] = useState<WalletProvider>("");
  const [loading, setLoading] = useState(false);
  const [walletModal, setWalletModal] = useState(false);
  const [walletMode, setWalletMode] = useState<WalletProvider>("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyMessage, setVerifyMessage] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedWallet = localStorage.getItem(WALLET_KEY);
    const savedProvider = localStorage.getItem(PROVIDER_KEY) as WalletProvider | null;

    if (savedWallet) {
      setWallet(savedWallet);
      setWalletProvider(savedProvider || "xaman");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function shortWallet(address: string) {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  function getDiscordContext() {
    if (typeof window === "undefined") {
      return { guildId: "", userId: "" };
    }

    const params = new URLSearchParams(window.location.search);

    return {
      guildId: params.get("guild_id") || params.get("guildId") || "",
      userId:
        params.get("user_id") ||
        params.get("userId") ||
        params.get("discord_id") ||
        params.get("discordId") ||
        "",
    };
  }

  function saveWallet(address: string, provider: WalletProvider) {
    localStorage.setItem(WALLET_KEY, address);
    localStorage.setItem(PROVIDER_KEY, provider);
    setWallet(address);
    setWalletProvider(provider);
  }

  function disconnectWallet() {
    if (pollRef.current) clearInterval(pollRef.current);

    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(PROVIDER_KEY);

    setWallet("");
    setWalletProvider("");
    setQr("");
    setDeepLink("");
    setLoading(false);
    setWalletModal(false);
    setWalletMode("");
    setVerifyState("idle");
    setVerifyMessage("");
  }

  async function runVerification(address: string, provider: WalletProvider) {
    const { guildId, userId } = getDiscordContext();

    if (!guildId || !userId) {
      setVerifyState("missing-discord");
      setVerifyMessage(
        "Wallet connected. To update Discord roles, open this page from the /verifyportal button inside Discord."
      );
      return;
    }

    setVerifyState("checking");
    setVerifyMessage("Checking wallet access and updating Discord roles...");

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet: address,
          provider,
          discord_user_id: userId,
          discord_guild_id: guildId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setVerifyState("error");
        setVerifyMessage(
          data.error ||
            "Wallet connected, but the Discord role update route is not finished yet."
        );
        return;
      }

      setVerifyState("success");
      setVerifyMessage(
        data.message || "Verification complete. Discord roles updated."
      );
    } catch (err) {
      console.error(err);
      setVerifyState("error");
      setVerifyMessage(
        "Wallet connected, but /api/verify is missing or failed. The next step is wiring the role-update route."
      );
    }
  }

  async function connectXaman() {
    try {
      setLoading(true);
      setWalletMode("xaman");
      setWalletModal(true);
      setQr("");
      setDeepLink("");
      setVerifyState("idle");
      setVerifyMessage("");

      if (pollRef.current) clearInterval(pollRef.current);

      const res = await fetch("/api/xaman/login");
      const data = await res.json();

      if (!res.ok || !data.uuid) {
        throw new Error(data.error || "Could not create Xaman login request.");
      }

      setQr(data.qr || "");
      setDeepLink(data.deepLink || data.deeplink || "");

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/xaman/status/${data.uuid}`);

          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          if (statusData.signed && statusData.wallet) {
            if (pollRef.current) clearInterval(pollRef.current);

            saveWallet(statusData.wallet, "xaman");
            setLoading(false);
            setWalletModal(false);
            setQr("");
            setDeepLink("");

            await runVerification(statusData.wallet, "xaman");
          }

          if (statusData.expired) {
            if (pollRef.current) clearInterval(pollRef.current);
            setLoading(false);
            setVerifyState("error");
            setVerifyMessage("Xaman request expired. Try connecting again.");
          }
        } catch (err) {
          console.log("Xaman polling stopped", err);
          if (pollRef.current) clearInterval(pollRef.current);
          setLoading(false);
        }
      }, 2000);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setVerifyState("error");
      setVerifyMessage("Could not start Xaman login.");
    }
  }

  async function connectJoey() {
    try {
      setLoading(true);
      setWalletMode("joey");
      setWalletModal(true);
      setVerifyState("idle");
      setVerifyMessage("");

      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

      if (!projectId) {
        throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
      }

      const SignClient = (await import("@walletconnect/sign-client")).default;
      const { WalletConnectModal } = await import("@walletconnect/modal");

      const signClient = await SignClient.init({
        projectId,
        metadata: {
          name: "Cocky Portal",
          description: "XRPL-powered Discord verification portal",
          url: window.location.origin,
          icons: [`${window.location.origin}/cblogo.png`],
        },
      });

      const walletConnectModal = new WalletConnectModal({
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
        await walletConnectModal.openModal({ uri });
      }

      const session = await approval();
      walletConnectModal.closeModal();

      const account = session.namespaces?.xrpl?.accounts?.[0] || "";
      const address = account.split(":").pop() || "";

      if (!address || !address.startsWith("r")) {
        throw new Error("No XRPL wallet address returned from WalletConnect.");
      }

      saveWallet(address, "joey");
      setLoading(false);
      setWalletModal(false);

      await runVerification(address, "joey");
    } catch (err) {
      console.error(err);
      setLoading(false);
      setVerifyState("error");
      setVerifyMessage(
        "Joey WalletConnect could not finish. Make sure Joey supports this WalletConnect XRPL request and try again."
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#071310] px-5 py-6 text-[#fff4d8]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between rounded-3xl border border-[#3a2b16] bg-[#15110c]/90 px-6 py-4 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-yellow-400 bg-black">
              <img src="/cblogo.png" alt="Cocky Portal" className="h-full w-full object-cover" />
            </div>

            <div>
              <h1 className="text-3xl font-black leading-none">
                <span className="text-yellow-400">CAL</span>
                <span className="text-cyan-400">Co</span>{" "}
                <span className="text-white">Verify</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Official XRPL Discord access portal
              </p>
            </div>
          </div>

          {wallet ? (
            <div className="flex items-center gap-3 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
                  {walletProvider === "joey" ? "Joey Connected" : "Xaman Connected"}
                </p>
                <p className="text-xs font-bold text-white">{shortWallet(wallet)}</p>
              </div>

              <button
                onClick={disconnectWallet}
                className="rounded-full bg-red-900/70 px-3 py-1 text-[10px] font-black uppercase text-white hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setWalletModal(true)}
              disabled={loading}
              className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading ? "Waiting..." : "Connect Wallet"}
            </button>
          )}
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-[#3a2b16] bg-black px-7 py-12 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_20%_80%,rgba(250,204,21,0.13),transparent_35%)]" />
          <div className="absolute inset-0 bg-black/45" />

          <div className="relative z-10 max-w-3xl">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.45em] text-cyan-400">
              Verified Cocky Access
            </p>

            <h2 className="text-5xl font-black leading-[0.95] text-white md:text-6xl">
              Verify your wallet.
              <br />
              Unlock your Discord.
            </h2>

            <p className="mt-5 max-w-xl text-base text-zinc-300">
              Connect your XRPL wallet to unlock holder roles, trait-gated
              channels, premium access, and future Cocky/CALCo rewards.
            </p>

            <div className="mt-6 inline-flex rounded-xl border border-red-600 bg-red-950/50 px-4 py-3 text-sm font-black uppercase text-red-300">
              Roles update based on NFT, trait, and token requirements
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7 shadow-2xl">
            <h3 className="text-2xl font-black text-white">Discord Verification</h3>

            <p className="mt-2 text-sm text-zinc-400">
              Connect with Xaman or Joey Wallet. Open this page through Discord
              so Cocky Bot knows which server and user to update.
            </p>

            {!wallet && (
              <div className="mt-6 flex flex-col gap-4">
                <button
                  onClick={connectXaman}
                  disabled={loading}
                  className="w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black transition hover:bg-cyan-300 disabled:opacity-70"
                >
                  {loading && walletMode === "xaman"
                    ? "Waiting For Signature..."
                    : "Connect with Xaman"}
                </button>

                <button
                  onClick={connectJoey}
                  disabled={loading}
                  className="w-full rounded-2xl border border-orange-500/60 bg-orange-500/10 py-4 text-lg font-black text-orange-200 transition hover:bg-orange-500/20 disabled:opacity-70"
                >
                  {loading && walletMode === "joey"
                    ? "Opening WalletConnect..."
                    : "Connect with Joey"}
                </button>
              </div>
            )}

            {wallet && (
              <div className="mt-6 rounded-2xl border border-emerald-500 bg-emerald-500/10 p-6">
                <p className="text-xl font-black text-emerald-400">
                  Wallet Connected
                </p>

                <p className="mt-2 break-all text-sm text-zinc-300">{wallet}</p>

                <button
                  onClick={() => runVerification(wallet, walletProvider || "xaman")}
                  className="mt-5 w-full rounded-2xl bg-yellow-400 px-6 py-4 text-center text-lg font-black text-black transition hover:bg-yellow-300"
                >
                  Refresh Discord Roles
                </button>
              </div>
            )}

            {verifyMessage && (
              <div
                className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${
                  verifyState === "success"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : verifyState === "checking"
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-red-500 bg-red-500/10 text-red-300"
                }`}
              >
                {verifyMessage}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7 shadow-2xl">
            <h3 className="text-xl font-black text-white">Access Checks</h3>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">NFTs</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {verifyState === "success" ? "Checked" : "Ready"}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-yellow-400">Traits</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {verifyState === "success" ? "Checked" : "Ready"}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">
                  Discord Roles
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {verifyState === "success"
                    ? "Updated"
                    : verifyState === "checking"
                      ? "Checking"
                      : "Pending"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-zinc-600">
          Powered by XRPL • CALCo • Cocky Apes Crew
        </footer>
      </div>

      {walletModal && !wallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-400">
                  Cocky Portal
                </p>
                <h3 className="mt-2 text-2xl font-black text-white">
                  Connect Wallet
                </h3>
              </div>

              <button
                onClick={() => {
                  setWalletModal(false);
                  setLoading(false);
                  setQr("");
                  setDeepLink("");
                  if (pollRef.current) clearInterval(pollRef.current);
                }}
                className="rounded-full border border-red-500 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-500/10"
              >
                Close
              </button>
            </div>

            {!qr && walletMode !== "joey" && (
              <div className="mt-6 grid gap-3">
                <button
                  onClick={connectXaman}
                  disabled={loading}
                  className="rounded-2xl bg-cyan-400 px-5 py-4 text-lg font-black text-black hover:bg-cyan-300 disabled:opacity-70"
                >
                  Connect with Xaman
                </button>

                <button
                  onClick={connectJoey}
                  disabled={loading}
                  className="rounded-2xl border border-orange-500/60 bg-orange-500/10 px-5 py-4 text-lg font-black text-orange-200 hover:bg-orange-500/20 disabled:opacity-70"
                >
                  Connect with Joey
                </button>
              </div>
            )}

            {qr && walletMode === "xaman" && (
              <div className="mt-6 flex flex-col items-center rounded-3xl border border-zinc-800 bg-black/40 p-5">
                <img src={qr} alt="Xaman QR" className="h-64 w-64 rounded-2xl" />

                <p className="mt-4 text-center text-sm text-zinc-400">
                  Scan with Xaman Wallet or open the app below.
                </p>

                {deepLink && (
                  <a
                    href={deepLink}
                    className="mt-4 w-full rounded-2xl bg-yellow-400 px-6 py-4 text-center text-lg font-black text-black transition hover:bg-yellow-300"
                  >
                    Open Xaman App
                  </a>
                )}
              </div>
            )}

            {walletMode === "joey" && loading && (
              <div className="mt-6 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-5 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500 bg-black">
                  <img src="/joey.png" alt="Joey Wallet" className="h-10 w-10 object-contain" />
                </div>
                <p className="text-lg font-black text-white">Opening WalletConnect</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Scan the QR or approve the session in Joey Wallet.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
