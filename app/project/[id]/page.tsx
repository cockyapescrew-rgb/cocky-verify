"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignClient from "@walletconnect/sign-client";
import { WalletConnectModal } from "@walletconnect/modal";

type Role = {
  id: string;
  name: string;
};

type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string;
};

type Project = {
  id: string;
  name: string;
  owner_discord_id?: string;
  discord_guild_id?: string | null;
};

type Collection = {
  id: string;
  issuer: string;
  taxon: string;
  name?: string | null;
  nft_count: number;
  selected: boolean;
};

type TraitRecord = {
  issuer: string;
  taxon: string;
  trait_type: string;
  trait_value: string;
  count: number;
};

type Requirement = {
  requirement_type: string;
  issuer: string;
  taxon: string;
  min_nft_count: string;
  trait_type: string;
  trait_value: string;
};

type RequirementGroup = {
  group_id: number;
  requirements: Requirement[];
};

type SavedRequirement = {
  id: string;
  requirement_type: string;
  issuer?: string | null;
  taxon?: string | null;
  min_nft_count?: number | null;
  trait_type?: string | null;
  trait_value?: string | null;
  logic?: string | null;
  group_id?: number | null;
  group_operator?: string | null;
};

type SavedRequirementGroup = {
  group_id: number;
  group_operator?: string | null;
  requirements: SavedRequirement[];
};

type SavedRule = {
  id: string;
  discord_role_id: string;
  role_name?: string | null;
  created_at?: string;
  role_rule_requirements?: SavedRequirement[];
  requirement_groups?: SavedRequirementGroup[];
};

type ScanResult = {
  success?: boolean;
  issuer?: string;
  total_nfts?: number;
  collections?: any[];
  metadata_found?: number;
  failed_metadata?: number;
  traits_found?: number;
  trait_types_found?: number;
  error?: string;
  details?: any;
};

type SingleScanResult = {
  success?: boolean;
  issuer?: string;
  taxon?: string;
  nft_id?: string;
  metadata_uri?: string;
  name?: string;
  image?: string;
  traits_found?: number;
  traits?: { trait_type: string; trait_value: string }[];
  error?: string;
  details?: any;
};

const SOCIALS = [
  { name: "Telegram", href: "https://t.me/cockyapes/1", icon: "/tg.png" },
  {
    name: "Discord",
    href: "https://discord.gg/6eyJsfxq",
    icon: "/discord.png",
  },
  { name: "X", href: "https://x.com/cockyapelaserco?s=21", icon: "/x.png" },
  {
    name: "Instagram",
    href: "https://www.instagram.com/calco.cafe?igsh=NTc4MTIwNjQ2YQ%3D%3D&utm_source=qr",
    icon: "/ig.png",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@calco.cafe?_r=1&_t=ZP-96BEytbnaVb",
    icon: "/tiktok.png",
  },
];

const TRACKS = ["/lofi.mp3", "/lofi2.mp3", "/lofi3.mp3"];

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const WALLETCONNECT_METADATA = {
  name: "Cocky.Cafe",
  description: "Cocky.Cafe XRPL Discord verification platform",
  url: "https://cocky.cafe",
  icons: ["https://cocky.cafe/cblogo.png"],
};

function getXrplAddressFromSession(session: any) {
  const xrplAccounts = session?.namespaces?.xrpl?.accounts || [];
  const firstAccount = xrplAccounts[0] || "";

  if (!firstAccount) return "";

  const parts = String(firstAccount).split(":");
  return parts[parts.length - 1] || "";
}

function createBlankRequirement(): Requirement {
  return {
    requirement_type: "nft_count",
    issuer: "",
    taxon: "",
    min_nft_count: "1",
    trait_type: "",
    trait_value: "",
  };
}

