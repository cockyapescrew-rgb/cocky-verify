"use client";

import { useEffect, useMemo, useState } from "react";
import CockyHeader from "@/app/components/CockyHeader";
import CockyFooter from "@/app/components/CockyFooter";

type Project = {
  id: string;
  name?: string | null;
  owner_discord_id?: string | null;
  discord_guild_id?: string | null;
  created_at?: string | null;

  billing_status?: string | null;
  paid_until?: string | null;
  billing_wallet?: string | null;
  billing_destination_tag?: number | string | null;
  billing_last_tx_hash?: string | null;
  monthly_xrp_amount?: number | string | null;
  admin_locked?: boolean | null;
  admin_notes?: string | null;

  tenant_image_url?: string | null;
  tenant_image_path?: string | null;
  tenant_image_updated_at?: string | null;
  tenant_image_removed_by_admin?: boolean | null;
  tenant_image_admin_note?: string | null;
};

type Payment = {
  id: string;
  project_id?: string | null;
  discord_guild_id?: string | null;
  server_name?: string | null;
  server_image_url?: string | null;
  payer_wallet?: string | null;
  tx_hash?: string | null;
  xaman_uuid?: string | null;
  amount_xrp?: number | string | null;
  xrp_usd_price?: number | string | null;
  amount_usd?: number | string | null;
  destination_wallet?: string | null;
  destination_tag?: number | string | null;
  memo?: string | null;
  status?: string | null;
  paid_at?: string | null;
  paid_until?: string | null;
  created_at?: string | null;
};

const BILLING_STATUSES = ["inactive", "active", "past_due", "comped", "banned"];

const BILLING_HELP: Record<string, string> = {
  active: "Paid/temporary access. Uses the paid-until date.",
  inactive: "Not active. Tenant can pay again unless admin locked.",
  past_due: "Payment issue / grace state.",
  comped: "Free access. No payment needed until comp is canceled.",
  banned: "Blocked status. Similar to inactive, but used for bad tenants.",
};

const draftFields: (keyof Project)[] = [
  "billing_status",
  "paid_until",
  "monthly_xrp_amount",
  "billing_wallet",
  "billing_destination_tag",
  "billing_last_tx_hash",
  "admin_locked",
  "admin_notes",
  "tenant_image_url",
  "tenant_image_path",
  "tenant_image_removed_by_admin",
  "tenant_image_admin_note",
];

