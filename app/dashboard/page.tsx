"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CockyHeader from "@/app/components/CockyHeader";
import CockyFooter from "@/app/components/CockyFooter";

type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string;
};

type Guild = {
  id: string;
  name: string;
  icon?: string | null;
};

type Project = {
  id: string;
  name: string;
  owner_discord_id: string;
  discord_guild_id?: string | null;

  billing_status?: string | null;
  paid_until?: string | null;
  billing_wallet?: string | null;
  billing_destination_tag?: number | null;
  billing_last_tx_hash?: string | null;
  monthly_xrp_amount?: number | null;
  admin_locked?: boolean | null;
};

type BillingPayment = {
  uuid: string;
  qr: string;
  deepLink: string;
  amount_xrp: number;
  destination: string;
  destination_tag: number;
  memo: string;
  expires_at: string;
};

export default function DashboardPage() {
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingPayment, setBillingPayment] = useState<BillingPayment | null>(null);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingError, setBillingError] = useState("");

  const billingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const linkedProjects = projects.filter((project) => project.discord_guild_id);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuild),
    [guilds, selectedGuild],
  );

  const selectedProject = useMemo(
    () =>
      projects.find(
        (project) =>
          project.discord_guild_id &&
          String(project.discord_guild_id) === String(selectedGuild),
      ) || null,
    [projects, selectedGuild],
  );

  const paidUntilLabel = selectedProject?.paid_until
    ? new Date(selectedProject.paid_until).toLocaleString()
    : "Not paid yet";

  const isBillingActive = useMemo(() => {
    if (!selectedProject) return false;
    if (selectedProject.admin_locked) return false;
    if (selectedProject.billing_status === "comped") return true;
    if (selectedProject.billing_status !== "active") return false;
    if (!selectedProject.paid_until) return false;

    return new Date(selectedProject.paid_until).getTime() > Date.now();
  }, [selectedProject]);

  async function loadDiscordUser() {
    try {
      const res = await fetch("/api/discord/me", { cache: "no-store" });
      const data = await res.json();

      if (data.loggedIn && data.user) {
        setDiscordUser(data.user);
        await Promise.all([loadProjects(data.user.id), loadGuilds()]);
      } else {
        setDiscordUser(null);
        setProjects([]);
        setGuilds([]);
      }
    } catch (err) {
      console.error(err);
    }

    setBooting(false);
  }

  async function loadProjects(discordId: string) {
    const res = await fetch(`/api/projects/list?discord_id=${discordId}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (data.projects) {
      setProjects(data.projects);
    }
  }

  async function loadGuilds() {
    const res = await fetch("/api/discord/guilds", { cache: "no-store" });
    const data = await res.json();

    if (data.guilds) {
      setGuilds(data.guilds);
    }
  }

  useEffect(() => {
    loadDiscordUser();

    return () => {
      if (billingPollRef.current) {
        clearInterval(billingPollRef.current);
        billingPollRef.current = null;
      }
    };
  }, []);

  function connectDiscord() {
    window.location.href = "/api/discord/login?return_to=/dashboard";
  }

  async function openServer() {
    if (!discordUser?.id) {
      connectDiscord();
      return;
    }

    if (!selectedGuild) {
      alert("Select a Discord server first.");
      return;
    }

    const existing = projects.find(
      (project) => project.discord_guild_id === selectedGuild,
    );

    if (existing) {
      window.location.href = `/project/${existing.id}`;
      return;
    }

    const guild = guilds.find((guild) => guild.id === selectedGuild);
    if (!guild) return;

    setLoading(true);

    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: guild.name,
          owner_discord_id: discordUser.id,
          discord_guild_id: guild.id,
        }),
      });

      const data = await res.json();

      if (data.success && data.project) {
        window.location.href = `/project/${data.project.id}`;
      } else {
        alert(data.error || "Failed to open server.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to open server.");
    }

    setLoading(false);
  }

  async function createXrpPayment(projectId: string) {
    setBillingLoading(true);
    setBillingError("");
    setBillingMessage("");
    setBillingPayment(null);

    if (billingPollRef.current) {
      clearInterval(billingPollRef.current);
      billingPollRef.current = null;
    }

    try {
      const res = await fetch("/api/billing/xrp/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: projectId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setBillingError(data.error || "Failed to create XRP payment.");
        return;
      }

      setBillingPayment(data);
      setBillingMessage("Payment request created. Sign the XRP payment in Xaman.");

      billingPollRef.current = setInterval(async () => {
        await checkXrpPayment(data.uuid);
      }, 2500);
    } catch (err: any) {
      console.error(err);
      setBillingError(err?.message || "Failed to create XRP payment.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function checkXrpPayment(uuid: string) {
    try {
      const res = await fetch(`/api/billing/xrp/status/${uuid}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setBillingError(data.error || "Failed to check XRP payment.");
        return;
      }

      if (data.paid) {
        if (billingPollRef.current) {
          clearInterval(billingPollRef.current);
          billingPollRef.current = null;
        }

        setBillingMessage(`Payment confirmed. Paid until ${new Date(data.paid_until).toLocaleString()}.`);
        setBillingPayment(null);

        if (discordUser?.id) {
          await loadProjects(discordUser.id);
        }

        return;
      }

      if (data.expired) {
        if (billingPollRef.current) {
          clearInterval(billingPollRef.current);
          billingPollRef.current = null;
        }

        setBillingError("Payment request expired. Create a new payment request.");
        return;
      }

      setBillingMessage("Waiting for XRP payment signature...");
    } catch (err: any) {
      console.error(err);
      setBillingError(err?.message || "Failed to check XRP payment.");
    }
  }

  function closeBillingPayment() {
    if (billingPollRef.current) {
      clearInterval(billingPollRef.current);
      billingPollRef.current = null;
    }

    setBillingPayment(null);
    setBillingLoading(false);
  }

  const displayName =
    discordUser?.global_name || discordUser?.username || "Discord User";

  return (
    <main className="min-h-screen bg-[#071310] pb-24 text-[#fff4d8]">
      <CockyHeader
        mode="dashboard"
        discordName={discordUser ? displayName : ""}
        showDiscordLogin={!discordUser && !booting}
      />

      {billingPayment && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6 text-center shadow-[0_0_50px_rgba(34,211,238,0.2)]">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-left text-2xl font-black text-white">
                XRP Hosting Payment
              </h3>

              <button
                onClick={closeBillingPayment}
                className="rounded-full border border-red-500 px-3 py-1 text-xs font-black text-red-400"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                Amount
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {billingPayment.amount_xrp} XRP
              </p>

              <p className="mt-3 break-all text-xs text-zinc-400">
                Memo: {billingPayment.memo}
              </p>

              <p className="mt-1 break-all text-xs text-zinc-500">
                Tag: {billingPayment.destination_tag}
              </p>
            </div>

            {billingPayment.qr && (
              <img
                src={billingPayment.qr}
                alt="Xaman payment QR"
                className="mx-auto mt-6 h-64 w-64 rounded-2xl border border-zinc-800"
              />
            )}

            {billingPayment.deepLink && (
              <a
                href={billingPayment.deepLink}
                className="mt-5 block rounded-2xl bg-yellow-400 py-4 text-lg font-black text-black hover:bg-yellow-300"
              >
                Open Xaman Payment
              </a>
            )}

            <p className="mt-4 text-sm font-bold text-cyan-300">
              {billingMessage || "Waiting for payment..."}
            </p>

            {billingError && (
              <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-black text-red-300">
                {billingError}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-5 py-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#3a2b16] bg-black px-8 py-14 shadow-[0_0_55px_rgba(34,211,238,0.08)]">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/herobot.MP4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/35" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,0.17),transparent_38%),radial-gradient(circle_at_20%_75%,rgba(250,204,21,0.12),transparent_34%)]" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-[0.45em] text-cyan-400">
                Server Setup
              </p>

              <h2 className="max-w-4xl text-5xl font-black leading-[0.95] text-white md:text-6xl">
                Select a server. Configure access rules.
              </h2>

              <p className="mt-5 max-w-2xl text-zinc-300">
                Choose the Discord server Cocky Bot should manage, then scan XRPL
                issuer wallets and build NFT, trait, and token-gated role rules.
              </p>

              <div className="mt-6 inline-flex rounded-xl border border-red-600 bg-red-950/50 px-4 py-3 text-sm font-black uppercase text-red-300">
                Discord controls channels • Cocky.Cafe controls role eligibility
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/30 bg-[#15110c]/90 p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-400">
                Active Server
              </p>

              <select
                value={selectedGuild}
                onChange={(e) => {
                  setSelectedGuild(e.target.value);
                  setBillingPayment(null);
                  setBillingMessage("");
                  setBillingError("");
                }}
                disabled={!discordUser || guilds.length === 0}
                className="mt-5 w-full rounded-2xl border border-zinc-700 bg-black/70 px-5 py-4 text-lg font-black text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select Discord Server</option>

                {guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>

              <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                  Selected
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {selectedGuildData?.name || "No server selected"}
                </p>

                <p className="mt-1 break-all text-xs text-zinc-500">
                  {selectedGuildData?.id || "Connect Discord and pick a server."}
                </p>
              </div>

              {selectedProject && (
                <div className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                        Hosting Subscription
                      </p>

                      <p className="mt-2 text-sm font-bold text-zinc-300">
                        Status:{" "}
                        <span
                          className={
                            isBillingActive
                              ? "text-emerald-300"
                              : "text-red-300"
                          }
                        >
                          {isBillingActive
                            ? "Active"
                            : selectedProject.billing_status || "Inactive"}
                        </span>
                      </p>

                      <p className="mt-1 text-xs text-zinc-400">
                        Paid until: {paidUntilLabel}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        Monthly: {selectedProject.monthly_xrp_amount || 25} XRP
                      </p>
                    </div>

                    <button
                      onClick={() => createXrpPayment(selectedProject.id)}
                      disabled={billingLoading}
                      className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60"
                    >
                      {billingLoading ? "Creating..." : "Pay 30 Days"}
                    </button>
                  </div>

                  {billingMessage && !billingPayment && (
                    <p className="mt-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 text-xs font-black text-cyan-300">
                      {billingMessage}
                    </p>
                  )}

                  {billingError && !billingPayment && (
                    <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-black text-red-300">
                      {billingError}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={openServer}
                disabled={loading || !discordUser}
                className="mt-5 w-full rounded-2xl bg-emerald-500 px-6 py-4 text-lg font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Opening Server..." : "Open Server Setup"}
              </button>

              {!discordUser && (
                <button
                  onClick={connectDiscord}
                  className="mt-3 w-full rounded-2xl border border-[#5865F2] bg-[#5865F2]/10 px-6 py-4 text-sm font-black uppercase text-[#b8c0ff] hover:bg-[#5865F2]/20"
                >
                  Connect Discord First
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">
              Server Projects
            </p>
            <p className="mt-3 text-5xl font-black">{linkedProjects.length}</p>
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-yellow-400">
              Available Servers
            </p>
            <p className="mt-3 text-5xl font-black">{guilds.length}</p>
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
              Flow
            </p>
            <p className="mt-3 text-2xl font-black">Select → Pay → Open</p>
          </div>
        </section>
      </div>

      <CockyFooter />
    </main>
  );
}