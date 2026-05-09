"use client";

import { useEffect, useMemo, useState } from "react";

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
};

export default function DashboardPage() {
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const linkedProjects = projects.filter((project) => project.discord_guild_id);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuild),
    [guilds, selectedGuild]
  );

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
    const res = await fetch(`/api/projects/list?discord_id=${discordId}`);
    const data = await res.json();

    if (data.projects) {
      setProjects(data.projects);
    }
  }

  async function loadGuilds() {
    const res = await fetch("/api/discord/guilds");
    const data = await res.json();

    if (data.guilds) {
      setGuilds(data.guilds);
    }
  }

  useEffect(() => {
    loadDiscordUser();
  }, []);

  function connectDiscord() {
    window.location.href = "/api/discord/login";
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
      (project) => project.discord_guild_id === selectedGuild
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

  const displayName =
    discordUser?.global_name || discordUser?.username || "Discord User";

  const avatarUrl =
    discordUser?.avatar && discordUser?.id
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

  return (
    <main className="min-h-screen bg-[#071310] px-5 py-6 text-[#fff4d8]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#3a2b16] bg-[#15110c]/95 px-6 py-4 shadow-[0_0_40px_rgba(0,255,255,0.08)]">
          <div className="flex items-center gap-4">
            <img
              src="/cblogo.png"
              alt="Cocky.Cafe"
              className="h-16 w-16 rounded-full border border-yellow-400 object-cover shadow-[0_0_22px_rgba(34,211,238,0.45)]"
            />

            <div>
              <h1 className="text-3xl font-black leading-none">
                <span className="text-yellow-400">Cocky</span>
                <span className="text-cyan-400">.Cafe</span>
              </h1>

              <p className="mt-1 text-sm text-zinc-400">
                XRPL Discord verification dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {booting ? (
              <div className="rounded-full border border-zinc-700 bg-black/50 px-5 py-3 text-xs font-black uppercase text-zinc-400">
                Loading Discord...
              </div>
            ) : discordUser ? (
              <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-black/50 px-4 py-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 font-black text-black">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                    Connected Discord
                  </p>
                  <p className="font-black text-white">{displayName}</p>
                </div>
              </div>
            ) : (
              <button
                onClick={connectDiscord}
                className="rounded-full bg-[#5865F2] px-5 py-3 text-sm font-black uppercase text-white transition hover:brightness-110"
              >
                Connect Discord
              </button>
            )}

            <a
              href="/"
              className="rounded-full border border-cyan-500 px-5 py-3 text-sm font-black uppercase text-cyan-400 hover:bg-cyan-500/10"
            >
              Verify Page
            </a>
          </div>
        </header>

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
                onChange={(e) => setSelectedGuild(e.target.value)}
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
            <p className="mt-3 text-2xl font-black">Select → Open</p>
          </div>
        </section>
      </div>
    </main>
  );
}