function formatDate(value?: string | null) {
  if (!value) return "Not set";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function money(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "$0.00";
  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function xrp(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0 XRP";
  return `${number.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} XRP`;
}

function shortText(value?: string | null, start = 8, end = 6) {
  if (!value) return "N/A";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function csvEscape(value: unknown) {
  const clean = String(value ?? "").replace(/"/g, '""');
  return `"${clean}"`;
}

function exportPaymentsCsv(payments: Payment[]) {
  const headers = [
    "Date Paid",
    "Server",
    "Discord Guild ID",
    "Status",
    "Amount XRP",
    "USD Value",
    "XRP/USD",
    "Payer Wallet",
    "Destination Wallet",
    "TX Hash",
    "Paid Until",
    "Reference",
  ];

  const rows = payments.map((payment) => [
    payment.paid_at || payment.created_at || "",
    payment.server_name || "Unknown Server",
    payment.discord_guild_id || "",
    payment.status || "pending",
    payment.amount_xrp ?? "",
    payment.amount_usd ?? "",
    payment.xrp_usd_price ?? "",
    payment.payer_wallet || "",
    payment.destination_wallet || "",
    payment.tx_hash || "",
    payment.paid_until || "",
    payment.memo || payment.xaman_uuid || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `cocky-portal-payment-ledger-${stamp}.csv`;

  const nav = window.navigator as any;

  if (nav.msSaveOrOpenBlob) {
    nav.msSaveOrOpenBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

function copyRawToClipboard(value?: string | null) {
  if (!value) return;

  return navigator.clipboard?.writeText(value).catch(() => {});
}


function statusPillClass(status?: string | null) {
  const clean = String(status || "pending").toLowerCase();

  if (clean === "paid") {
    return "border-emerald-500 bg-emerald-500/15 text-emerald-300";
  }

  if (clean === "pending") {
    return "border-yellow-400 bg-yellow-400/15 text-yellow-300";
  }

  if (clean === "failed" || clean === "expired") {
    return "border-red-500 bg-red-500/15 text-red-300";
  }

  return "border-zinc-600 bg-zinc-800/40 text-zinc-300";
}


function isPaid(project: Project) {
  if (project.admin_locked) return false;
  if (project.billing_status === "comped") return true;
  if (project.billing_status !== "active") return false;
  if (!project.paid_until) return false;

  return new Date(project.paid_until).getTime() > Date.now();
}

function dateForInput(value?: string | null) {
  if (!value) return "";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function inputToIso(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function addDaysInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 16);
}

function normalizeProject(project: Project) {
  return {
    ...project,
    monthly_xrp_amount:
      project.monthly_xrp_amount === null ||
      project.monthly_xrp_amount === undefined
        ? 25
        : project.monthly_xrp_amount,
    billing_status: project.billing_status || "inactive",
    admin_locked: Boolean(project.admin_locked),
    tenant_image_removed_by_admin: Boolean(
      project.tenant_image_removed_by_admin,
    ),
  };
}

function hasUnsavedChanges(saved: Project, draft: Project) {
  return draftFields.some((field) => {
    const savedValue = (saved as any)[field];
    const draftValue = (draft as any)[field];

    return String(savedValue ?? "") !== String(draftValue ?? "");
  });
}

export default function SuperAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Project>>({});
  const [search, setSearch] = useState("");

  const [ledgerPayments, setLedgerPayments] = useState<Payment[]>([]);
  const [ledgerTotals, setLedgerTotals] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [expandedPaymentIds, setExpandedPaymentIds] = useState<string[]>([]);
  const [copiedValue, setCopiedValue] = useState("");

  async function loadProjects() {
    setLoading(true);
    setAuthChecked(false);
    setError("");
    setAuthError("");
    setLedgerError("");

    // Clear sensitive tenant data before auth is confirmed.
    setProjects([]);
    setDrafts({});
    setOpenProjectIds([]);
    setLedgerPayments([]);
    setLedgerTotals(null);

    try {
      const res = await fetch("/api/super-admin/projects/list", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const message = data.error || "Failed to load projects.";

        if (res.status === 401 || res.status === 403) {
          setAuthError(message);
        } else {
          setError(message);
        }

        return;
      }

      const loadedProjects = (data.projects || []).map(normalizeProject);
      setProjects(loadedProjects);

      const nextDrafts: Record<string, Project> = {};

      for (const project of loadedProjects) {
        nextDrafts[project.id] = { ...project };
      }

      setDrafts(nextDrafts);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to load projects.");
    } finally {
      setAuthChecked(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return projects;

    return projects.filter((project) => {
      return [
        project.name,
        project.owner_discord_id,
        project.discord_guild_id,
        project.billing_status,
        project.id,
        project.billing_last_tx_hash,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [projects, search]);

  function updateDraft(projectId: string, field: keyof Project, value: any) {
    setDrafts((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] || {}),
        [field]: value,
      },
    }));
  }

  function toggleOpen(projectId: string) {
    setOpenProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  async function saveProject(projectId: string) {
    const draft = drafts[projectId];

    if (!draft) return;

    setSavingId(projectId);
    setError("");
    setAuthError("");

    try {
      const res = await fetch("/api/super-admin/projects/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: projectId,
          billing_status: draft.billing_status || "inactive",
          paid_until: inputToIso(String(draft.paid_until || "")),
          monthly_xrp_amount: Number(draft.monthly_xrp_amount || 25),
          billing_wallet: draft.billing_wallet || null,
          billing_destination_tag:
            draft.billing_destination_tag === "" ||
            draft.billing_destination_tag === null ||
            draft.billing_destination_tag === undefined
              ? null
              : Number(draft.billing_destination_tag),
          billing_last_tx_hash: draft.billing_last_tx_hash || null,
          admin_locked: Boolean(draft.admin_locked),
          admin_notes: draft.admin_notes || null,

          tenant_image_url: draft.tenant_image_url || null,
          tenant_image_path: draft.tenant_image_path || null,
          tenant_image_removed_by_admin: Boolean(
            draft.tenant_image_removed_by_admin,
          ),
          tenant_image_admin_note: draft.tenant_image_admin_note || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const message = data.error || "Failed to save project.";

        if (res.status === 401 || res.status === 403) {
          setAuthError(message);
          setProjects([]);
          setDrafts({});
          setOpenProjectIds([]);
        } else {
          setError(message);
        }

        return;
      }

      await loadProjects();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to save project.");
    } finally {
      setSavingId("");
    }
  }

  function resetDraft(projectId: string) {
    const saved = projects.find((project) => project.id === projectId);
    if (!saved) return;

    setDrafts((current) => ({
      ...current,
      [projectId]: { ...normalizeProject(saved) },
    }));
  }

  function quickExtend(projectId: string, days: number) {
    updateDraft(projectId, "paid_until", addDaysInputValue(days));
    updateDraft(projectId, "billing_status", "active");
    updateDraft(projectId, "admin_locked", false);
  }

  function compProject(projectId: string) {
    updateDraft(projectId, "billing_status", "comped");
    updateDraft(projectId, "admin_locked", false);
  }

  function cancelComp(projectId: string) {
    updateDraft(projectId, "billing_status", "inactive");
  }

  function lockProject(projectId: string) {
    // Hard admin lock. This should override payment/comp until you unlock it.
    updateDraft(projectId, "admin_locked", true);
  }

  function unlockProject(projectId: string) {
    updateDraft(projectId, "admin_locked", false);
  }

  function deactivateProject(projectId: string) {
    updateDraft(projectId, "billing_status", "inactive");
    updateDraft(projectId, "paid_until", "");
    updateDraft(projectId, "admin_locked", false);
  }

  function removeTenantImage(projectId: string) {
    updateDraft(projectId, "tenant_image_url", "");
    updateDraft(projectId, "tenant_image_path", "");
    updateDraft(projectId, "tenant_image_removed_by_admin", true);

    const currentNote = String(
      drafts[projectId]?.tenant_image_admin_note || "",
    );
    if (!currentNote) {
      updateDraft(
        projectId,
        "tenant_image_admin_note",
        "Image removed by super admin.",
      );
    }
  }

  function restoreTenantImageFlag(projectId: string) {
    updateDraft(projectId, "tenant_image_removed_by_admin", false);
  }

  async function loadPaymentLedger() {
    setLedgerLoading(true);
    setLedgerError("");

    try {
      const res = await fetch("/api/super-admin/payments/list", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setLedgerError(data.error || "Failed to load payment ledger.");
        return;
      }

      setLedgerPayments(data.payments || []);
      setLedgerTotals(data.totals || null);
    } catch (err: any) {
      console.error(err);
      setLedgerError(err?.message || "Failed to load payment ledger.");
    } finally {
      setLedgerLoading(false);
    }
  }

  const filteredLedgerPayments = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();

    return ledgerPayments.filter((payment) => {
      const status = String(payment.status || "pending").toLowerCase();

      const statusMatches =
        ledgerStatusFilter === "all" ||
        (ledgerStatusFilter === "failed_expired" &&
          ["failed", "expired"].includes(status)) ||
        status === ledgerStatusFilter;

      const searchMatches =
        !q ||
        [
          payment.server_name,
          payment.discord_guild_id,
          payment.payer_wallet,
          payment.tx_hash,
          payment.memo,
          payment.xaman_uuid,
          payment.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));

      return statusMatches && searchMatches;
    });
  }, [ledgerPayments, ledgerSearch, ledgerStatusFilter]);

  function togglePaymentOpen(paymentId: string) {
    setExpandedPaymentIds((current) =>
      current.includes(paymentId)
        ? current.filter((id) => id !== paymentId)
        : [...current, paymentId],
    );
  }

  async function copyPaymentValue(value?: string | null) {
    if (!value) return;

    await copyRawToClipboard(value);
    setCopiedValue(value);

    window.setTimeout(() => {
      setCopiedValue((current) => (current === value ? "" : current));
    }, 1400);
  }

  const activeCount = projects.filter(isPaid).length;
  const lockedCount = projects.filter((project) => project.admin_locked).length;
  const expiredCount = projects.filter(
    (project) => !isPaid(project) && !project.admin_locked,
  ).length;

  return (
    <main className="min-h-screen bg-[#071310] pb-24 text-[#fff4d8]">
      <CockyHeader mode="super-admin" showDiscordLogin />

      {!authChecked && (
        <>
          <div className="mx-auto max-w-4xl px-5 py-10">
            <div className="rounded-3xl border border-cyan-500/40 bg-[#15110c] p-8 text-center shadow-[0_0_40px_rgba(34,211,238,0.12)]">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-300">
                Checking Access
              </p>

              <h1 className="mt-4 text-4xl font-black text-white">
                Loading super-admin access...
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
                Tenant and billing information is hidden until your Discord
                admin session is verified.
              </p>
            </div>
          </div>

          <CockyFooter />
        </>
      )}

      {authChecked && authError && (
        <>
          <div className="mx-auto max-w-4xl px-5 py-10">
            <div className="rounded-3xl border border-red-500/50 bg-[#15110c] p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.12)]">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-red-300">
                Super Admin Locked
              </p>

              <h1 className="mt-4 text-4xl font-black text-white">
                Discord login required.
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
                You must connect the authorized super-admin Discord account
                before tenant, billing, or project information can be displayed.
              </p>

              <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-black text-red-300">
                {authError}
              </p>

              <a
                href="/api/discord/login?return_to=/super-admin"
                className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-6 py-4 text-sm font-black uppercase text-black hover:bg-cyan-300"
              >
                Connect Discord
              </a>
            </div>
          </div>

          <CockyFooter />
        </>
      )}

      {authChecked && !authError && (
        <>
          <div className="mx-auto max-w-7xl px-5 py-6">
            <section className="relative overflow-hidden rounded-3xl border border-[#3a2b16] bg-black px-8 py-12 shadow-[0_0_55px_rgba(34,211,238,0.08)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,0.17),transparent_38%),radial-gradient(circle_at_20%_75%,rgba(250,204,21,0.12),transparent_34%)]" />
              <div className="absolute inset-0 bg-black/60" />

              <div className="relative z-10">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.45em] text-cyan-400">
                  Super Admin
                </p>

                <h1 className="max-w-4xl text-5xl font-black leading-[0.95] text-white md:text-6xl">
                  Manage tenants, billing, and access.
                </h1>

                <p className="mt-5 max-w-2xl text-zinc-300">
                  Control Cocky Portal Discord projects, XRP subscription
                  status, monthly pricing, lock status, tenant images, and
                  payment records.
                </p>
              </div>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                  Tenants
                </p>
                <p className="mt-2 text-4xl font-black">{projects.length}</p>
              </div>

              <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-400">
                  Active / Comped
                </p>
                <p className="mt-2 text-4xl font-black">{activeCount}</p>
              </div>

              <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">
                  Admin Locked
                </p>
                <p className="mt-2 text-4xl font-black">{lockedCount}</p>
              </div>

              <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-400">
                  Expired / Inactive
                </p>
                <p className="mt-2 text-4xl font-black">{expiredCount}</p>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-white">
                    Tenant Projects
                  </h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Preview changes, then click Save. Comp is free access. +30
                    days is temporary paid-style access. Lock is a hard admin
                    hold and must be manually unlocked.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tenant / guild / owner"
                    className="w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none sm:w-80"
                  />

                  <button
                    onClick={loadProjects}
                    disabled={loading}
                    className="rounded-2xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 text-sm font-black uppercase text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-60"
                  >
                    {loading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-5 rounded-2xl border border-red-500 bg-red-500/10 p-4 text-sm font-black text-red-300">
                  {error}
                </div>
              )}

              {ledgerError && (
                <div className="mt-5 rounded-2xl border border-red-500 bg-red-500/10 p-4 text-sm font-black text-red-300">
                  {ledgerError}
                </div>
              )}

              <div className="mt-6 space-y-4">
                {loading ? (
                  <p className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-zinc-400">
                    Loading tenants...
                  </p>
                ) : filteredProjects.length === 0 ? (
                  <p className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-zinc-400">
                    No projects found.
                  </p>
                ) : (
                  filteredProjects.map((project) => {
                    const draft = drafts[project.id] || project;
                    const open = openProjectIds.includes(project.id);
                    const paid = isPaid(draft);
                    const unsaved = hasUnsavedChanges(project, draft);

                    return (
                      <div
                        key={project.id}
                        className={`rounded-3xl border p-5 ${
                          unsaved
                            ? "border-yellow-400/50 bg-yellow-400/5"
                            : "border-zinc-800 bg-black/40"
                        }`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <button
                            onClick={() => toggleOpen(project.id)}
                            className="flex gap-4 text-left"
                          >
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black/60">
                              {draft.tenant_image_url ? (
                                <img
                                  src={draft.tenant_image_url}
                                  alt={draft.name || "Tenant"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-xl font-black text-cyan-300">
                                  {(draft.name || "T")
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </span>
                              )}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-2xl font-black text-white">
                                  {draft.name || "Unnamed Project"}
                                </p>

                                <span
                                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                                    paid
                                      ? "bg-emerald-500 text-black"
                                      : draft.admin_locked
                                        ? "bg-red-500 text-white"
                                        : "bg-yellow-400 text-black"
                                  }`}
                                >
                                  {draft.admin_locked
                                    ? "Locked"
                                    : paid
                                      ? "Active"
                                      : "Inactive"}
                                </span>

                                <span className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-black uppercase text-zinc-400">
                                  {draft.billing_status || "inactive"}
                                </span>

                                {unsaved && (
                                  <span className="rounded-full border border-yellow-400 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase text-yellow-300">
                                    Unsaved
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 text-xs text-zinc-500">
                                Owner: {draft.owner_discord_id || "N/A"} •
                                Guild: {draft.discord_guild_id || "N/A"}
                              </p>

                              <p className="mt-1 text-xs text-zinc-500">
                                Paid until:{" "}
                                {formatDate(String(draft.paid_until || ""))}
                              </p>

                              {unsaved && (
                                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-yellow-300">
                                  Preview changed — click Save to apply
                                </p>
                              )}
                            </div>
                          </button>

                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`/project/${project.id}`}
                              className="rounded-xl border border-cyan-500 px-4 py-2 text-xs font-black uppercase text-cyan-300 hover:bg-cyan-500/10"
                            >
                              Open
                            </a>

                            <button
                              onClick={() => quickExtend(project.id, 30)}
                              className="rounded-xl border border-emerald-500 px-4 py-2 text-xs font-black uppercase text-emerald-300 hover:bg-emerald-500/10"
                            >
                              +30 Days
                            </button>

                            {draft.billing_status === "comped" ? (
                              <button
                                onClick={() => cancelComp(project.id)}
                                className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-black uppercase text-yellow-300 hover:bg-yellow-400/10"
                              >
                                Cancel Comp
                              </button>
                            ) : (
                              <button
                                onClick={() => compProject(project.id)}
                                className="rounded-xl border border-yellow-400 px-4 py-2 text-xs font-black uppercase text-yellow-300 hover:bg-yellow-400/10"
                              >
                                Comp
                              </button>
                            )}

                            {draft.admin_locked ? (
                              <button
                                onClick={() => unlockProject(project.id)}
                                className="rounded-xl border border-cyan-500 px-4 py-2 text-xs font-black uppercase text-cyan-300 hover:bg-cyan-500/10"
                              >
                                Unlock
                              </button>
                            ) : (
                              <button
                                onClick={() => lockProject(project.id)}
                                className="rounded-xl border border-red-500 px-4 py-2 text-xs font-black uppercase text-red-300 hover:bg-red-500/10"
                              >
                                Lock
                              </button>
                            )}

                            <button
                              onClick={() => deactivateProject(project.id)}
                              className="rounded-xl border border-zinc-500 px-4 py-2 text-xs font-black uppercase text-zinc-300 hover:bg-zinc-500/10"
                            >
                              Deactivate
                            </button>

                            {unsaved && (
                              <button
                                onClick={() => resetDraft(project.id)}
                                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-black uppercase text-zinc-400 hover:bg-zinc-700/20"
                              >
                                Reset
                              </button>
                            )}

                            <button
                              onClick={() => saveProject(project.id)}
                              disabled={savingId === project.id}
                              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black uppercase text-black hover:bg-emerald-400 disabled:opacity-60"
                            >
                              {savingId === project.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>

                        {open && (
                          <div className="mt-5 grid gap-4 border-t border-zinc-800 pt-5 lg:grid-cols-2">
                            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 lg:col-span-2">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                                Status Preview
                              </p>

                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Access
                                  </p>
                                  <p
                                    className={`mt-1 font-black ${
                                      paid ? "text-emerald-300" : "text-red-300"
                                    }`}
                                  >
                                    {draft.admin_locked
                                      ? "Admin locked"
                                      : paid
                                        ? "Active"
                                        : "Inactive"}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Status Meaning
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-300">
                                    {
                                      BILLING_HELP[
                                        String(
                                          draft.billing_status || "inactive",
                                        )
                                      ]
                                    }
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Monthly Price
                                  </p>
                                  <p className="mt-1 font-black text-white">
                                    {xrp(draft.monthly_xrp_amount || 25)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Billing Status
                              </label>
                              <select
                                value={draft.billing_status || "inactive"}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "billing_status",
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              >
                                {BILLING_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Paid Until
                              </label>
                              <input
                                type="datetime-local"
                                value={dateForInput(
                                  String(draft.paid_until || ""),
                                )}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "paid_until",
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Monthly XRP Amount
                              </label>
                              <input
                                value={String(draft.monthly_xrp_amount || 25)}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "monthly_xrp_amount",
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Destination Tag
                              </label>
                              <input
                                value={String(
                                  draft.billing_destination_tag || "",
                                )}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "billing_destination_tag",
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Billing Wallet
                              </label>
                              <input
                                value={draft.billing_wallet || ""}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "billing_wallet",
                                    e.target.value,
                                  )
                                }
                                placeholder="r..."
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Last Payment TX Hash
                              </label>
                              <input
                                value={draft.billing_last_tx_hash || ""}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "billing_last_tx_hash",
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <label className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                              <input
                                type="checkbox"
                                checked={Boolean(draft.admin_locked)}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "admin_locked",
                                    e.target.checked,
                                  )
                                }
                              />
                              <span className="text-sm font-black uppercase text-red-300">
                                Admin Locked
                              </span>
                            </label>

                            <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4 lg:col-span-2">
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                                Tenant Image
                              </p>

                              <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
                                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black/60">
                                  {draft.tenant_image_url ? (
                                    <img
                                      src={draft.tenant_image_url}
                                      alt={draft.name || "Tenant"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-3xl font-black text-cyan-300">
                                      {(draft.name || "T").slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                </div>

                                <div className="flex-1">
                                  <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                    Tenant Image URL
                                  </label>
                                  <input
                                    value={draft.tenant_image_url || ""}
                                    onChange={(e) =>
                                      updateDraft(
                                        project.id,
                                        "tenant_image_url",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="https://..."
                                    className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                                  />

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => removeTenantImage(project.id)}
                                      className="rounded-xl border border-red-500 px-4 py-2 text-xs font-black uppercase text-red-300 hover:bg-red-500/10"
                                    >
                                      Remove Inappropriate Image
                                    </button>

                                    <button
                                      onClick={() =>
                                        restoreTenantImageFlag(project.id)
                                      }
                                      className="rounded-xl border border-cyan-500 px-4 py-2 text-xs font-black uppercase text-cyan-300 hover:bg-cyan-500/10"
                                    >
                                      Allow New Image
                                    </button>
                                  </div>

                                  {draft.tenant_image_removed_by_admin && (
                                    <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-black text-red-300">
                                      Image removed by admin. Tenant can upload or replace after you allow it.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Tenant Image Admin Note
                              </label>
                              <textarea
                                value={draft.tenant_image_admin_note || ""}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "tenant_image_admin_note",
                                    e.target.value,
                                  )
                                }
                                rows={2}
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                Admin Notes
                              </label>
                              <textarea
                                value={draft.admin_notes || ""}
                                onChange={(e) =>
                                  updateDraft(
                                    project.id,
                                    "admin_notes",
                                    e.target.value,
                                  )
                                }
                                rows={4}
                                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-white">
                    Payment Ledger
                  </h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Master payment list for bookkeeping and tax records. This is
                    a single ledger across every tenant/server. Click wallet/TX
                    values to copy, or use View for full details.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search server / wallet / tx / reference"
                    className="w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none sm:w-80"
                  />

                  <select
                    value={ledgerStatusFilter}
                    onChange={(e) => setLedgerStatusFilter(e.target.value)}
                    className="rounded-2xl border border-zinc-700 bg-black/60 px-5 py-3 text-sm font-bold text-white outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid only</option>
                    <option value="pending">Pending only</option>
                    <option value="failed_expired">Failed / expired</option>
                  </select>

                  <button
                    onClick={loadPaymentLedger}
                    disabled={ledgerLoading}
                    className="rounded-2xl border border-yellow-400 bg-yellow-400/10 px-5 py-3 text-sm font-black uppercase text-yellow-300 hover:bg-yellow-400/20 disabled:opacity-60"
                  >
                    {ledgerLoading ? "Loading..." : "Load Ledger"}
                  </button>

                  <button
                    onClick={() => exportPaymentsCsv(filteredLedgerPayments)}
                    disabled={filteredLedgerPayments.length === 0}
                    className="rounded-2xl border border-emerald-500 bg-emerald-500/10 px-5 py-3 text-sm font-black uppercase text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {ledgerTotals && (
                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">
                      Records
                    </p>
                    <p className="mt-2 text-3xl font-black">
                      {ledgerTotals.total_records || 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">
                      Paid
                    </p>
                    <p className="mt-2 text-3xl font-black">
                      {ledgerTotals.paid_count || 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-yellow-400">
                      XRP Total
                    </p>
                    <p className="mt-2 text-3xl font-black">
                      {xrp(ledgerTotals.total_xrp_paid || 0)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">
                      USD Total
                    </p>
                    <p className="mt-2 text-3xl font-black">
                      {money(ledgerTotals.total_usd_paid || 0)}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-800 bg-black/40">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Date Paid</th>
                      <th className="px-4 py-3">Server</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">XRP</th>
                      <th className="px-4 py-3">USD Value</th>
                      <th className="px-4 py-3">XRP/USD</th>
                      <th className="px-4 py-3">Payer Wallet</th>
                      <th className="px-4 py-3">TX Hash</th>
                      <th className="px-4 py-3">Paid Until</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLedgerPayments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-4 py-5 text-center text-zinc-500"
                        >
                          No payment records match this filter. Click Load Ledger or change filters.
                        </td>
                      </tr>
                    ) : (
                      filteredLedgerPayments.map((payment) => {
                        const isPaymentOpen = expandedPaymentIds.includes(
                          payment.id,
                        );

                        return (
                          <>
                            <tr
                              key={payment.id}
                              className="border-b border-zinc-900 text-zinc-300"
                            >
                              <td className="whitespace-nowrap px-4 py-3">
                                {formatDate(
                                  payment.paid_at || payment.created_at,
                                )}
                              </td>

                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {payment.server_image_url ? (
                                    <img
                                      src={payment.server_image_url}
                                      alt={payment.server_name || "Server"}
                                      className="h-8 w-8 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-black text-xs font-black text-cyan-300">
                                      {(payment.server_name || "?").slice(0, 1)}
                                    </div>
                                  )}

                                  <div>
                                    <p className="font-black text-white">
                                      {payment.server_name || "Unknown Server"}
                                    </p>
                                    <p className="text-[10px] text-zinc-600">
                                      {payment.discord_guild_id || "No guild ID"}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusPillClass(
                                    payment.status,
                                  )}`}
                                >
                                  {payment.status || "pending"}
                                </span>
                              </td>

                              <td className="px-4 py-3 font-black text-yellow-300">
                                {xrp(payment.amount_xrp)}
                              </td>

                              <td className="px-4 py-3">
                                {payment.amount_usd === null ||
                                payment.amount_usd === undefined
                                  ? "Not captured"
                                  : money(payment.amount_usd)}
                              </td>

                              <td className="px-4 py-3">
                                {payment.xrp_usd_price === null ||
                                payment.xrp_usd_price === undefined
                                  ? "Not captured"
                                  : money(payment.xrp_usd_price)}
                              </td>

                              <td
                                className="px-4 py-3 font-mono"
                                title={payment.payer_wallet || ""}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyPaymentValue(payment.payer_wallet)
                                  }
                                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-left text-cyan-300 hover:bg-cyan-500/20"
                                >
                                  {copiedValue === payment.payer_wallet
                                    ? "Copied"
                                    : shortText(payment.payer_wallet)}
                                </button>
                              </td>

                              <td
                                className="px-4 py-3 font-mono"
                                title={payment.tx_hash || ""}
                              >
                                <button
                                  type="button"
                                  onClick={() => copyPaymentValue(payment.tx_hash)}
                                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-left text-cyan-300 hover:bg-cyan-500/20"
                                >
                                  {copiedValue === payment.tx_hash
                                    ? "Copied"
                                    : shortText(payment.tx_hash)}
                                </button>
                              </td>

                              <td className="whitespace-nowrap px-4 py-3">
                                {formatDate(payment.paid_until)}
                              </td>

                              <td
                                className="px-4 py-3 font-mono"
                                title={payment.memo || payment.xaman_uuid || ""}
                              >
                                {shortText(payment.memo || payment.xaman_uuid)}
                              </td>

                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => togglePaymentOpen(payment.id)}
                                  className="rounded-xl border border-cyan-500 px-3 py-2 text-[10px] font-black uppercase text-cyan-300 hover:bg-cyan-500/10"
                                >
                                  {isPaymentOpen ? "Hide" : "View"}
                                </button>
                              </td>
                            </tr>

                            {isPaymentOpen && (
                              <tr
                                key={`${payment.id}-details`}
                                className="border-b border-zinc-900 bg-black/60"
                              >
                                <td colSpan={11} className="px-4 py-4">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                                      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                                        Full Wallet / TX Info
                                      </p>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        Payer Wallet
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(payment.payer_wallet)
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-cyan-300 hover:underline"
                                      >
                                        {payment.payer_wallet || "N/A"}
                                      </button>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        Destination Wallet
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(
                                            payment.destination_wallet,
                                          )
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-cyan-300 hover:underline"
                                      >
                                        {payment.destination_wallet || "N/A"}
                                      </button>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        TX Hash
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(payment.tx_hash)
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-cyan-300 hover:underline"
                                      >
                                        {payment.tx_hash || "N/A"}
                                      </button>
                                    </div>

                                    <div className="rounded-2xl border border-zinc-800 bg-black/50 p-4">
                                      <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
                                        Payment Reference
                                      </p>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        Memo / Reference
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(
                                            payment.memo || payment.xaman_uuid,
                                          )
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-yellow-300 hover:underline"
                                      >
                                        {payment.memo ||
                                          payment.xaman_uuid ||
                                          "N/A"}
                                      </button>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        Project ID
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(payment.project_id)
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-zinc-300 hover:underline"
                                      >
                                        {payment.project_id || "N/A"}
                                      </button>

                                      <p className="mt-3 text-xs text-zinc-500">
                                        Xaman UUID
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyPaymentValue(payment.xaman_uuid)
                                        }
                                        className="mt-1 break-all text-left font-mono text-sm text-zinc-300 hover:underline"
                                      >
                                        {payment.xaman_uuid || "N/A"}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <CockyFooter />
        </>
      )}
    </main>
  );
}
