"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Coffee,
  Compass,
  Database,
  ExternalLink,
  FileText,
  GitCompareArrows,
  House,
  Info,
  Leaf,
  LoaderCircle,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Address, Report, Source, Visit } from "@/lib/types";
import { median } from "@/lib/analysis";
import { parseVisits } from "@/lib/storage";
import { sourceConfidence } from "@/lib/confidence";
import { useReportTool } from "./report-tool";
const NeighborhoodMap = dynamic(() => import("./neighborhood-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" />
      Chargement de la carte…
    </div>
  ),
});
type View = "explore" | "saved" | "compare" | "visit" | "sources";
type Tab = "overview" | "living" | "market" | "visit" | "sources";
const DEFAULT_QUERY = "10 Rue de Bretagne 75003 Paris";
const STORAGE = "immo360.saved.v1";
const VISITS = "immo360.visits.v1";
const euro = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
const date = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const initialVisit: Visit = {
  checked: [],
  notes: "",
  floor: "",
  orientation: "",
  courtyard: false,
};
const checklist = [
  {
    id: "night",
    category: "Ambiance sonore",
    text: "Revenir en soirée, fenêtres ouvertes",
    hint: "Écouter la rue, les terrasses et les parties communes.",
  },
  {
    id: "windows",
    category: "Ambiance sonore",
    text: "Tester l’isolation des fenêtres",
    hint: "Comparer le bruit fenêtres ouvertes puis fermées.",
  },
  {
    id: "heat",
    category: "Confort d’été",
    text: "Vérifier l’exposition et les protections solaires",
    hint: "Repérer les volets, stores extérieurs et pièces sous toiture.",
  },
  {
    id: "air",
    category: "Confort d’été",
    text: "Vérifier la ventilation et les odeurs",
    hint: "Ouvrir les fenêtres côté rue et côté cour ; observer les extractions.",
  },
  {
    id: "dpe",
    category: "Le logement",
    text: "Demander le DPE de cet appartement",
    hint: "Comparer son numéro, sa surface et sa date au document remis.",
  },
  {
    id: "risks",
    category: "Le logement",
    text: "Consulter l’état des risques à l’adresse",
    hint: "Demander l’ERP et vérifier les informations sur Géorisques / ERRIAL.",
  },
  {
    id: "building",
    category: "L’immeuble",
    text: "Consulter les documents de copropriété",
    hint: "Vérifier les travaux votés, les charges et les procès-verbaux disponibles.",
  },
  {
    id: "walk",
    category: "Le quartier",
    text: "Faire le trajet à pied dans le quartier",
    hint: "Vérifier l’accès aux commerces, transports et espaces verts aux horaires utiles.",
  },
];
function downloadJSON(report: Report, visit: Visit) {
  const blob = new Blob([JSON.stringify({ ...report, visit }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `immo360-${report.address.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Tag({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-intro">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function SourceTag({ source }: { source: Source | undefined }) {
  return (
    <Tag
      tone={
        source?.status === "ok"
          ? "green"
          : source?.status === "empty"
            ? "neutral"
            : "amber"
      }
    >
      {source?.status === "ok"
        ? "Donnée publique"
        : source?.status === "empty"
          ? "Aucun résultat"
          : "Indisponible"}
    </Tag>
  );
}

export default function Workspace() {
  const [view, setView] = useState<View>("explore");
  const [tab, setTab] = useState<Tab>("overview");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useReportTool(!loading && !error && view === "explore" ? report : null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [saved, setSaved] = useState<Report[]>([]);
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const reportController = useRef<AbortController | null>(null);
  const searchContainer = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  async function analyze(address?: Address, rawQuery?: string) {
    reportController.current?.abort();
    const controller = new AbortController();
    reportController.current = controller;
    setLoading(true);
    setError("");
    setSearchOpen(false);
    setQuery("");
    setView("explore");
    setTab("overview");
    const params = new URLSearchParams({
      q: address?.label ?? rawQuery ?? DEFAULT_QUERY,
    });
    if (address) params.set("id", address.id);
    try {
      const response = await fetch(`/api/report?${params}`, {
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "L’analyse est indisponible.");
      if (controller.signal.aborted) return;
      setReport(data);
      window.history.replaceState(
        {},
        "",
        `/?${new URLSearchParams({ q: data.address.label, id: data.address.id })}`,
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
      if (Array.isArray(value))
        setSaved(
          value
            .filter(
              (v) =>
                v?.address?.id &&
                Array.isArray(v.sources) &&
                Array.isArray(v.places) &&
                Array.isArray(v.sales) &&
                Array.isArray(v.diagnostics),
            )
            .slice(0, 12),
        );
    } catch {
      setToast("Les favoris n’ont pas pu être lus sur cet appareil.");
    }
    try {
      setVisits(parseVisits(localStorage.getItem(VISITS)));
    } catch {
      /* Browsers can deny access to storage. */
    }
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const sharedAddress = params.get("q")?.trim();
    if (sharedAddress) void analyze(undefined, sharedAddress);
    return () => reportController.current?.abort();
    // Load once; following searches are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem(STORAGE, JSON.stringify(saved));
      } catch {
        setToast(
          "Stockage local indisponible : exportez votre dossier pour le conserver.",
        );
      }
  }, [saved, hydrated]);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem(VISITS, JSON.stringify(visits));
      } catch {
        setToast(
          "Les notes ne peuvent pas être conservées dans ce navigateur.",
        );
      }
  }, [visits, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!searchContainer.current?.contains(e.target as Node))
        setSearchOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setExportOpen(false);
        setPrivacy(false);
        setMobileNav(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    setSuggestions([]);
    setActiveSuggestion(-1);
    setSearchError("");
    if (query.trim().length < 3) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSuggestions(data.addresses);
      } catch (e) {
        if (!controller.signal.aborted)
          setSearchError(
            e instanceof Error ? e.message : "Recherche indisponible.",
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);
  const currentVisit = report
    ? (visits[report.address.id] ?? initialVisit)
    : initialVisit;
  const isSaved =
    !!report && saved.some((r) => r.address.id === report.address.id);
  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
    setExportOpen(false);
  }
  function toggleSave() {
    if (!report) return;
    if (isSaved) {
      setSaved(saved.filter((r) => r.address.id !== report.address.id));
      setToast("Adresse retirée des favoris.");
    } else {
      if (saved.length >= 12) {
        setToast(
          "Vous pouvez conserver 12 adresses. Retirez-en une pour continuer.",
        );
        return;
      }
      setSaved([report, ...saved]);
      setToast("Adresse enregistrée sur cet appareil.");
    }
  }
  function updateVisit(next: Visit) {
    if (report) setVisits({ ...visits, [report.address.id]: next });
  }
  function openSaved(next: Report) {
    reportController.current?.abort();
    setLoading(false);
    setError("");
    setReport(next);
    setView("explore");
    setTab("overview");
    window.history.replaceState(
      {},
      "",
      `/?${new URLSearchParams({ q: next.address.label, id: next.address.id })}`,
    );
  }
  const navigation: {
    id: View;
    icon: LucideIcon;
    label: string;
    count?: number;
  }[] = [
    { id: "explore", icon: Compass, label: "Explorer une adresse" },
    { id: "saved", icon: Bookmark, label: "Mes adresses", count: saved.length },
    { id: "compare", icon: GitCompareArrows, label: "Comparer" },
    { id: "visit", icon: ClipboardCheck, label: "Mes visites" },
  ];
  const showReport = view === "explore" && report && !loading && !error;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("explore")}
          aria-label="IMMO 360, explorer"
        >
          <span className="brand-symbol">
            <House size={23} />
          </span>
          <span>
            immo<span className="brand-number">360</span>
            <small>PARIS, À LA LOUPE</small>
          </span>
        </button>
        <div className="workspace-label">MON ESPACE</div>
        <nav aria-label="Navigation principale">
          {navigation.map(({ id, icon: Icon, label, count }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {count !== undefined && (
                <span className="nav-count">{count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "sources" ? "active" : ""}`}
            onClick={() => navigate("sources")}
          >
            <Database size={18} />
            Sources & méthodologie
            <ArrowUpRight size={15} />
          </button>
          <button className="nav-item" onClick={() => setPrivacy(true)}>
            <ShieldCheck size={18} />
            Confidentialité
          </button>
          <div className="sidebar-card">
            <span className="little-orbit">
              <MapPin size={20} />
            </span>
            <h3>
              Une adresse.
              <br />
              Toutes les perspectives.
            </h3>
            <p>Les données pour mieux choisir votre prochain chez-vous.</p>
            <div className="paris-pill">
              <span />
              Paris · 20 arrondissements
            </div>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="Fermer le menu"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Mon espace <ChevronRight size={14} />
            <strong>
              {view === "explore"
                ? "Explorer une adresse"
                : view === "saved"
                  ? "Mes adresses"
                  : view === "compare"
                    ? "Comparer"
                    : view === "visit"
                      ? "Mes visites"
                      : "Sources & méthodologie"}
            </strong>
          </div>
          <div className="topbar-end">
            <span className="pilot-badge">ÉDITION PARIS</span>
            <div className="avatar small">M</div>
          </div>
        </header>
        <main>
          <div className="search-strip">
            <div className="search-box" ref={searchContainer}>
              <Search size={20} />
              <input
                ref={searchInput}
                aria-label="Rechercher une adresse à Paris"
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls="address-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  activeSuggestion >= 0
                    ? `suggestion-${activeSuggestion}`
                    : undefined
                }
                placeholder="Quelle adresse souhaitez-vous explorer à Paris ?"
                value={query}
                maxLength={160}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveSuggestion((n) =>
                      Math.min(n + 1, suggestions.length - 1),
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveSuggestion((n) => Math.max(n - 1, 0));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (suggestions.length)
                      void analyze(suggestions[Math.max(activeSuggestion, 0)]);
                    else if (query.length >= 3 && !searching)
                      void analyze(undefined, query);
                  }
                }}
              />
              {searching ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <kbd>Ctrl K</kbd>
              )}
              {searchOpen && (
                <div
                  className="search-results"
                  id="address-results"
                  role="listbox"
                >
                  {query.length < 3 ? (
                    <>
                      <div className="search-label">
                        COMMENCER PAR UNE ADRESSE
                      </div>
                      {[
                        DEFAULT_QUERY,
                        "24 Rue des Martyrs 75009 Paris",
                        "15 Rue de la Butte aux Cailles 75013 Paris",
                      ].map((q) => (
                        <button
                          key={q}
                          role="option"
                          aria-selected={false}
                          onClick={() => void analyze(undefined, q)}
                        >
                          <MapPin size={18} />
                          <span>{q}</span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </>
                  ) : searching ? (
                    <div className="search-status">
                      Recherche dans la Base Adresse Nationale…
                    </div>
                  ) : searchError ? (
                    <div className="search-status error-text" role="alert">
                      {searchError}
                    </div>
                  ) : suggestions.length ? (
                    suggestions.map((a, i) => (
                      <button
                        id={`suggestion-${i}`}
                        key={a.id}
                        role="option"
                        aria-selected={i === activeSuggestion}
                        className={i === activeSuggestion ? "highlighted" : ""}
                        onClick={() => void analyze(a)}
                      >
                        <MapPin size={18} />
                        <span>
                          <strong>{a.name}</strong>
                          <small>
                            {a.postcode} Paris ·{" "}
                            {a.precision === "housenumber"
                              ? "Numéro identifié"
                              : "Localisation à la rue"}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  ) : (
                    <div className="search-status">
                      Aucune adresse à Paris. Ajoutez le numéro et le code
                      postal.
                    </div>
                  )}
                  <div className="search-foot">
                    Adresses officielles · IGN / Base Adresse Nationale
                  </div>
                </div>
              )}
            </div>
            <span className="search-location">
              <MapPin size={15} />
              Paris, France
              <ChevronDown size={13} />
            </span>
          </div>
          {view === "explore" && !report && !loading && !error && (
            <section className="empty-state home-start" aria-labelledby="home-title">
              <span className="home-icon"><MapPin size={32} /></span>
              <span className="eyebrow">PARIS, À LA LOUPE</span>
              <h1 id="home-title">Explorez votre prochaine adresse.</h1>
              <p>Cadre de vie, énergie, prix et points à vérifier : commencez par rechercher une adresse à Paris.</p>
              <button className="button primary" onClick={() => searchInput.current?.focus()}>
                <Search size={16} />Rechercher une adresse
              </button>
              <div className="home-example">
                <span>Envie de tester ?</span>
                <button className="text-link" onClick={() => void analyze(undefined, DEFAULT_QUERY)}>
                  Découvrir le 10 rue de Bretagne<ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}
          {view === "explore" && loading && (
            <div className="loading-view">
              <div className="loading-icon">
                <Building2 size={32} />
                <span />
              </div>
              <h2>Votre adresse prend forme.</h2>
              <p>
                Nous croisons les données publiques pour éclairer votre futur
                quotidien.
              </p>
              <div className="loading-steps">
                <span>
                  <Check size={15} />
                  Paris
                </span>
                <span>
                  <LoaderCircle size={15} className="spin" />
                  Analyse des sources
                </span>
                <span>Votre fiche 360</span>
              </div>
              <div className="skeleton-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} />
                ))}
              </div>
            </div>
          )}
          {view === "explore" && error && !loading && (
            <div className="empty-state">
              <Info size={36} />
              <h2>L’adresse attendra un petit instant.</h2>
              <p role="alert">{error}</p>
              <button
                className="button primary"
                onClick={() =>
                  void analyze(
                    undefined,
                    new URLSearchParams(location.search).get("q") ??
                      DEFAULT_QUERY,
                  )
                }
              >
                Réessayer <ArrowRight size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => searchInput.current?.focus()}
              >
                Chercher une autre adresse
              </button>
            </div>
          )}
          {showReport && (
            <>
              <div className="report-heading">
                <div>
                  <div className="eyebrow">
                    <span className="green-dot" />
                    FICHE ADRESSE <span className="eyebrow-divider">
                      /
                    </span>{" "}
                    {report.address.postcode} PARIS
                  </div>
                  <h1>{report.address.name}</h1>
                  <p>
                    <MapPin size={15} />
                    {report.address.district || "Paris"}
                    <span>·</span>
                    {report.address.precision === "housenumber"
                      ? "Adresse identifiée par l’IGN"
                      : "Localisation à la rue · précisez un numéro"}
                  </p>
                </div>
                <div className="report-actions">
                  <button
                    className={`button ${isSaved ? "saved" : ""}`}
                    onClick={toggleSave}
                  >
                    <Bookmark
                      size={16}
                      fill={isSaved ? "currentColor" : "none"}
                    />
                    {isSaved ? "Enregistrée" : "Enregistrer"}
                  </button>
                  <div className="export-wrap">
                    <button
                      className="button primary"
                      aria-expanded={exportOpen}
                      onClick={() => setExportOpen(!exportOpen)}
                    >
                      <ArrowDownToLine size={16} />
                      Exporter la fiche
                      <ChevronDown size={14} />
                    </button>
                    {exportOpen && (
                      <div className="export-menu">
                        <button
                          onClick={() => {
                            setExportOpen(false);
                            window.print();
                          }}
                        >
                          <FileText size={16} />
                          Imprimer / enregistrer en PDF
                        </button>
                        <button
                          onClick={() => {
                            downloadJSON(report, currentVisit);
                            setExportOpen(false);
                          }}
                        >
                          <Database size={16} />
                          Données et notes (.json)
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                location.href,
                              );
                              setToast(
                                "Lien de l’adresse copié. Vos notes restent privées.",
                              );
                            } catch {
                              setToast(
                                "Copiez l’adresse de cette page pour la partager.",
                              );
                            }
                            setExportOpen(false);
                          }}
                        >
                          <ExternalLink size={16} />
                          Copier le lien de l’adresse
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="report-tabs"
                role="tablist"
                aria-label="Sections de la fiche"
              >
                {(
                  [
                    { id: "overview", name: "Vue d’ensemble", icon: Compass },
                    { id: "living", name: "Cadre de vie", icon: Leaf },
                    {
                      id: "market",
                      name: "Le bien & le marché",
                      icon: Building2,
                    },
                    {
                      id: "visit",
                      name: "Préparer ma visite",
                      icon: ClipboardCheck,
                    },
                    { id: "sources", name: "Sources", icon: Database },
                  ] as { id: Tab; name: string; icon: LucideIcon }[]
                ).map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    id={`tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={`panel-${id}`}
                    onClick={() => setTab(id)}
                    className={tab === id ? "active" : ""}
                  >
                    <Icon size={16} />
                    {name}
                    {id === "visit" && (
                      <span className="tab-counter">
                        {currentVisit.checked.length}/{checklist.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {tab === "overview" && (
                  <Overview
                    report={report}
                    setTab={setTab}
                    visit={currentVisit}
                  />
                )}
                {tab === "living" && <Living report={report} />}
                {tab === "market" && <Market report={report} />}
                {tab === "visit" && (
                  <VisitPanel
                    visit={currentVisit}
                    update={updateVisit}
                    address={report.address}
                  />
                )}
                {tab === "sources" && <Sources report={report} />}
              </div>
              <footer className="report-footer">
                <span>
                  <ShieldCheck size={14} />
                  Des données ouvertes. Des décisions éclairées.
                </span>
                <span>
                  Fiche consultée le {date(report.generatedAt)}{" "}
                  <button onClick={() => void analyze(report.address)}>
                    Actualiser
                  </button>
                </span>
              </footer>
            </>
          )}
          {view === "saved" && (
            <>
              <Heading
                eyebrow="VOTRE SÉLECTION"
                title="Mes adresses"
                description="Retrouvez vos lieux, vos repères et les adresses qui vous ressemblent."
              />
              {saved.length ? (
                <>
                  <div className="saved-toolbar">
                    <span>
                      {saved.length} adresse{saved.length > 1 ? "s" : ""}{" "}
                      enregistrée{saved.length > 1 ? "s" : ""} sur cet appareil
                    </span>
                    <button
                      className="button"
                      onClick={() => navigate("compare")}
                    >
                      <GitCompareArrows size={16} />
                      Comparer mes adresses
                    </button>
                  </div>
                  <div className="saved-grid">
                    {saved.map((r) => (
                      <article className="saved-card" key={r.address.id}>
                        <div className="saved-card-top">
                          <div className="address-glyph">
                            <Building2 size={28} />
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Retirer ${r.address.name}`}
                            onClick={() =>
                              setSaved(
                                saved.filter(
                                  (s) => s.address.id !== r.address.id,
                                ),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <Tag tone="neutral">{r.address.postcode} · PARIS</Tag>
                        <h2>{r.address.name}</h2>
                        <p>Analyse du {date(r.generatedAt)}</p>
                        <div className="saved-stats">
                          <span>
                            <Coffee size={16} />
                            {r.terraceCount ?? "—"} terrasses*
                          </span>
                          <span>
                            <Leaf size={16} />
                            {r.greenCount ?? "—"} espaces verts
                          </span>
                        </div>
                        <button
                          className="button full-width"
                          onClick={() => openSaved(r)}
                        >
                          Ouvrir la fiche
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                  <p className="muted footnote">
                    * Autorisations recensées à 200 m. Les fiches enregistrées
                    sont des instantanés ; actualisez-les pour consulter les
                    dernières données.
                  </p>
                </>
              ) : (
                <Empty
                  icon={Bookmark}
                  title="Vos prochaines adresses sont ici."
                  description="Enregistrez une fiche pour la retrouver et la comparer à d’autres adresses."
                  action="Explorer une adresse"
                  onClick={() => navigate("explore")}
                />
              )}
            </>
          )}
          {view === "compare" && (
            <>
              <Heading
                eyebrow="CÔTE À CÔTE"
                title="Comparer pour mieux choisir."
                description="Les mêmes indicateurs et les mêmes limites, pour chaque adresse."
              />
              {saved.length >= 2 ? (
                <>
                  <div className="compare-select">
                    {saved.map((r) => (
                      <button
                        className={`button ${(compareIds.length ? compareIds : saved.slice(0, 3).map((s) => s.address.id)).includes(r.address.id) ? "saved" : ""}`}
                        key={r.address.id}
                        onClick={() => {
                          const current = compareIds.length
                            ? compareIds
                            : saved.slice(0, 3).map((s) => s.address.id);
                          if (
                            current.length === 1 &&
                            current.includes(r.address.id)
                          ) {
                            setToast(
                              "Gardez au moins une adresse dans la comparaison.",
                            );
                            return;
                          }
                          setCompareIds(
                            current.includes(r.address.id)
                              ? current.filter((id) => id !== r.address.id)
                              : [...current.slice(-2), r.address.id],
                          );
                        }}
                      >
                        <MapPin size={15} />
                        {r.address.name}
                      </button>
                    ))}
                  </div>
                  <Compare
                    reports={saved.filter((r) =>
                      (compareIds.length
                        ? compareIds
                        : saved.slice(0, 3).map((s) => s.address.id)
                      ).includes(r.address.id),
                    )}
                    open={openSaved}
                  />
                </>
              ) : (
                <Empty
                  icon={GitCompareArrows}
                  title="Deux adresses, une décision plus claire."
                  description="Enregistrez au moins deux adresses pour comparer leur environnement et leurs données immobilières."
                  action="Explorer une adresse"
                  onClick={() => navigate("explore")}
                />
              )}
            </>
          )}
          {view === "visit" &&
            (report ? (
              <>
                <Heading
                  eyebrow="SUR LE TERRAIN"
                  title="Les bonnes questions, au bon moment."
                  description={`Votre carnet de visite pour ${report.address.label}.`}
                />
                <VisitPanel
                  visit={currentVisit}
                  update={updateVisit}
                  address={report.address}
                />
              </>
            ) : (
              <Empty
                icon={ClipboardCheck}
                title="Préparez votre première visite."
                description="Choisissez une adresse pour créer sa checklist et conserver vos observations."
                action="Explorer une adresse"
                onClick={() => navigate("explore")}
              />
            ))}
          {view === "sources" && (
            <>
              <Heading
                eyebrow="EN TOUTE TRANSPARENCE"
                title="D’où viennent vos informations ?"
                description="Comprendre la source, l’échelle et les limites de chaque indicateur."
              />
              <Sources report={report} />
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Fermer la notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {privacy && (
        <Privacy
          close={() => setPrivacy(false)}
          clear={() => {
            setSaved([]);
            setVisits({});
            setPrivacy(false);
            setToast("Favoris et notes effacés de cet appareil.");
          }}
        />
      )}
      {report && <PrintReport report={report} visit={currentVisit} />}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <Icon size={36} />
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button primary" onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  unit,
  description,
  tone,
  source,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  description: string;
  tone: string;
  source?: Source;
  onClick: () => void;
}) {
  return (
    <button className="metric-card" onClick={onClick}>
      <div className="metric-top">
        <span className={`metric-icon ${tone}`}>
          <Icon size={19} />
        </span>
        <ArrowUpRight size={16} />
      </div>
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <span className="metric-description">{description}</span>
      <span className="metric-confidence">
        <ShieldCheck size={12} />
        Fiabilité : {source ? sourceConfidence(source) : "Non évaluée"}
      </span>
    </button>
  );
}
function Overview({
  report: r,
  setTab,
  visit,
}: {
  report: Report;
  setTab: (t: Tab) => void;
  visit: Visit;
}) {
  const available = r.sources.filter((s) => s.status === "ok").length;
  const returned = r.sources.filter((s) => s.status !== "unavailable").length;
  const latest = r.diagnostics[0];
  const nearest = r.places
    .filter((p) => p.category === "green")
    .sort((a, b) => a.distance - b.distance)[0];
  return (
    <>
      <div className="overview-top">
        <section className="summary-card">
          <div className="card-eyebrow">
            <Sparkles size={16} />
            VOTRE ÉCLAIRAGE 360<Tag tone="light">Données réelles</Tag>
          </div>
          <div className="summary-body">
            <div
              className="coverage-ring"
              style={
                {
                  "--coverage": `${(available / 6) * 100}%`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>
                  {available}
                  <small>/6</small>
                </strong>
                <span>
                  sources avec
                  <br />
                  des résultats
                </span>
              </div>
            </div>
            <div className="summary-copy">
              <h2>
                Le quartier se révèle.
                <br />
                <span>La visite fait le reste.</span>
              </h2>
              <p>
                {available >= 4
                  ? "Des repères concrets pour explorer le quotidien à cette adresse, avec leurs limites et leurs sources."
                  : "Les premiers repères sont réunis. Certaines données restent à compléter pour cette adresse."}
              </p>
              <button onClick={() => setTab("sources")}>
                Comprendre cette fiche
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
          <div className="summary-bottom">
            <span>
              <Check size={14} />
              {returned} sources consultables
            </span>
            <span>
              <Info size={14} />
              Aucun score artificiel
            </span>
          </div>
        </section>
        <section className="map-card">
          <div className="map-card-head">
            <span>
              <MapPin size={16} />
              Votre environnement immédiat
            </span>
            <button
              aria-label="Voir la carte détaillée"
              onClick={() => setTab("living")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <NeighborhoodMap address={r.address} places={r.places} />
        </section>
      </div>
      <div className="section-heading">
        <div>
          <h2>Le quotidien, sous tous les angles</h2>
          <p>Des faits pour se projeter. Des points à vérifier sur place.</p>
        </div>
        <span className="legend-label">
          <span />
          Données publiques
        </span>
      </div>
      <div className="metric-grid">
        <Metric
          icon={Coffee}
          label="Vie de quartier"
          value={r.terraceCount === null ? "—" : String(r.terraceCount)}
          unit="autorisations"
          description="de terrasses dans un rayon de 200 m"
          tone="orange"
          source={r.sources.find((s) => s.id === "terraces")}
          onClick={() => setTab("living")}
        />
        <Metric
          icon={Leaf}
          label="Nature à proximité"
          value={r.greenCount === null ? "—" : String(r.greenCount)}
          unit="espaces"
          description={
            nearest
              ? `Le plus proche à ${nearest.distance} m à vol d’oiseau`
              : "espaces verts recensés à moins de 500 m"
          }
          tone="green"
          source={r.sources.find((s) => s.id === "green")}
          onClick={() => setTab("living")}
        />
        <Metric
          icon={Building2}
          label="Énergie du bâtiment"
          value={r.diagnostics.length ? String(r.diagnostics.length) : "—"}
          unit={r.diagnostics.length ? "DPE" : ""}
          description={
            latest
              ? "à cette adresse · logement à identifier"
              : "Aucun diagnostic attribué au logement"
          }
          tone="blue"
          source={r.sources.find((s) => s.id === "dpe")}
          onClick={() => setTab("market")}
        />
        <Metric
          icon={House}
          label="Repère immobilier"
          value={euro(r.medianPrice)}
          unit={r.medianPrice ? "€/m²" : ""}
          description={
            r.medianPrice
              ? `Médiane de ${r.sales.length} ventes de la section`
              : "Échantillon insuffisant ou indisponible"
          }
          tone="purple"
          source={r.sources.find((s) => s.id === "dvf")}
          onClick={() => setTab("market")}
        />
      </div>
      <div className="overview-bottom">
        <section className="panel attention-panel">
          <div className="panel-title">
            <span className="icon-tile amber">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h2>Ce qui mérite votre attention</h2>
              <p>Au-delà des chiffres, les bonnes vérifications.</p>
            </div>
          </div>
          <div className="attention-row">
            <span className="attention-icon">
              <Volume2 size={18} />
            </span>
            <div>
              <h3>L’ambiance sonore en soirée</h3>
              <p>
                {r.terraceCount !== null && r.terraceCount > 0
                  ? `${r.terraceCount} autorisations de terrasses à proximité. Une présence ne prouve pas une nuisance sonore.`
                  : "Le bruit à l’intérieur du logement n’est pas mesuré par les données disponibles."}
              </p>
            </div>
            <Tag tone="amber">À vérifier</Tag>
          </div>
          <div className="attention-row">
            <span className="attention-icon">
              <Sun size={18} />
            </span>
            <div>
              <h3>Le confort pendant les fortes chaleurs</h3>
              <p>
                {r.coolCount !== null
                  ? `${r.coolCount} lieux de fraîcheur recensés à 500 m. L’étage, l’exposition et la ventilation restent déterminants.`
                  : "L’étage, l’exposition, les volets et la ventilation sont à observer lors de la visite."}
              </p>
            </div>
            <Tag tone="amber">À vérifier</Tag>
          </div>
          <div className="panel-bottom">
            <Info size={14} />
            L’absence de donnée ne signifie pas l’absence de risque.
          </div>
        </section>
        <section className="visit-teaser">
          <div className="teaser-top">
            <ClipboardCheck size={23} />
            <span>LE PROCHAIN PAS</span>
          </div>
          <h2>
            Une visite.
            <br />
            Les bonnes questions.
          </h2>
          <p>
            Emportez votre checklist et gardez une trace de vos observations.
          </p>
          <div className="teaser-progress">
            <span>
              {visit.checked.length} sur {checklist.length} points vérifiés
            </span>
            <div>
              <span
                style={{
                  width: `${(visit.checked.length / checklist.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <button onClick={() => setTab("visit")}>
            Préparer ma visite
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
      <div className="source-strip">
        <span>LES DONNÉES DERRIÈRE VOTRE FICHE</span>
        <strong>
          IGN<span>GÉOPLATEFORME</span>
        </strong>
        <strong className="ademe-logo">ADEME</strong>
        <strong>
          PARIS<span>DATA</span>
        </strong>
        <strong>data.gouv.fr</strong>
        <strong>Géorisques</strong>
        <button onClick={() => setTab("sources")}>
          Voir les sources
          <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}

function Living({ report: r }: { report: Report }) {
  const [category, setCategory] = useState("all");
  const places = r.places
    .filter((p) => category === "all" || p.category === category)
    .sort((a, b) => a.distance - b.distance);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>À l’échelle de votre quotidien</h2>
          <p>
            Les lieux recensés autour de l’adresse. Distances à vol d’oiseau.
          </p>
        </div>
      </div>
      <div className="living-layout">
        <section className="panel living-map">
          <NeighborhoodMap address={r.address} places={r.places} large />
        </section>
        <div className="living-insights">
          <section className="panel compact">
            <div className="panel-title">
              <Volume2 size={20} />
              <h2>Ambiance sonore</h2>
            </div>
            <Tag tone="amber">Mesure non disponible</Tag>
            <p>
              Le nombre de terrasses renseigne sur l’activité locale. Il ne
              permet pas de calculer un niveau sonore, ni de qualifier une
              nuisance.
            </p>
            <a
              className="text-link"
              href="https://www.bruitparif.fr/"
              target="_blank"
              rel="noreferrer"
            >
              Consulter Bruitparif
              <ExternalLink size={14} />
            </a>
          </section>
          <section className="panel compact">
            <div className="panel-title">
              <Sun size={20} />
              <h2>Confort d’été</h2>
            </div>
            <Tag tone="amber">À observer dans le logement</Tag>
            <p>
              {r.coolCount ?? "Aucun décompte de"} lieux de fraîcheur recensés à
              500 m. Aucune température intérieure ni vulnérabilité à la chaleur
              n’est déduite de ce chiffre.
            </p>
            <a
              className="text-link"
              href="https://www.apur.org/"
              target="_blank"
              rel="noreferrer"
            >
              Explorer les travaux de l’APUR
              <ExternalLink size={14} />
            </a>
          </section>
        </div>
      </div>
      <section className="panel places-panel">
        <div className="panel-header">
          <h2>
            Les lieux à proximité{" "}
            <span className="count-label">{places.length}</span>
          </h2>
          <div className="segmented">
            {[
              ["all", "Tous"],
              ["terrace", "Terrasses"],
              ["green", "Nature"],
              ["cool", "Fraîcheur"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={key === category ? "active" : ""}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {places.length ? (
          <div className="places-grid">
            {places.slice(0, 36).map((p) => (
              <div className="place-row" key={p.id}>
                <span
                  className={`metric-icon ${p.category === "terrace" ? "orange" : "green"}`}
                >
                  {p.category === "terrace" ? (
                    <Coffee size={18} />
                  ) : (
                    <Leaf size={18} />
                  )}
                </span>
                <div>
                  <strong>{p.name.toLocaleLowerCase("fr-FR")}</strong>
                  <small>{p.description.toLocaleLowerCase("fr-FR")}</small>
                </div>
                <span>{p.distance} m</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-empty">
            Aucun lieu à afficher pour ce filtre. Consultez l’état des sources
            avant de conclure à une absence de lieux.
          </p>
        )}
        <div className="panel-bottom">
          Jusqu’à 100 points par source, les 36 plus proches du filtre sont
          listés. Les autorisations ne correspondent pas toujours à des
          établissements distincts.
        </div>
      </section>
    </>
  );
}

function Market({ report: r }: { report: Report }) {
  const [period, setPeriod] = useState("all");
  const [dpeFilter, setDpeFilter] = useState("");
  const cutoff = new Date(r.generatedAt);
  cutoff.setFullYear(cutoff.getFullYear() - Number(period));
  const sales = r.sales.filter(
    (s) => period === "all" || new Date(s.date) >= cutoff,
  );
  const med = sales.length >= 3 ? median(sales.map((s) => s.priceM2)) : null;
  const distribution = "ABCDEFG".split("").map((label) => ({
    label,
    count: r.diagnostics.filter((d) => d.label === label).length,
  }));
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Un peu de contexte avant de vous projeter</h2>
          <p>
            Des diagnostics à l’adresse et des transactions dans la section
            cadastrale.
          </p>
        </div>
      </div>
      <section className="panel market-panel">
        <div className="panel-header">
          <div>
            <h2>Les transactions autour de l’adresse</h2>
            <p>Appartements · section cadastrale · moins de 500 m</p>
          </div>
          <label className="select-label">
            Période
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Toutes les ventes disponibles</option>
              <option value="3">3 dernières années</option>
              <option value="1">12 derniers mois</option>
            </select>
          </label>
        </div>
        <div className="market-summary">
          <div>
            <span>Prix médian observé</span>
            <strong>
              {euro(med)}
              <small>{med ? " €/m²" : ""}</small>
            </strong>
          </div>
          <div>
            <span>Transactions retenues</span>
            <strong>
              {sales.length}
              <small> ventes</small>
            </strong>
          </div>
          <div className="market-note">
            <Info size={20} />
            <p>
              Un repère historique, pas une estimation de votre bien. Une
              médiane est affichée à partir de 3 ventes.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Adresse</th>
                <th>Date de vente</th>
                <th>Surface</th>
                <th>Prix de vente</th>
                <th>Prix au m²</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 30).map((s) => (
                <tr key={s.id}>
                  <td className="address-cell">
                    {s.address.toLowerCase()}
                    <small>{s.distance} m à vol d’oiseau</small>
                  </td>
                  <td>{date(s.date)}</td>
                  <td>{s.area} m²</td>
                  <td>{euro(s.price)} €</td>
                  <td>
                    <strong>{euro(s.priceM2)} €</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sales.length && (
            <p className="panel-empty">
              Aucune vente exploitable dans cette période. Les ventes complexes
              sont exclues.
            </p>
          )}
        </div>
        <div className="panel-bottom">
          Source : DGFiP / Etalab · Prix total incluant d’éventuelles
          dépendances ·{" "}
          {sales.length > 30
            ? "30 ventes affichées. Export JSON disponible pour l’échantillon complet."
            : "Les caractéristiques du logement influencent sa valeur."}
        </div>
      </section>
      <section className="panel dpe-panel">
        <div className="panel-header">
          <div>
            <h2>Diagnostics énergétiques à cette adresse</h2>
            <p>Chaque appartement peut avoir un diagnostic différent.</p>
          </div>
          <SourceTag source={r.sources.find((s) => s.id === "dpe")} />
        </div>
        <div className="info-callout">
          <Info size={18} />
          <span>
            Demandez le numéro du DPE au vendeur ou au bailleur. Ces résultats
            ne permettent pas d’attribuer une classe à votre appartement.
          </span>
        </div>
        <div className="dpe-scale">
          {distribution.map(({ label, count }, i) => (
            <button
              key={label}
              style={
                {
                  "--dpe-color": [
                    "#238b57",
                    "#5c9d48",
                    "#a0b844",
                    "#d8c347",
                    "#df9d43",
                    "#d97542",
                    "#c94b47",
                  ][i],
                } as React.CSSProperties
              }
              className={dpeFilter === label ? "selected" : ""}
              onClick={() => setDpeFilter(dpeFilter === label ? "" : label)}
              aria-pressed={dpeFilter === label}
            >
              <strong>{label}</strong>
              <span>{count} DPE</span>
            </button>
          ))}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Numéro du DPE</th>
                <th>Classe énergie</th>
                <th>GES</th>
                <th>Surface déclarée</th>
                <th>Établi le</th>
              </tr>
            </thead>
            <tbody>
              {r.diagnostics
                .filter((d) => !dpeFilter || d.label === dpeFilter)
                .slice(0, 20)
                .map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.id}</td>
                    <td>
                      <span className={`dpe-letter dpe-${d.label}`}>
                        {d.label}
                      </span>
                    </td>
                    <td>{d.ges}</td>
                    <td>{d.area ? `${d.area} m²` : "Non renseignée"}</td>
                    <td>{date(d.date)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!r.diagnostics.filter((d) => !dpeFilter || d.label === dpeFilter)
            .length && (
            <p className="panel-empty">
              Aucun diagnostic trouvé pour cette sélection.
            </p>
          )}
        </div>
        <div className="panel-bottom">
          ADEME · Jusqu’à 100 diagnostics à 20 m, filtrés sur l’adresse exacte
          et classés du plus récent au plus ancien ; 20 affichés. Les doublons
          de logement ne peuvent pas être identifiés automatiquement.
        </div>
      </section>
    </>
  );
}

function VisitPanel({
  visit,
  update,
  address,
}: {
  visit: Visit;
  update: (v: Visit) => void;
  address: Address;
}) {
  const complete = visit.checked.length;
  return (
    <div className="visit-layout">
      <section className="panel checklist-panel">
        <div className="panel-header">
          <div>
            <h2>Votre checklist de visite</h2>
            <p>{address.name}</p>
          </div>
          <Tag>
            {complete}/{checklist.length} vérifiés
          </Tag>
        </div>
        <div className="check-progress">
          <span style={{ width: `${(complete / checklist.length) * 100}%` }} />
        </div>
        {checklist.map((item) => (
          <label
            className={`checklist-row ${visit.checked.includes(item.id) ? "checked" : ""}`}
            key={item.id}
          >
            <input
              type="checkbox"
              checked={visit.checked.includes(item.id)}
              onChange={(e) =>
                update({
                  ...visit,
                  checked: e.target.checked
                    ? [...visit.checked, item.id]
                    : visit.checked.filter((id) => id !== item.id),
                })
              }
            />
            <span>
              <small>{item.category}</small>
              <strong>{item.text}</strong>
              <span>{item.hint}</span>
            </span>
          </label>
        ))}
      </section>
      <div className="visit-notes">
        <section className="panel compact">
          <div className="panel-title">
            <Building2 size={19} />
            <h2>Le logement visité</h2>
          </div>
          <p>Vos observations personnelles, pour cette adresse.</p>
          <div className="form-row">
            <label>
              Étage
              <select
                value={visit.floor}
                onChange={(e) => update({ ...visit, floor: e.target.value })}
              >
                <option value="">À préciser</option>
                <option>Rez-de-chaussée</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n}>
                    {n}
                    {n === 1 ? "er" : "e"} étage
                  </option>
                ))}
                <option>8e étage ou plus</option>
                <option>Dernier étage / sous toiture</option>
              </select>
            </label>
            <label>
              Exposition
              <select
                value={visit.orientation}
                onChange={(e) =>
                  update({ ...visit, orientation: e.target.value })
                }
              >
                <option value="">À préciser</option>
                {["Nord", "Sud", "Est", "Ouest", "Traversant", "Inconnue"].map(
                  (n) => (
                    <option key={n}>{n}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="simple-check">
            <input
              type="checkbox"
              checked={visit.courtyard}
              onChange={(e) =>
                update({ ...visit, courtyard: e.target.checked })
              }
            />
            Le logement donne sur une cour
          </label>
        </section>
        <section className="panel compact">
          <div className="panel-title">
            <FileText size={19} />
            <h2>Mes notes de visite</h2>
          </div>
          <label className="sr-only" htmlFor="visit-notes">
            Notes pour {address.name}
          </label>
          <textarea
            id="visit-notes"
            value={visit.notes}
            onChange={(e) => update({ ...visit, notes: e.target.value })}
            placeholder="Lumière en fin de journée, bruit fenêtres ouvertes, questions à poser…"
            maxLength={10000}
            rows={9}
          />
          <div className="notes-saved">
            <Check size={13} />
            Conservation locale sur cet appareil
          </div>
        </section>
        <div className="info-callout">
          <ShieldCheck size={20} />
          <span>
            Vos notes restent dans ce navigateur. Exportez votre fiche pour en
            conserver une copie.
          </span>
        </div>
      </div>
    </div>
  );
}

function Sources({ report: r }: { report: Report | null }) {
  return (
    <>
      <div className="methodology-grid">
        <section className="panel compact">
          <span className="metric-icon green">
            <Database size={20} />
          </span>
          <h2>Des faits sourcés</h2>
          <p>
            Adresses, diagnostics, autorisations et transactions proviennent de
            bases publiques. Leur échelle et leur date de consultation restent
            visibles.
          </p>
        </section>
        <section className="panel compact">
          <span className="metric-icon orange">
            <SlidersHorizontal size={20} />
          </span>
          <h2>Des calculs explicites</h2>
          <p>
            Les distances sont à vol d’oiseau. Les prix au m² divisent le
            montant de la vente par la surface bâtie. La médiane exige au moins
            trois ventes retenues.
          </p>
        </section>
        <section className="panel compact">
          <span className="metric-icon blue">
            <ShieldCheck size={20} />
          </span>
          <h2>Des limites assumées</h2>
          <p>
            Aucun score global de qualité de vie n’est inventé. Les sources sans
            résultat et les indisponibilités sont distinguées. Aucun avis
            juridique ni diagnostic de nuisance n’est produit.
          </p>
        </section>
      </div>
      <div className="info-callout">
        <Info size={19} />
        <span>
          La fiabilité documentaire est une appréciation qualitative : élevée
          pour un recensement public, modérée quand le logement ou l’échantillon
          reste à qualifier, limitée à une échelle communale. Ce n’est pas une
          probabilité statistique. Le cercle « sources avec des résultats »
          indique la couverture documentaire, pas la qualité de vie. Une source
          consultable peut renvoyer zéro résultat. Les API sont mises en cache
          pendant une heure ; la date affichée est celle de consultation de la
          fiche, pas la date de mise à jour de chaque jeu de données.
        </span>
      </div>
      {r ? (
        <section className="panel sources-panel">
          <div className="panel-header">
            <h2>Les sources de cette fiche</h2>
            <span className="muted">Consultées le {date(r.generatedAt)}</span>
          </div>
          {r.sources.map((s) => (
            <div className="source-row" key={s.id}>
              <span className={`source-status ${s.status}`}>
                <Database size={20} />
              </span>
              <div>
                <div className="source-row-title">
                  <h3>{s.name}</h3>
                  <SourceTag source={s} />
                </div>
                <p>{s.note}</p>
                <small>
                  Fiabilité documentaire : {sourceConfidence(s)} · {s.scope} ·{" "}
                  {s.status === "unavailable"
                    ? "Service momentanément indisponible"
                    : `${s.count} résultat${s.count > 1 ? "s" : ""}`}{" "}
                  · {date(s.fetchedAt)}
                </small>
              </div>
              <a
                className="icon-button"
                href={s.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Consulter ${s.name}`}
              >
                <ExternalLink size={18} />
              </a>
            </div>
          ))}
        </section>
      ) : (
        <p className="panel-empty">
          Analysez une adresse pour voir la disponibilité de chaque source.
        </p>
      )}
      <div className="method-bottom">
        <section>
          <h2>Et le bruit, la chaleur, les odeurs ?</h2>
          <p>
            Les indicateurs de terrasses et de fraîcheur apportent un contexte.
            Ils ne prouvent pas une nuisance et ne prédisent pas la température
            intérieure. Les mesures acoustiques Bruitparif et les analyses
            urbaines APUR ne sont pas intégrées automatiquement à cette version.
          </p>
          <div className="inline-links">
            <a
              href="https://www.bruitparif.fr/"
              target="_blank"
              rel="noreferrer"
            >
              Bruitparif <ExternalLink size={14} />
            </a>
            <a href="https://www.apur.org/" target="_blank" rel="noreferrer">
              APUR <ExternalLink size={14} />
            </a>
          </div>
        </section>
        <section>
          <h2>Les risques à la bonne échelle</h2>
          <p>
            Les données Géorisques présentées concernent Paris dans son
            ensemble. Un état des risques spécifique au bien reste nécessaire
            pour vérifier son exposition.
          </p>
          {r && r.risks.length > 0 && (
            <div className="risk-tags">
              {r.risks.map((risk) => (
                <Tag key={risk} tone="amber">
                  {risk}
                </Tag>
              ))}
            </div>
          )}
          <a
            className="text-link"
            href="https://errial.georisques.gouv.fr/"
            target="_blank"
            rel="noreferrer"
          >
            Consulter ERRIAL
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
    </>
  );
}