function createBlankGroup(groupId: number): RequirementGroup {
  return {
    group_id: groupId,
    requirements: [createBlankRequirement()],
  };
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const xamanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const walletConnectClientRef = useRef<SignClient | null>(null);
  const walletConnectModalRef = useRef<WalletConnectModal | null>(null);
  const walletConnectSessionTopicRef = useRef("");

  const [project, setProject] = useState<Project | null>(null);
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [traits, setTraits] = useState<TraitRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [issuerInput, setIssuerInput] = useState("");
  const [taxonInput, setTaxonInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [advancedCollectionKey, setAdvancedCollectionKey] = useState("");
  const [advancedNftId, setAdvancedNftId] = useState("");
  const [advancedMetadataUri, setAdvancedMetadataUri] = useState("");
  const [advancedScanning, setAdvancedScanning] = useState(false);
  const [advancedScanResult, setAdvancedScanResult] =
    useState<SingleScanResult | null>(null);
  const [openCollectionId, setOpenCollectionId] = useState("");
  const [ruleSaved, setRuleSaved] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState("");
  const [radioOn, setRadioOn] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);

  const [wallet, setWallet] = useState("");
  const [walletProvider, setWalletProvider] = useState<"xaman" | "joey" | "">(
    "",
  );
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletQr, setWalletQr] = useState("");
  const [walletDeepLink, setWalletDeepLink] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletModalTitle, setWalletModalTitle] = useState("Connect Wallet");
  const [walletMode, setWalletMode] = useState<"xaman" | "joey" | "tip">(
    "xaman",
  );

  const [tipAmount, setTipAmount] = useState("5");

  const [requirementGroups, setRequirementGroups] = useState<
    RequirementGroup[]
  >([createBlankGroup(1)]);

  const [openRoleIds, setOpenRoleIds] = useState<string[]>([]);
  const [openGroupIds, setOpenGroupIds] = useState<number[]>([1]);
  const [openRequirementKeys, setOpenRequirementKeys] = useState<string[]>([
    "1-0",
  ]);

  const discordDisplayName =
    discordUser?.global_name || discordUser?.username || "Discord User";

  const discordAvatarUrl =
    discordUser?.avatar && discordUser?.id
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => a.name.localeCompare(b.name));
  }, [roles]);

  const sortedCollections = useMemo(() => {
    return [...collections].sort((a, b) => {
      const nameA = a.name || `Taxon ${a.taxon}`;
      const nameB = b.name || `Taxon ${b.taxon}`;

      return nameA.localeCompare(nameB);
    });
  }, [collections]);

  const selectedAdvancedCollection = useMemo(() => {
    if (!advancedCollectionKey) return null;

    const [issuer, taxon] = advancedCollectionKey.split("|");

    return (
      collections.find(
        (collection) =>
          collection.issuer === issuer &&
          String(collection.taxon) === String(taxon),
      ) || null
    );
  }, [advancedCollectionKey, collections]);

  const traitTypes = useMemo(() => {
    return Array.from(new Set(traits.map((t) => t.trait_type))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [traits]);

  function getTraitValues(type: string) {
    return Array.from(
      new Set(
        traits
          .filter((t) => t.trait_type === type)
          .map((t) => t.trait_value),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  function shortWallet(address: string) {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function saveConnectedWallet(address: string, provider: "xaman" | "joey") {
    setWallet(address);
    setWalletProvider(provider);

    if (typeof window !== "undefined") {
      localStorage.setItem("cocky_connected_wallet", address);
      localStorage.setItem("cocky_connected_wallet_provider", provider);
    }
  }

  async function loadDiscordUser() {
    try {
      const res = await fetch("/api/discord/me", {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.loggedIn && data.user) {
        setDiscordUser(data.user);
      }
    } catch (err) {
      console.warn("Discord user load skipped", err);
    }
  }

  async function disconnectWallet() {
    const client = walletConnectClientRef.current;
    const topic = walletConnectSessionTopicRef.current;

    if (client && topic) {
      try {
        await client.disconnect({
          topic,
          reason: {
            code: 6000,
            message: "User disconnected wallet",
          },
        });
      } catch (err) {
        console.warn("WalletConnect disconnect skipped", err);
      }
    }

    if (xamanPollRef.current) {
      clearInterval(xamanPollRef.current);
      xamanPollRef.current = null;
    }

    walletConnectSessionTopicRef.current = "";
    setWallet("");
    setWalletProvider("");
    setWalletQr("");
    setWalletDeepLink("");
    setWalletLoading(false);
    setWalletModalOpen(false);

    if (typeof window !== "undefined") {
      localStorage.removeItem("cocky_connected_wallet");
      localStorage.removeItem("cocky_connected_wallet_provider");
      localStorage.removeItem("cocky_walletconnect_topic");
    }
  }

  async function initWalletConnect() {
    if (!WALLETCONNECT_PROJECT_ID) {
      throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
    }

    if (!walletConnectClientRef.current) {
      walletConnectClientRef.current = await SignClient.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: WALLETCONNECT_METADATA,
      });

      walletConnectClientRef.current.on("session_delete", () => {
        walletConnectSessionTopicRef.current = "";
        setWallet("");
        setWalletProvider("");

        if (typeof window !== "undefined") {
          localStorage.removeItem("cocky_connected_wallet");
          localStorage.removeItem("cocky_connected_wallet_provider");
          localStorage.removeItem("cocky_walletconnect_topic");
        }
      });
    }

    if (!walletConnectModalRef.current) {
      walletConnectModalRef.current = new WalletConnectModal({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: ["xrpl:0"],
      });
    }

    return walletConnectClientRef.current;
  }

  async function loadProject() {
    const { id } = await params;

    const projectRes = await fetch(`/api/projects/get?id=${id}`);
    const projectData = await projectRes.json();

    if (projectData.project) {
      setProject(projectData.project);
    }

    if (projectData.project?.discord_guild_id) {
      await loadRoles(projectData.project.discord_guild_id);
    }

    await loadCollections();
    await loadRules();
  }

  async function loadCollections() {
    const { id } = await params;
    const res = await fetch(`/api/collections/list?project_id=${id}`);
    const data = await res.json();

    if (data.collections) setCollections(data.collections);
  }

  async function loadRules() {
    const { id } = await params;
    const res = await fetch(`/api/rules/list?project_id=${id}`);
    const data = await res.json();

    if (data.rules) setSavedRules(data.rules);
  }

  async function loadRoles(serverId: string) {
    const res = await fetch(`/api/discord/roles?guild_id=${serverId}`);
    const data = await res.json();

    if (data.roles) {
      setRoles(data.roles.filter((role: Role) => role.name !== "@everyone"));
    }
  }

  async function loadTraits(issuer: string, taxon: string) {
    const { id } = await params;

    const res = await fetch(
      `/api/traits/list?project_id=${id}&issuer=${issuer}&taxon=${taxon}`,
    );

    const data = await res.json();

    if (data.traits) setTraits(data.traits);
  }

  useEffect(() => {
    loadProject();
    loadDiscordUser();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedWallet = localStorage.getItem("cocky_connected_wallet") || "";
    const savedProvider =
      (localStorage.getItem("cocky_connected_wallet_provider") as
        | "xaman"
        | "joey"
        | "") || "";
    const savedTopic = localStorage.getItem("cocky_walletconnect_topic") || "";

    if (savedWallet) {
      setWallet(savedWallet);
      setWalletProvider(savedProvider === "joey" ? "joey" : "xaman");
    }

    if (savedProvider === "joey") {
      initWalletConnect()
        .then((client) => {
          const sessions = client.session.getAll();
          const savedSession = sessions.find(
            (session: any) => session.topic === savedTopic,
          );
          const fallbackSession = sessions[0];
          const session = savedSession || fallbackSession;
          const address = getXrplAddressFromSession(session);

          if (session?.topic) {
            walletConnectSessionTopicRef.current = session.topic;
            localStorage.setItem("cocky_walletconnect_topic", session.topic);
          }

          if (address) {
            saveConnectedWallet(address, "joey");
          }
        })
        .catch((err) => console.warn("WalletConnect restore skipped", err));
    }

    return () => {
      if (xamanPollRef.current) {
        clearInterval(xamanPollRef.current);
        xamanPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.src = TRACKS[trackIndex];

    if (radioOn) {
      audioRef.current.play().catch(() => {});
    }
  }, [trackIndex]);

  async function toggleRadio() {
    if (!audioRef.current) return;

    if (radioOn) {
      audioRef.current.pause();
      setRadioOn(false);
    } else {
      audioRef.current.src = TRACKS[trackIndex];
      await audioRef.current.play().catch(() => {});
      setRadioOn(true);
    }
  }

  function nextTrack() {
    setTrackIndex((prev) => (prev + 1) % TRACKS.length);
  }

  async function connectXaman() {
    try {
      if (xamanPollRef.current) {
        clearInterval(xamanPollRef.current);
        xamanPollRef.current = null;
      }

      setWalletMode("xaman");
      setWalletModalTitle("Connect with Xaman");
      setWalletLoading(true);
      setWalletModalOpen(true);
      setWalletQr("");
      setWalletDeepLink("");

      const res = await fetch("/api/xaman/login");

      if (!res.ok) {
        throw new Error("Failed to create Xaman login request");
      }

      const data = await res.json();

      if (!data.uuid) {
        throw new Error("Missing Xaman payload UUID");
      }

      setWalletQr(data.qr || "");
      setWalletDeepLink(data.deepLink || "");
      setWalletLoading(false);

      xamanPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/xaman/status/${data.uuid}`);

          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          if (statusData.signed && statusData.wallet) {
            if (xamanPollRef.current) {
              clearInterval(xamanPollRef.current);
              xamanPollRef.current = null;
            }

            saveConnectedWallet(statusData.wallet, "xaman");
            setWalletLoading(false);
            setWalletModalOpen(false);
          }

          if (statusData.expired) {
            if (xamanPollRef.current) {
              clearInterval(xamanPollRef.current);
              xamanPollRef.current = null;
            }

            setWalletLoading(false);
          }
        } catch (err) {
          console.warn("Xaman polling stopped", err);

          if (xamanPollRef.current) {
            clearInterval(xamanPollRef.current);
            xamanPollRef.current = null;
          }

          setWalletLoading(false);
        }
      }, 2000);
    } catch (err) {
      console.error(err);
      setWalletLoading(false);
      alert("Failed to open Xaman login.");
    }
  }

  async function connectJoey() {
    try {
      setWalletMode("joey");
      setWalletModalTitle("Connect with Joey");
      setWalletQr("");
      setWalletDeepLink("");
      setWalletLoading(true);
      setWalletModalOpen(true);

      const client = await initWalletConnect();

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          xrpl: {
            methods: ["xrpl_signTransaction"],
            chains: ["xrpl:0"],
            events: ["chainChanged", "accountsChanged"],
          },
        },
      });

      if (uri) {
        walletConnectModalRef.current?.openModal({ uri });
      }

      const session = await approval();
      walletConnectModalRef.current?.closeModal();

      const address = getXrplAddressFromSession(session);

      if (!address) {
        throw new Error("Joey connected, but no XRPL wallet address returned.");
      }

      walletConnectSessionTopicRef.current = session.topic;

      if (typeof window !== "undefined") {
        localStorage.setItem("cocky_walletconnect_topic", session.topic);
      }

      saveConnectedWallet(address, "joey");
      setWalletLoading(false);
      setWalletModalOpen(false);
    } catch (err: any) {
      console.error(err);
      walletConnectModalRef.current?.closeModal();
      setWalletLoading(false);

      if (
        err?.message?.includes("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")
      ) {
        alert("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your env.");
      } else if (err?.message) {
        alert(err.message);
      } else {
        alert("Joey WalletConnect failed to open.");
      }
    }
  }

  async function createTip() {
    try {
      setWalletMode("tip");
      setWalletModalTitle(`Send ${tipAmount || "0"} XRP Tip`);
      setWalletLoading(true);
      setWalletModalOpen(true);
      setWalletQr("");
      setWalletDeepLink("");

      const res = await fetch("/api/tips/xaman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tipAmount }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(
          data.details || data.error || "Failed to create XRP tip transaction",
        );
        setWalletLoading(false);
        return;
      }

      setWalletQr(data.qr || "");
      setWalletDeepLink(data.deepLink || "");
      setWalletLoading(false);
    } catch (err) {
      console.error(err);
      setWalletLoading(false);
      alert("Failed to create XRP tip transaction");
    }
  }

  async function scanIssuer() {
    const { id } = await params;
    const cleanIssuer = issuerInput.trim();
    const cleanTaxon = taxonInput.trim();

    if (!cleanIssuer) {
      alert("Enter an issuer wallet first.");
      return;
    }

    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch("/api/collections/scan-issuer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          issuer: cleanIssuer,
          taxon: cleanTaxon || undefined,
        }),
      });

      const data = await res.json();

      setScanResult(data);

      if (data.success) {
        await loadCollections();
        setIssuerInput("");
        setTaxonInput("");
      } else {
        alert(data.details || data.error || "Scan failed");
      }
    } catch (err: any) {
      console.error(err);
      setScanResult({
        success: false,
        error: "Scan failed",
        details: err?.message || String(err),
      });
      alert(err?.message || "Scan failed");
    }

    setScanning(false);
  }

  async function scanSingleNft() {
    const { id } = await params;
    const cleanNftId = advancedNftId.trim();
    const cleanMetadataUri = advancedMetadataUri.trim();

    if (!advancedCollectionKey || !selectedAdvancedCollection) {
      alert("Select the collection/issuer you want to update first.");
      return;
    }

    if (!cleanNftId && !cleanMetadataUri) {
      alert("Enter an NFT Token ID or a metadata/IPFS URI.");
      return;
    }

    setAdvancedScanning(true);
    setAdvancedScanResult(null);

    try {
      const res = await fetch("/api/collections/scan-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          issuer: selectedAdvancedCollection.issuer,
          taxon: selectedAdvancedCollection.taxon,
          nft_id: cleanNftId || undefined,
          metadata_uri: cleanMetadataUri || undefined,
        }),
      });

      const data = await res.json();

      setAdvancedScanResult(data);

      if (data.success) {
        await Promise.all([
          loadCollections(),
          loadTraits(
            selectedAdvancedCollection.issuer,
            selectedAdvancedCollection.taxon,
          ),
        ]);
        setAdvancedNftId("");
        setAdvancedMetadataUri("");
      } else {
        alert(data.details || data.error || "Advanced scan failed");
      }
    } catch (err: any) {
      console.error(err);
      setAdvancedScanResult({
        success: false,
        error: "Advanced scan failed",
        details: err?.message || String(err),
      });
      alert(err?.message || "Advanced scan failed");
    }

    setAdvancedScanning(false);
  }

  async function renameCollection(collectionId: string, currentName: string) {
    const name = prompt("Collection name", currentName);
    if (!name) return;

    const res = await fetch("/api/collections/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_id: collectionId, name }),
    });

    const data = await res.json();

    if (data.success) {
      await loadCollections();
    } else {
      alert(data.error || "Failed to rename collection");
    }
  }

  async function deleteCollection(collection: Collection) {
    const displayName = collection.name || `Taxon ${collection.taxon}`;

    const confirmed = confirm(
      `Delete collection "${displayName}" from this project?\n\nThis removes the collection row plus indexed NFTs and traits for this issuer/taxon in this project only. You can scan the issuer again later.`,
    );

    if (!confirmed) return;

    try {
      const { id } = await params;

      const res = await fetch("/api/collections/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          collection_id: collection.id,
          issuer: collection.issuer,
          taxon: collection.taxon,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.details || data.error || "Failed to delete collection");
        return;
      }

      setOpenCollectionId("");
      setScanResult(null);
      setAdvancedScanResult(null);
      await Promise.all([loadCollections(), loadRules()]);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to delete collection");
    }
  }

  function roleLabel(roleId: string, fallback?: string | null) {
    return roles.find((role) => role.id === roleId)?.name || fallback || roleId;
  }

  function collectionLabel(issuer?: string | null, taxon?: string | null) {
    const collection = collections.find(
      (c) => c.issuer === issuer && String(c.taxon) === String(taxon || ""),
    );

    return collection?.name || `Taxon ${taxon || "Any"}`;
  }

  function requirementLabel(req: Requirement | SavedRequirement) {
    const collection = collectionLabel(req.issuer, req.taxon);

    if (req.requirement_type === "trait") {
      return `NFT Trait • ${collection} • ${req.trait_type || "Trait"} = ${
        req.trait_value || "Value"
      }`;
    }

    return `NFT Quantity • ${collection} • Min ${
      req.min_nft_count || "1"
    }`;
  }

  function groupPreview(group: RequirementGroup) {
    return group.requirements.map(requirementLabel).join(" AND ");
  }

  function savedGroupPreview(group: SavedRequirementGroup) {
    return group.requirements.map(requirementLabel).join(" AND ");
  }

  function toggleRoleOpen(ruleId: string) {
    setOpenRoleIds((current) =>
      current.includes(ruleId)
        ? current.filter((id) => id !== ruleId)
        : [...current, ruleId],
    );
  }

  function toggleGroupOpen(groupId: number) {
    setOpenGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  function toggleRequirementOpen(groupId: number, requirementIndex: number) {
    const key = `${groupId}-${requirementIndex}`;

    setOpenRequirementKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function addOrGroup() {
    const nextId =
      requirementGroups.length > 0
        ? Math.max(...requirementGroups.map((group) => group.group_id)) + 1
        : 1;

    setRequirementGroups([...requirementGroups, createBlankGroup(nextId)]);
    setOpenGroupIds((current) => [...current, nextId]);
    setOpenRequirementKeys((current) => [...current, `${nextId}-0`]);
  }

  function removeGroup(groupIndex: number) {
    if (requirementGroups.length === 1) {
      setRequirementGroups([createBlankGroup(1)]);
      setOpenGroupIds([1]);
      setOpenRequirementKeys(["1-0"]);
      return;
    }

    setRequirementGroups(requirementGroups.filter((_, i) => i !== groupIndex));
  }

  function addAndRequirement(groupIndex: number) {
    const updated = [...requirementGroups];
    const group = updated[groupIndex];

    group.requirements = [...group.requirements, createBlankRequirement()];
    updated[groupIndex] = group;

    setRequirementGroups(updated);
    setOpenGroupIds((current) =>
      current.includes(group.group_id) ? current : [...current, group.group_id],
    );
    setOpenRequirementKeys((current) => [
      ...current,
      `${group.group_id}-${group.requirements.length - 1}`,
    ]);
  }

  function removeRequirement(groupIndex: number, requirementIndex: number) {
    const updated = [...requirementGroups];
    const group = updated[groupIndex];

    if (group.requirements.length === 1) {
      removeGroup(groupIndex);
      return;
    }

    group.requirements = group.requirements.filter(
      (_, i) => i !== requirementIndex,
    );

    updated[groupIndex] = group;

    setRequirementGroups(updated);
  }

  function updateRequirement(
    groupIndex: number,
    requirementIndex: number,
    field: keyof Requirement,
    value: string,
  ) {
    const updated = [...requirementGroups];
    const group = updated[groupIndex];
    const requirement = { ...group.requirements[requirementIndex] };

    requirement[field] = value;

    group.requirements[requirementIndex] = requirement;
    updated[groupIndex] = group;

    setRequirementGroups(updated);

    if ((field === "issuer" || field === "taxon") && requirement.issuer) {
      loadTraits(requirement.issuer, requirement.taxon);
    }
  }

  function groupSavedRequirements(rule: SavedRule): SavedRequirementGroup[] {
    if (rule.requirement_groups && rule.requirement_groups.length > 0) {
      return rule.requirement_groups;
    }

    const map = new Map<number, SavedRequirement[]>();

    (rule.role_rule_requirements || []).forEach((req, index) => {
      const groupId = Number(req.group_id || index + 1);

      if (!map.has(groupId)) {
        map.set(groupId, []);
      }

      map.get(groupId)!.push({
        ...req,
        group_id: groupId,
        group_operator: req.group_operator || "AND",
      });
    });

    return Array.from(map.entries())
      .map(([group_id, requirements]) => ({
        group_id,
        group_operator: "AND",
        requirements,
      }))
      .sort((a, b) => a.group_id - b.group_id);
  }

  function editRule(rule: SavedRule) {
    setEditingRuleId(rule.id);
    setSelectedRole(rule.discord_role_id);

    const groups = groupSavedRequirements(rule);

    const loadedGroups =
      groups.length > 0
        ? groups.map((group, index) => ({
            group_id: Number(group.group_id || index + 1),
            requirements: group.requirements.map((req) => ({
              requirement_type: req.requirement_type || "nft_count",
              issuer: req.issuer || "",
              taxon: req.taxon || "",
              min_nft_count: String(req.min_nft_count || 1),
              trait_type: req.trait_type || "",
              trait_value: req.trait_value || "",
            })),
          }))
        : [createBlankGroup(1)];

    setRequirementGroups(loadedGroups);
    setOpenGroupIds(loadedGroups.map((group) => group.group_id));
    setOpenRequirementKeys(
      loadedGroups.flatMap((group) =>
        group.requirements.map((_, index) => `${group.group_id}-${index}`),
      ),
    );

    for (const group of loadedGroups) {
      for (const req of group.requirements) {
        if (req.issuer) {
          loadTraits(req.issuer, req.taxon);
        }
      }
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  async function deleteRule(ruleId: string) {
    const confirmed = confirm("Delete this programmed role rule?");

    if (!confirmed) return;

    const res = await fetch("/api/rules/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rule_id: ruleId }),
    });

    const data = await res.json();

    if (data.success) {
      await loadRules();

      if (editingRuleId === ruleId) {
        setEditingRuleId("");
      }
    } else {
      alert(data.error || "Failed to delete rule");
    }
  }

  async function deleteExistingWithoutConfirm(ruleId: string) {
    await fetch("/api/rules/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rule_id: ruleId }),
    });
  }

  async function saveRule() {
    const { id } = await params;
    const role = roles.find((r) => r.id === selectedRole);

    const cleanedRequirements = requirementGroups.flatMap((group) =>
      group.requirements
        .filter((req) => req.issuer)
        .map((req) => ({
          requirement_type: req.requirement_type,
          issuer: req.issuer,
          taxon: req.taxon || null,
          min_nft_count: Number(req.min_nft_count || 1),
          trait_type: req.requirement_type === "trait" ? req.trait_type : null,
          trait_value: req.requirement_type === "trait" ? req.trait_value : null,
          logic: "OR",
          group_id: group.group_id,
          group_operator: "AND",
        })),
    );

    if (!selectedRole) {
      alert("Select a Discord role first.");
      return;
    }

    if (cleanedRequirements.length === 0) {
      alert("Add at least one requirement.");
      return;
    }

    if (editingRuleId) {
      await deleteExistingWithoutConfirm(editingRuleId);
    }

    const res = await fetch("/api/rules/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: id,
        discord_role_id: selectedRole,
        role_name: role?.name || "",
        requirements: cleanedRequirements,
      }),
    });

    const data = await res.json();

    if (data.success) {
      setRuleSaved(true);
      setEditingRuleId("");
      await loadRules();
      setTimeout(() => setRuleSaved(false), 3000);
    } else {
      alert(data.error || "Failed to save rule");
    }
  }

  return (
    <main className="min-h-screen bg-[#071310] px-5 py-6 pb-40 text-[#fff4d8]">
      <audio ref={audioRef} onEnded={nextTrack} preload="none" />

      {walletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[#3a2b16] bg-[#15110c] p-6 text-center shadow-[0_0_50px_rgba(34,211,238,0.2)]">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-left text-2xl font-black text-white">
                {walletModalTitle}
              </h3>

              <button
                onClick={() => {
                  setWalletModalOpen(false);
                  setWalletLoading(false);
                  walletConnectModalRef.current?.closeModal();
                }}
                className="rounded-full border border-red-500 px-3 py-1 text-xs font-black text-red-400"
              >
                Close
              </button>
            </div>

            {walletMode === "joey" ? (
              <div className="mt-6">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
                  <img
                    src="/joey.png"
                    alt="Joey Wallet"
                    className="h-16 w-16 object-contain"
                  />
                </div>

                <p className="mt-5 text-lg font-black text-white">
                  {walletLoading ? "Opening WalletConnect..." : "Joey Wallet"}
                </p>

                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  A WalletConnect QR/modal should open on top of this screen.
                  Scan it with Joey on desktop, or approve from your mobile
                  wallet if it opens directly.
                </p>

                {walletLoading && (
                  <div className="mx-auto mt-5 h-10 w-10 animate-spin rounded-full border-4 border-cyan-400/25 border-t-cyan-400" />
                )}

                {wallet ? (
                  <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
                      Connected Wallet
                    </p>
                    <p className="mt-2 break-all font-mono text-sm font-black text-white">
                      {wallet}
                    </p>
                  </div>
                ) : null}

                <button
                  onClick={() => {
                    walletConnectModalRef.current?.closeModal();
                    setWalletModalOpen(false);
                    connectXaman();
                  }}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-lg font-black text-black"
                >
                  <img src="/xaman.png" alt="Xaman" className="h-6 w-6" />
                  Use Xaman Sign In
                </button>
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
                  Desktop users can scan the QR. Mobile users can tap the
                  button.
                </p>
              </>
            )}
          </div>
        </div>
      )}

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
                Powered by CALCo • XRPL access dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {discordUser && (
              <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-black/50 px-4 py-3">
                {discordAvatarUrl ? (
                  <img
                    src={discordAvatarUrl}
                    alt="Discord Avatar"
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 font-black text-black">
                    {discordDisplayName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                    Connected Discord
                  </p>
                  <p className="font-black text-white">{discordDisplayName}</p>
                </div>
              </div>
            )}

            <a
              href="https://claims.cafe"
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-yellow-400 px-5 py-3 text-sm font-black uppercase text-black hover:bg-yellow-300"
            >
              Claims.Cafe
            </a>

            {wallet ? (
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/50 bg-black/55 py-1.5 pl-2 pr-2 shadow-[0_0_22px_rgba(16,185,129,0.12)]">
                <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                  <img
                    src={walletProvider === "joey" ? "/joey.png" : "/xaman.png"}
                    alt={walletProvider === "joey" ? "Joey" : "Xaman"}
                    className="h-5 w-5"
                  />
                  <div className="leading-none">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                      Connected Wallet
                    </p>
                    <p className="mt-1 font-mono text-xs font-black text-white">
                      {shortWallet(wallet)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={disconnectWallet}
                  className="rounded-full border border-red-500/50 px-3 py-2 text-[10px] font-black uppercase text-red-300 hover:bg-red-500/10"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={connectXaman}
                  className="flex items-center gap-2 rounded-full border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-300 hover:bg-emerald-500/20"
                >
                  <img src="/xaman.png" alt="Xaman" className="h-5 w-5" />
                  Xaman
                </button>

                <button
                  onClick={connectJoey}
                  className="flex items-center gap-2 rounded-full border border-cyan-500 bg-cyan-500/10 px-4 py-2 text-xs font-black uppercase text-cyan-300 hover:bg-cyan-500/20"
                >
                  <img src="/joey.png" alt="Joey" className="h-5 w-5" />
                  Joey
                </button>
              </>
            )}

            <a
              href="/dashboard"
              className="rounded-full border border-cyan-500 px-5 py-3 text-sm font-black uppercase text-cyan-400 hover:bg-cyan-500/10"
            >
              Dashboard
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

          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/35" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,0.17),transparent_38%),radial-gradient(circle_at_20%_75%,rgba(250,204,21,0.12),transparent_34%)]" />

          <div className="relative z-10">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.45em] text-cyan-400">
              Project Setup
            </p>

            <h2 className="max-w-4xl text-5xl font-black leading-[0.95] text-white md:text-6xl">
              Configure access rules.
            </h2>

            <p className="mt-3 text-sm font-black uppercase tracking-[0.25em] text-yellow-400">
              Active Server: {project?.name || "Loading..."}
            </p>

            <p className="mt-1 break-all text-xs text-zinc-500">
              Server ID: {project?.discord_guild_id || "Not linked"}
            </p>

            <p className="mt-5 max-w-2xl text-zinc-300">
              Scan issuer wallets, name collections, select Discord roles, and
              build NFT, trait, and token-gated access requirements.
            </p>

            <div className="mt-6 inline-flex rounded-xl border border-red-600 bg-red-950/50 px-4 py-3 text-sm font-black uppercase text-red-300">
              Discord controls channels • Cocky.Cafe controls role eligibility
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7">
            <h3 className="text-2xl font-black text-white">Discord Role</h3>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="mt-6 w-full rounded-2xl border border-zinc-700 bg-black/50 px-5 py-4 text-lg font-bold text-white outline-none"
            >
              <option value="">Select Discord Role</option>
              {sortedRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>

            <div className="mt-6 rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-400">
                XRP Tip Jar
              </p>

              <p className="mt-2 text-sm text-zinc-400">
                Enjoying the tools? Send a small XRP tip to help support
                Cocky.Cafe development, bots, rewards, and future features.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <input
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="Tip amount in XRP"
                  className="w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                />

                <button
                  onClick={createTip}
                  className="rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black uppercase text-black hover:bg-emerald-400"
                >
                  Send XRP Tip
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7">
            <h3 className="text-2xl font-black text-white">Scan Issuer</h3>

            <input
              value={issuerInput}
              onChange={(e) => setIssuerInput(e.target.value)}
              placeholder="Issuer Wallet"
              className="mt-6 w-full rounded-2xl border border-zinc-700 bg-black/50 px-5 py-4 text-lg font-bold text-white outline-none"
            />

            <input
              value={taxonInput}
              onChange={(e) => setTaxonInput(e.target.value)}
              placeholder="Optional Taxon / Collection ID"
              className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/50 px-5 py-4 text-lg font-bold text-white outline-none"
            />

            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Use taxon when an issuer has multiple collections or Bithomp only
              returns the first batch. Leave blank for full issuer scan.
            </p>

            <button
              onClick={scanIssuer}
              disabled={scanning}
              className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-black text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {scanning ? "Scanning..." : "Scan Collections"}
            </button>

            {scanResult && (
              <div
                className={`mt-4 rounded-2xl border p-4 text-sm ${
                  scanResult.success
                    ? "border-cyan-500/40 bg-cyan-500/10"
                    : "border-red-500/40 bg-red-500/10"
                }`}
              >
                <p
                  className={`font-black ${
                    scanResult.success ? "text-cyan-300" : "text-red-300"
                  }`}
                >
                  {scanResult.success ? "Scan Complete" : "Scan Failed"}
                </p>

                {scanResult.issuer && (
                  <p className="mt-2 break-all text-zinc-400">
                    Issuer: {scanResult.issuer}
                  </p>
                )}

                {taxonInput && (
                  <p className="mt-1 break-all text-zinc-400">
                    Taxon filter: {taxonInput}
                  </p>
                )}

                <div className="mt-3 grid gap-2 text-zinc-300">
                  <p>NFTs found: {scanResult.total_nfts ?? 0}</p>
                  <p>Metadata found: {scanResult.metadata_found ?? 0}</p>
                  <p>Failed metadata: {scanResult.failed_metadata ?? 0}</p>
                  <p>Traits found: {scanResult.traits_found ?? 0}</p>
                  <p>Trait types saved: {scanResult.trait_types_found ?? 0}</p>
                </div>

                {!scanResult.success &&
                  (scanResult.error || scanResult.details) && (
                    <p className="mt-3 break-words text-red-200">
                      {String(scanResult.details || scanResult.error)}
                    </p>
                  )}
              </div>
            )}

            <div className="mt-6 rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                Advanced Scan
              </p>

              <p className="mt-2 text-sm text-zinc-400">
                Use this to complete or repair missing metadata/traits for the
                selected issuer and collection. Paste either an NFT Token ID or a
                metadata/IPFS URI.
              </p>

              <select
                value={advancedCollectionKey}
                onChange={(e) => {
                  setAdvancedCollectionKey(e.target.value);
                  setAdvancedScanResult(null);
                }}
                className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
              >
                <option value="">Select Collection To Update</option>
                {sortedCollections.map((collection) => (
                  <option
                    key={collection.id}
                    value={`${collection.issuer}|${collection.taxon}`}
                  >
                    {collection.name || `Taxon ${collection.taxon}`}
                  </option>
                ))}
              </select>

              {selectedAdvancedCollection && (
                <div className="mt-3 rounded-2xl border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-400">
                  <p className="font-black uppercase tracking-[0.2em] text-yellow-300">
                    Target
                  </p>
                  <p className="mt-2 break-all">
                    Issuer: {selectedAdvancedCollection.issuer}
                  </p>
                  <p>Taxon: {selectedAdvancedCollection.taxon}</p>
                </div>
              )}

              <input
                value={advancedNftId}
                onChange={(e) => setAdvancedNftId(e.target.value)}
                placeholder="NFT Token ID"
                className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
              />

              <input
                value={advancedMetadataUri}
                onChange={(e) => setAdvancedMetadataUri(e.target.value)}
                placeholder="Metadata / IPFS URI backup"
                className="mt-3 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
              />

              <button
                onClick={scanSingleNft}
                disabled={advancedScanning}
                className="mt-4 w-full rounded-2xl bg-yellow-400 px-6 py-4 text-sm font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-50"
              >
                {advancedScanning
                  ? "Scanning Single NFT..."
                  : "Scan Single NFT / Metadata"}
              </button>

              {advancedScanResult && (
                <div
                  className={`mt-4 rounded-2xl border p-4 text-sm ${
                    advancedScanResult.success
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-red-500/40 bg-red-500/10"
                  }`}
                >
                  <p
                    className={`font-black ${
                      advancedScanResult.success
                        ? "text-emerald-300"
                        : "text-red-300"
                    }`}
                  >
                    {advancedScanResult.success
                      ? "Advanced Scan Complete"
                      : "Advanced Scan Failed"}
                  </p>

                  {advancedScanResult.success ? (
                    <>
                      <p className="mt-2 break-all text-zinc-300">
                        NFT:{" "}
                        {advancedScanResult.name || advancedScanResult.nft_id}
                      </p>
                      <p className="mt-1 break-all text-xs text-zinc-500">
                        Metadata: {advancedScanResult.metadata_uri || "N/A"}
                      </p>
                      <p className="mt-2 text-zinc-300">
                        Traits found: {advancedScanResult.traits_found ?? 0}
                      </p>

                      {advancedScanResult.traits &&
                        advancedScanResult.traits.length > 0 && (
                          <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-zinc-800 bg-black/40 p-3">
                            {[...advancedScanResult.traits]
                              .sort((a, b) => {
                                const typeCompare =
                                  a.trait_type.localeCompare(b.trait_type);
                                if (typeCompare !== 0) return typeCompare;
                                return a.trait_value.localeCompare(
                                  b.trait_value,
                                );
                              })
                              .map((trait, index) => (
                                <p
                                  key={`${trait.trait_type}-${trait.trait_value}-${index}`}
                                  className="text-xs text-zinc-300"
                                >
                                  <span className="font-black text-yellow-300">
                                    {trait.trait_type}:
                                  </span>{" "}
                                  {trait.trait_value}
                                </p>
                              ))}
                          </div>
                        )}
                    </>
                  ) : (
                    <p className="mt-3 break-words text-red-200">
                      {String(
                        advancedScanResult.details ||
                          advancedScanResult.error ||
                          "Advanced scan failed",
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7">
            <h3 className="text-2xl font-black text-white">Collections</h3>

            <div className="mt-6 space-y-3">
              {sortedCollections.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-500">
                  No collections indexed yet.
                </p>
              ) : (
                sortedCollections.map((collection) => {
                  const displayName =
                    collection.name || `Taxon ${collection.taxon}`;
                  const isOpen = openCollectionId === collection.id;

                  return (
                    <div
                      key={collection.id}
                      className="rounded-2xl border border-zinc-800 bg-black/45 p-4"
                    >
                      <button
                        onClick={() =>
                          setOpenCollectionId(isOpen ? "" : collection.id)
                        }
                        className="flex w-full items-center justify-between text-left"
                      >
                        <p className="font-black text-cyan-400">
                          {displayName}
                        </p>
                        <span className="text-cyan-400">
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="mt-4">
                          <p className="text-sm text-zinc-400">
                            Taxon: {collection.taxon}
                          </p>
                          <p className="mt-2 text-sm text-zinc-400">
                            Indexed NFTs: {collection.nft_count}
                          </p>
                          <p className="mt-2 break-all text-xs text-zinc-600">
                            {collection.issuer}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                renameCollection(collection.id, displayName)
                              }
                              className="rounded-xl border border-cyan-500 px-4 py-2 text-xs font-black uppercase text-cyan-400 hover:bg-cyan-500/10"
                            >
                              Rename
                            </button>

                            <button
                              onClick={() => deleteCollection(collection)}
                              className="rounded-xl border border-red-500 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-300 hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7">
            <h3 className="text-3xl font-black text-white">
              Programmed Roles
            </h3>

            <div className="mt-6 space-y-4">
              {savedRules.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-500">
                  No saved rules yet.
                </p>
              ) : (
                savedRules.map((rule) => {
                  const isOpen = openRoleIds.includes(rule.id);
                  const groups = groupSavedRequirements(rule);

                  return (
                    <div
                      key={rule.id}
                      className="rounded-2xl border border-zinc-800 bg-black/45 p-4"
                    >
                      <button
                        onClick={() => toggleRoleOpen(rule.id)}
                        className="flex w-full items-start justify-between gap-4 text-left"
                      >
                        <div>
                          <p className="text-xl font-black text-yellow-400">
                            {roleLabel(rule.discord_role_id, rule.role_name)}
                          </p>

                          <p className="mt-2 text-xs text-zinc-500">
                            {groups.length} OR group
                            {groups.length === 1 ? "" : "s"} •{" "}
                            {(rule.role_rule_requirements || []).length} total
                            requirement
                            {(rule.role_rule_requirements || []).length === 1
                              ? ""
                              : "s"}
                          </p>

                          {!isOpen && groups[0] && (
                            <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
                              {savedGroupPreview(groups[0])}
                            </p>
                          )}
                        </div>

                        <span className="rounded-full border border-cyan-500 px-3 py-1 text-xs font-black text-cyan-400">
                          {isOpen ? "Collapse" : "Expand"}
                        </span>
                      </button>

                      {isOpen && (
                        <>
                          <div className="mt-4 space-y-3">
                            {groups.map((group, groupIndex) => (
                              <div
                                key={`${rule.id}-${group.group_id}`}
                                className="rounded-xl border border-zinc-800 bg-black/50 p-3"
                              >
                                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                                  OR Group {groupIndex + 1}
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                  All items inside this group are required
                                  together.
                                </p>

                                <div className="mt-3 space-y-2">
                                  {group.requirements.map((req) => (
                                    <div
                                      key={req.id}
                                      className="rounded-xl border border-zinc-800 bg-black/40 p-3"
                                    >
                                      <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-400">
                                        {req.requirement_type === "trait"
                                          ? "Trait Gate"
                                          : "NFT Quantity"}
                                      </p>

                                      <p className="mt-2 text-sm text-zinc-300">
                                        {collectionLabel(req.issuer, req.taxon)}
                                      </p>

                                      {req.requirement_type === "trait" ? (
                                        <p className="mt-1 text-sm text-zinc-400">
                                          {req.trait_type}: {req.trait_value}
                                        </p>
                                      ) : (
                                        <p className="mt-1 text-sm text-zinc-400">
                                          Min NFTs: {req.min_nft_count || 1}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => editRule(rule)}
                              className="rounded-xl border border-cyan-500 px-3 py-2 text-xs font-black uppercase text-cyan-400 hover:bg-cyan-500/10"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="rounded-xl border border-red-500 px-3 py-2 text-xs font-black uppercase text-red-400 hover:bg-red-500/10"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#3a2b16] bg-[#15110c] p-7">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-3xl font-black text-white">
                  Access Requirements
                </h3>

                <p className="mt-2 text-sm text-zinc-500">
                  {editingRuleId
                    ? "Editing saved role rule."
                    : "OR groups qualify separately. Requirements inside one group are AND."}
                </p>
              </div>

              <button
                onClick={saveRule}
                className="rounded-2xl bg-yellow-400 px-6 py-4 text-sm font-black uppercase text-black transition hover:bg-yellow-300"
              >
                {editingRuleId ? "Update Rule" : "Save Role Rule"}
              </button>
            </div>

            <div className="grid gap-5">
              {requirementGroups.map((group, groupIndex) => {
                const isGroupOpen = openGroupIds.includes(group.group_id);

                return (
                  <div
                    key={group.group_id}
                    className="rounded-3xl border border-cyan-500/25 bg-black/45 p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <button
                        onClick={() => toggleGroupOpen(group.group_id)}
                        className="text-left"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-400">
                          OR Group {groupIndex + 1}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Requirements inside this group are paired with AND.
                        </p>

                        {!isGroupOpen && (
                          <p className="mt-2 line-clamp-2 text-sm font-bold text-white">
                            {groupPreview(group) || "Empty group"}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => toggleGroupOpen(group.group_id)}
                          className="rounded-full border border-cyan-500 px-3 py-1 text-xs font-black text-cyan-400 hover:bg-cyan-500/10"
                        >
                          {isGroupOpen ? "Collapse" : "Expand"}
                        </button>

                        <button
                          onClick={() => removeGroup(groupIndex)}
                          className="rounded-full bg-red-950 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {isGroupOpen && (
                      <div className="space-y-4">
                        {group.requirements.map((req, requirementIndex) => {
                          const requirementKey = `${group.group_id}-${requirementIndex}`;
                          const isRequirementOpen =
                            openRequirementKeys.includes(requirementKey);

                          return (
                            <div
                              key={requirementKey}
                              className="rounded-2xl border border-zinc-800 bg-black/60 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  onClick={() =>
                                    toggleRequirementOpen(
                                      group.group_id,
                                      requirementIndex,
                                    )
                                  }
                                  className="text-left"
                                >
                                  <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                                    AND Requirement {requirementIndex + 1}
                                  </p>

                                  <p className="mt-2 text-sm font-black text-white">
                                    {requirementLabel(req)}
                                  </p>
                                </button>

                                <div className="flex shrink-0 gap-2">
                                  <button
                                    onClick={() =>
                                      toggleRequirementOpen(
                                        group.group_id,
                                        requirementIndex,
                                      )
                                    }
                                    className="rounded-full border border-yellow-400 px-3 py-1 text-xs font-black text-yellow-300 hover:bg-yellow-400/10"
                                  >
                                    {isRequirementOpen ? "Collapse" : "Edit"}
                                  </button>

                                  <button
                                    onClick={() =>
                                      removeRequirement(
                                        groupIndex,
                                        requirementIndex,
                                      )
                                    }
                                    className="rounded-full bg-red-950 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-800"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>

                              {isRequirementOpen && (
                                <div className="mt-4">
                                  <select
                                    value={req.requirement_type}
                                    onChange={(e) =>
                                      updateRequirement(
                                        groupIndex,
                                        requirementIndex,
                                        "requirement_type",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                                  >
                                    <option value="nft_count">
                                      NFT Quantity
                                    </option>
                                    <option value="trait">NFT Trait</option>
                                  </select>

                                  <select
                                    value={`${req.issuer}|${req.taxon}`}
                                    onChange={(e) => {
                                      const [issuer, taxon] =
                                        e.target.value.split("|");
                                      updateRequirement(
                                        groupIndex,
                                        requirementIndex,
                                        "issuer",
                                        issuer || "",
                                      );
                                      updateRequirement(
                                        groupIndex,
                                        requirementIndex,
                                        "taxon",
                                        taxon || "",
                                      );
                                    }}
                                    className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                                  >
                                    <option value="|">Select Collection</option>
                                    {sortedCollections.map((collection) => (
                                      <option
                                        key={collection.id}
                                        value={`${collection.issuer}|${collection.taxon}`}
                                      >
                                        {collection.name ||
                                          `Taxon ${collection.taxon}`}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    value={req.min_nft_count}
                                    onChange={(e) =>
                                      updateRequirement(
                                        groupIndex,
                                        requirementIndex,
                                        "min_nft_count",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Minimum NFTs Owned"
                                    className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                                  />

                                  {req.requirement_type === "trait" && (
                                    <>
                                      <select
                                        value={req.trait_type}
                                        onChange={(e) =>
                                          updateRequirement(
                                            groupIndex,
                                            requirementIndex,
                                            "trait_type",
                                            e.target.value,
                                          )
                                        }
                                        className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                                      >
                                        <option value="">
                                          Select Trait Type
                                        </option>
                                        {traitTypes.map((type) => (
                                          <option key={type} value={type}>
                                            {type}
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        value={req.trait_value}
                                        onChange={(e) =>
                                          updateRequirement(
                                            groupIndex,
                                            requirementIndex,
                                            "trait_value",
                                            e.target.value,
                                          )
                                        }
                                        className="mt-4 w-full rounded-2xl border border-zinc-700 bg-black/60 px-5 py-4 text-base font-bold text-white outline-none"
                                      >
                                        <option value="">
                                          Select Trait Value
                                        </option>
                                        {getTraitValues(req.trait_type).map(
                                          (value) => (
                                            <option key={value} value={value}>
                                              {value}
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <button
                          onClick={() => addAndRequirement(groupIndex)}
                          className="w-full rounded-2xl border border-yellow-400 bg-yellow-400/10 py-3 text-sm font-black uppercase text-yellow-300 transition hover:bg-yellow-400/20"
                        >
                          + Add AND Requirement To This Group
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={addOrGroup}
              className="mt-6 w-full rounded-2xl border border-cyan-500 bg-cyan-500/10 py-4 text-lg font-black text-cyan-400 transition hover:bg-cyan-500/20"
            >
              + Add OR Group
            </button>

            {ruleSaved && (
              <p className="mt-4 rounded-2xl border border-emerald-500 bg-emerald-500/10 p-4 text-center font-black text-emerald-400">
                Role rule saved.
              </p>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-4 rounded-3xl border border-[#3a2b16] bg-[#15110c] p-5">
          {SOCIALS.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full border border-zinc-700 bg-black/50 px-4 py-2 text-xs font-black uppercase text-zinc-300 hover:border-cyan-400 hover:text-cyan-400"
            >
              <img src={social.icon} alt={social.name} className="h-5 w-5" />
              {social.name}
            </a>
          ))}
        </footer>
      </div>

      <div className="fixed bottom-5 right-5 z-40 w-64 rounded-3xl border border-yellow-400/50 bg-[#15110c]/95 p-4 shadow-[0_0_35px_rgba(250,204,21,0.22)] backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black uppercase text-yellow-300">
            Cocky Radio
          </p>

          <button
            onClick={toggleRadio}
            className="rounded-full border border-cyan-500 px-3 py-1 text-xs font-black text-cyan-400"
          >
            {radioOn ? "Pause" : "Play"}
          </button>
        </div>

        <div className="mt-4 flex h-16 items-end justify-center gap-2 rounded-2xl border border-zinc-800 bg-black/70 p-3">
          {[
            "bg-red-500",
            "bg-orange-500",
            "bg-yellow-400",
            "bg-green-400",
            "bg-yellow-400",
            "bg-orange-500",
            "bg-red-500",
          ].map((color, index) => (
            <span
              key={index}
              className={`w-3 rounded-full ${color} ${
                radioOn ? "animate-pulse" : ""
              }`}
              style={{
                height: radioOn ? `${14 + ((index * 9) % 38)}px` : "10px",
              }}
            />
          ))}
        </div>

        <button
          onClick={nextTrack}
          className="mt-3 w-full rounded-2xl border border-yellow-400 py-2 text-xs font-black uppercase text-yellow-300 hover:bg-yellow-400/10"
        >
          Next Track
        </button>
      </div>
    </main>
  );
}