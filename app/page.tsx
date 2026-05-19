"use client";

import { useEffect, useRef, useState } from "react";
import CockyHeader from "@/app/components/CockyHeader";
import CockyFooter from "@/app/components/CockyFooter";

type WalletProvider = "xaman" | "joey" | "";
type VerifyState = "idle" | "checking" | "success" | "error" | "missing-discord";

type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string;
};

type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  project_id?: string;
  project_name?: string;
};

type ScanSummary = {
  wallet?: string;
  discord_user_id?: string;
  discord_guild_id?: string;
  project_id?: string;
  project_name?: string;
  wallet_total_nfts_owned?: number;
  total_nfts_owned?: number;
  indexed_nfts_found?: number;
  collections?: {
    issuer: string;
    taxon: string;
    name: string;
    owned_count: number;
    indexed_count: number;
  }[];
  traits?: {
    trait_type: string;
    value: string;
    count: number;
  }[];
  rules?: {
    role_id: string;
    role_name: string;
    passed: boolean;
    logic: "OR";
    requirements: {
      requirement_type: string;
      issuer: string;
      taxon: string;
      collection_name: string;
      passed: boolean;
      found_count?: number;
      required_count?: number;
      trait_type?: string;
      trait_value?: string;
      matching_trait_count?: number;
    }[];
  }[];
};