function Compare({
  reports,
  open,
}: {
  reports: Report[];
  open: (r: Report) => void;
}) {
  const rows: { label: string; value: (r: Report) => string }[] = [
    {
      label: "Sources avec des résultats",
      value: (r) => `${r.sources.filter((s) => s.status === "ok").length}/6`,
    },
    {
      label: "Autorisations de terrasses · 200 m",
      value: (r) =>
        r.terraceCount === null ? "Indisponible" : String(r.terraceCount),
    },
    {
      label: "Espaces verts · 500 m",
      value: (r) =>
        r.greenCount === null ? "Indisponible" : String(r.greenCount),
    },
    {
      label: "Lieux de fraîcheur · 500 m",
      value: (r) =>
        r.coolCount === null ? "Indisponible" : String(r.coolCount),
    },
    {
      label: "DPE à l’adresse · logement non identifié",
      value: (r) => String(r.diagnostics.length),
    },
    {
      label: "Prix médian · échantillon de section",
      value: (r) =>
        r.medianPrice ? `${euro(r.medianPrice)} €/m²` : "Non calculable",
    },
    {
      label: "Nombre de ventes retenues",
      value: (r) => String(r.sales.length),
    },
    {
      label: "Bruit et chaleur intérieure",
      value: () => "À vérifier sur place",
    },
  ];
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Votre grille de lecture</th>
              {reports.map((r) => (
                <th key={r.address.id}>
                  <span>{r.address.postcode} PARIS</span>
                  <h2>{r.address.name}</h2>
                  <button className="text-link" onClick={() => open(r)}>
                    Voir la fiche
                    <ArrowRight size={14} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                {reports.map((r) => (
                  <td key={r.address.id}>{row.value(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-bottom">
        Les rayons sont identiques, mais les sections cadastrales et les dates
        des ventes diffèrent. Aucun classement automatique des adresses n’est
        établi.
      </div>
    </section>
  );
}

function Privacy({ close, clear }: { close: () => void; clear: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="privacy-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="privacy-title"
    >
      <button
        className="dialog-close icon-button"
        onClick={close}
        aria-label="Fermer"
      >
        <X size={20} />
      </button>
      <span className="metric-icon green">
        <ShieldCheck size={24} />
      </span>
      <h2 id="privacy-title">Votre espace reste personnel.</h2>
      <p>
        Cette version fonctionne sans compte. Vos favoris, notes et checklists
        sont conservés uniquement dans le stockage local de ce navigateur.
      </p>
      <p>
        Les recherches d’adresses transitent par le serveur de l’application et
        les API publiques nécessaires à l’analyse. Le fond de carte est fourni
        par CARTO / OpenStreetMap. Ces services reçoivent les informations
        nécessaires à leurs requêtes.
      </p>
      <p>
        Aucun traceur publicitaire n’est ajouté. Supprimer les données du
        navigateur efface également votre carnet : pensez à l’exporter.
      </p>
      {confirm ? (
        <div className="delete-confirm">
          <p>Effacer tous les favoris et toutes les notes de cet appareil ?</p>
          <div className="inline-actions">
            <button className="button danger" onClick={clear}>
              Tout effacer
            </button>
            <button className="button" onClick={() => setConfirm(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          className="text-button danger-text"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={15} />
          Effacer mes données locales
        </button>
      )}
    </dialog>
  );
}

function PrintReport({ report: r, visit }: { report: Report; visit: Visit }) {
  return (
    <article className="print-report">
      <div className="print-brand">IMMO 360 · PARIS</div>
      <h1>{r.address.name}</h1>
      <p>
        {r.address.label} · Fiche du {date(r.generatedAt)}
      </p>
      <h2>Les repères du quartier</h2>
      <p>
        Terrasses (autorisations à 200 m) : {r.terraceCount ?? "indisponible"} ·
        Espaces verts (500 m) : {r.greenCount ?? "indisponible"} · Lieux de
        fraîcheur (500 m) : {r.coolCount ?? "indisponible"}
      </p>
      <p>
        Prix médian des {r.sales.length} ventes retenues dans la section
        cadastrale à moins de 500 m :{" "}
        {r.medianPrice
          ? `${euro(r.medianPrice)} €/m²`
          : "échantillon insuffisant ou indisponible"}
        .
      </p>
      <p>
        {r.diagnostics.length} DPE à l’adresse. Le diagnostic du logement visité
        doit être identifié séparément.
      </p>
      <h2>À vérifier</h2>
      <p>
        Aucune mesure du bruit ou de la température intérieure n’est disponible.
        Les terrasses ne prouvent pas une nuisance. L’absence de données ne
        prouve pas l’absence de risque.
      </p>
      <h2>Ma visite</h2>
      <p>
        Étage : {visit.floor || "non précisé"} · Exposition :{" "}
        {visit.orientation || "non précisée"} · Sur cour :{" "}
        {visit.courtyard ? "oui (déclaré)" : "non renseigné"}
      </p>
      {checklist.map((item) => (
        <p key={item.id}>
          {visit.checked.includes(item.id) ? "☑" : "☐"} {item.text}
        </p>
      ))}
      {visit.notes && (
        <>
          <h2>Notes personnelles</h2>
          <p className="print-notes">{visit.notes}</p>
        </>
      )}
      <h2>Sources et limites</h2>
      {r.sources.map((s) => (
        <section key={s.id}>
          <h3>
            {s.name} ·{" "}
            {s.status === "ok"
              ? `${s.count} résultats`
              : s.status === "empty"
                ? "aucun résultat"
                : "indisponible"}
          </h3>
          <p>
            Fiabilité documentaire : {sourceConfidence(s)}. {s.scope}. {s.note}
          </p>
          <p>{s.url}</p>
        </section>
      ))}
      <p>
        Cette fiche est une aide à la préparation d’une visite. Elle ne remplace
        ni un DPE, ni un état des risques, ni une expertise immobilière.
      </p>
    </article>
  );
}