const WALLET_KEY = "cocky_verified_wallet";
const PROVIDER_KEY = "cocky_verified_provider";
const DISCORD_GUILD_KEY = "cocky_verify_guild_id";
const DISCORD_USER_KEY = "cocky_verify_discord_id";

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
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [discordLoading, setDiscordLoading] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [urlGuildId, setUrlGuildId] = useState("");
  const [urlDiscordId, setUrlDiscordId] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedWallet = localStorage.getItem(WALLET_KEY);
    const savedProvider = localStorage.getItem(PROVIDER_KEY) as WalletProvider | null;
    const savedGuildId = localStorage.getItem(DISCORD_GUILD_KEY) || "";

    const params = new URLSearchParams(window.location.search);
    const guildFromUrl = params.get("guild_id") || params.get("guildId") || "";
    const userFromUrl =
      params.get("user_id") ||
      params.get("userId") ||
      params.get("discord_id") ||
      params.get("discordId") ||
      "";

    setUrlGuildId(guildFromUrl);
    setUrlDiscordId(userFromUrl);

    if (guildFromUrl) {
      setSelectedGuildId(guildFromUrl);
      localStorage.setItem(DISCORD_GUILD_KEY, guildFromUrl);
    } else if (savedGuildId) {
      setSelectedGuildId(savedGuildId);
    }

    if (userFromUrl) {
      localStorage.setItem(DISCORD_USER_KEY, userFromUrl);
    }

    if (savedWallet) {
      setWallet(savedWallet);
      setWalletProvider(savedProvider || "xaman");
    }

    loadDiscordSession();
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

    const guildFromUrl = params.get("guild_id") || params.get("guildId") || "";
    const userFromUrl =
      params.get("user_id") ||
      params.get("userId") ||
      params.get("discord_id") ||
      params.get("discordId") ||
      "";

    const savedGuildId = localStorage.getItem(DISCORD_GUILD_KEY) || "";
    const savedUserId = localStorage.getItem(DISCORD_USER_KEY) || "";

    return {
      guildId: guildFromUrl || selectedGuildId || savedGuildId || "",
      userId: userFromUrl || discordUser?.id || savedUserId || "",
    };
  }

  function hasDiscordCommandContext() {
    const { guildId, userId } = getDiscordContext();
    return Boolean(guildId && userId && (urlGuildId || urlDiscordId));
  }

  async function loadDiscordSession() {
    try {
      setDiscordLoading(true);

      const meRes = await fetch("/api/discord/me", {
        cache: "no-store",
      });
      const meData = await meRes.json().catch(() => ({}));

      if (meData.loggedIn && meData.user) {
        setDiscordUser(meData.user);
        localStorage.setItem(DISCORD_USER_KEY, meData.user.id);

        const guildRes = await fetch("/api/discord/verify-guilds", {
          cache: "no-store",
        });
        const guildData = await guildRes.json().catch(() => ({}));
        const loadedGuilds = guildData.guilds || guildData.servers || [];

        if (Array.isArray(loadedGuilds)) {
          const sortedGuilds = loadedGuilds
            .filter((guild: DiscordGuild) => guild?.id && guild?.name)
            .sort((a: DiscordGuild, b: DiscordGuild) =>
              a.name.localeCompare(b.name),
            );

          setGuilds(sortedGuilds);

          const savedGuildId = localStorage.getItem(DISCORD_GUILD_KEY) || "";
          const hasSavedGuild = sortedGuilds.some(
            (guild: DiscordGuild) => guild.id === savedGuildId,
          );

          if (!selectedGuildId && hasSavedGuild) {
            setSelectedGuildId(savedGuildId);
          }
        }
      }
    } catch (err) {
      console.warn("Discord session load skipped", err);
    } finally {
      setDiscordLoading(false);
    }
  }

  function connectDiscord() {
    const returnTo =
      typeof window !== "undefined"
        ? encodeURIComponent(`${window.location.pathname}${window.location.search || ""}`)
        : "";

    window.location.href = returnTo
      ? `/api/discord/login?return_to=${returnTo}`
      : "/api/discord/login";
  }

  function handleServerSelect(guildId: string) {
    setSelectedGuildId(guildId);
    setScanSummary(null);

    if (guildId) {
      localStorage.setItem(DISCORD_GUILD_KEY, guildId);
    } else {
      localStorage.removeItem(DISCORD_GUILD_KEY);
    }
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
    setScanSummary(null);
  }

  async function runVerification(address: string, provider: WalletProvider) {
    const { guildId, userId } = getDiscordContext();

    if (!guildId || !userId) {
      setVerifyState("missing-discord");
      setVerifyMessage(
        "Wallet connected. Connect Discord and select a configured server, or open this page from /verifyportal inside Discord.",
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

      if (data.scan_summary) {
        setScanSummary(data.scan_summary);
      }

      if (!res.ok || data.success === false) {
        setVerifyState("error");
        setVerifyMessage(
          data.error ||
            "Wallet connected, but the Discord role update route is not finished yet.",
        );
        return;
      }

      setVerifyState("success");
      setVerifyMessage(
        data.message || "Verification complete. Discord roles updated.",
      );
    } catch (err) {
      console.error(err);
      setVerifyState("error");
      setVerifyMessage(
        "Wallet connected, but /api/verify is missing or failed. The next step is wiring the role-update route.",
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
      setScanSummary(null);

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
      setScanSummary(null);

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
        "Joey WalletConnect could not finish. Make sure Joey supports this WalletConnect XRPL request and try again.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#071310] text-[#fff4d8]">
      <CockyHeader
        mode="verify"
        discordName={discordUser ? discordUser.global_name || discordUser.username || "" : ""}
        showDiscordLogin={!discordUser && !hasDiscordCommandContext()}
      />

      <div className="mx-auto max-w-6xl px-5 py-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#3a2b16] bg-black px-7 py-12 shadow-2xl">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/herobot.MP4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/35" />
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
              Open this page through /verifyportal for automatic Discord server
              detection. If you came here directly, connect Discord and select a
              configured Cocky Bot server.
            </p>

            <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5">
              {hasDiscordCommandContext() ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                    Discord Command Detected
                  </p>

                  <p className="mt-1 text-sm font-bold text-white">
                    Server was filled from /verifyportal
                  </p>

                  <p className="mt-2 break-all text-xs text-zinc-500">
                    Server ID: {getDiscordContext().guildId}
                  </p>

                  <p className="mt-1 break-all text-xs text-zinc-500">
                    Discord User ID: {getDiscordContext().userId}
                  </p>

                  <p className="mt-3 text-xs text-zinc-400">
                    Discord Connect is optional when you open this page from the bot command.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                        Discord
                      </p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {discordUser
                          ? discordUser.global_name || discordUser.username || "Connected"
                          : "Optional unless you came directly to this page"}
                      </p>
                    </div>

                    {!discordUser && (
                      <button
                        onClick={connectDiscord}
                        disabled={discordLoading}
                        className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black uppercase text-black hover:bg-cyan-300 disabled:opacity-60"
                      >
                        {discordLoading ? "Checking..." : "Connect Discord"}
                      </button>
                    )}
                  </div>

                  {discordUser && (
                    <div className="mt-4">
                      <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                        Server To Verify
                      </label>

                      <select
                        value={selectedGuildId}
                        onChange={(e) => handleServerSelect(e.target.value)}
                        className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/70 px-4 py-3 text-sm font-bold text-white outline-none"
                      >
                        <option value="">Select Discord Server</option>
                        {guilds.map((guild) => (
                          <option key={guild.id} value={guild.id}>
                            {guild.project_name || guild.name}
                          </option>
                        ))}
                      </select>

                      {guilds.length === 0 && (
                        <p className="mt-2 text-xs text-zinc-500">
                          No configured Cocky Bot servers found for this Discord account.
                        </p>
                      )}

                      {selectedGuildId && (
                        <p className="mt-2 break-all text-xs text-zinc-500">
                          Server ID: {selectedGuildId}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

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

            {scanSummary && (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/45 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                      Wallet Scan Summary
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {scanSummary.project_name || "Configured Server"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                      NFTs Owned
                    </p>
                    <p className="text-xl font-black text-white">
                      {scanSummary.total_nfts_owned ??
                        scanSummary.wallet_total_nfts_owned ??
                        0}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                      Collections Found
                    </p>

                    <div className="mt-3 space-y-2">
                      {(scanSummary.collections || []).length === 0 ? (
                        <p className="text-sm text-zinc-500">No matching collections found.</p>
                      ) : (
                        (scanSummary.collections || []).map((collection) => (
                          <div
                            key={`${collection.issuer}-${collection.taxon}`}
                            className="rounded-lg border border-zinc-800 bg-black/50 p-3"
                          >
                            <p className="font-black text-white">
                              {collection.name || `Taxon ${collection.taxon}`}
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">
                              Owned: {collection.owned_count} • Indexed: {collection.indexed_count}
                            </p>
                            <p className="mt-1 break-all text-[10px] text-zinc-600">
                              {collection.issuer}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-black/50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
                      Traits Found
                    </p>

                    <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                      {(scanSummary.traits || []).length === 0 ? (
                        <p className="text-sm text-zinc-500">
                          No indexed traits found for this wallet.
                        </p>
                      ) : (
                        (scanSummary.traits || []).map((trait) => (
                          <div
                            key={`${trait.trait_type}-${trait.value}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-black/50 px-3 py-2"
                          >
                            <p className="text-sm text-zinc-300">
                              <span className="font-black text-yellow-300">
                                {trait.trait_type}
                              </span>
                              : {trait.value}
                            </p>
                            <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-black text-white">
                              {trait.count}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-black/50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                    Role Results
                  </p>

                  <div className="mt-3 space-y-3">
                    {(scanSummary.rules || []).length === 0 ? (
                      <p className="text-sm text-zinc-500">No role rules checked.</p>
                    ) : (
                      (scanSummary.rules || []).map((rule) => (
                        <div
                          key={rule.role_id}
                          className={`rounded-xl border p-4 ${
                            rule.passed
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-red-500/40 bg-red-500/10"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-white">{rule.role_name}</p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                                rule.passed
                                  ? "bg-emerald-500 text-black"
                                  : "bg-red-500 text-white"
                              }`}
                            >
                              {rule.passed ? "Passed" : "Failed"}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-zinc-400">
                            Logic: {rule.logic} — any passing requirement grants this role.
                          </p>

                          <div className="mt-3 space-y-2">
                            {rule.requirements.map((req, index) => (
                              <div
                                key={`${rule.role_id}-${index}`}
                                className="rounded-lg border border-zinc-800 bg-black/50 p-3 text-xs"
                              >
                                <p
                                  className={
                                    req.passed
                                      ? "font-black text-emerald-300"
                                      : "font-black text-red-300"
                                  }
                                >
                                  {req.passed ? "✓" : "✕"}{" "}
                                  {req.requirement_type === "trait"
                                    ? `Trait: ${req.trait_type} = ${req.trait_value}`
                                    : `NFT Quantity: ${req.found_count || 0}/${req.required_count || 1}`}
                                </p>

                                {req.requirement_type === "trait" && (
                                  <p className="mt-1 text-zinc-400">
                                    Matching traits: {req.matching_trait_count || 0} • NFTs in collection: {req.found_count || 0}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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
      </div>

      <CockyFooter />

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