"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ApiError, authenticatedRequest } from "@/lib/api.client";

type CompanySearchResult = {
  providerPlaceId: string | null;
  name: string | null;
  category: string | null;
  city: string;
  state: string;
  publicAddress: string | null;
  website: string | null;
  phone: string | null;
  sourceUrl: string | null;
};

type LeadAnalysis = {
  status: "READY";
  score: number;
  opportunity: string;
  strengths: string[];
  cautions: string[];
  suggestedApproach: string;
  observationUsed: string | null;
  openingChosen: string | null;
  message: string | null;
  followUp3Days: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

type AnalysisModalState = {
  company: CompanySearchResult;
  analysis: LeadAnalysis;
};

type WhatsAppDecisionState = {
  company: ProspectingResult;
  url: string;
};

type ProspectedLead = {
  id: string;
  name: string;
  category: string | null;
  city: string;
  state: string;
  publicAddress: string | null;
  website: string | null;
  phone: string | null;
  sourceUrl: string | null;
  priorityScore: number | null;
  openingMessage: string | null;
  prospectedAt: string;
  followUpCount: number;
  nextFollowUpDate: string | null;
  lastFollowUpAt: string | null;
};

type CitySuggestion = {
  city: string;
  state: string | null;
  label: string;
};

type SearchHistoryItem = {
  id: string;
  segment: string;
  city: string;
  state: string;
  quantity: number;
  searchedAt: string;
};

type ProspectingResult = CompanySearchResult & {
  analysis?: LeadAnalysis;
};

const amounts = [5, 10, 15, 20];
const SEARCH_HISTORY_STORAGE_KEY = "alvesr-prospecting-search-history";
const brazilianStates = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

export function ProspectingPage() {
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("MG");
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [results, setResults] = useState<ProspectingResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [rankingProgress, setRankingProgress] = useState<number | null>(null);
  const [rankingTotal, setRankingTotal] = useState<number | null>(null);
  const [analysisModal, setAnalysisModal] = useState<AnalysisModalState | null>(null);
  const [whatsAppDecision, setWhatsAppDecision] = useState<WhatsAppDecisionState | null>(null);
  const [prospectedLeadKeys, setProspectedLeadKeys] = useState<string[]>([]);
  const [prospectedLeads, setProspectedLeads] = useState<ProspectedLead[]>([]);
  const [savingProspectedLead, setSavingProspectedLead] = useState(false);
  const [registeringFollowUpId, setRegisteringFollowUpId] = useState<string | null>(null);
  const [generatingFollowUpId, setGeneratingFollowUpId] = useState<string | null>(null);
  const [followUpMessages, setFollowUpMessages] = useState<Record<string, string>>({});
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [view, setView] = useState<"search" | "prospected">("search");

  useEffect(() => {
    let active = true;
    authenticatedRequest<ProspectedLead[]>("/api/prospecting/leads/prospected")
      .then((leads) => { if (active) setProspectedLeads(leads); })
      .catch(() => { /* A tela continua funcional mesmo sem histórico carregado. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    try {
      const storedHistory = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (storedHistory) {
        const parsedHistory = JSON.parse(storedHistory) as SearchHistoryItem[];
        if (Array.isArray(parsedHistory)) {
          timer = window.setTimeout(() => setSearchHistory(parsedHistory), 0);
        }
      }
    } catch {
      window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    }
    return () => { if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const query = city.trim();
    if (!showCitySuggestions || query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingCities(true);
      try {
        const suggestions = await authenticatedRequest<CitySuggestion[]>(`/api/prospecting/cities/autocomplete?input=${encodeURIComponent(query)}&state=${encodeURIComponent(state)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setCitySuggestions(suggestions);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCitySuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCities(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [city, showCitySuggestions, state]);

  async function searchCompanies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResults(null);

    if (!segment.trim() || !city.trim() || state.trim().length !== 2) {
      setError("Informe o segmento, a cidade e a sigla do estado.");
      return;
    }

    setSearching(true);
    try {
      const companies = await authenticatedRequest<CompanySearchResult[]>("/api/prospecting/companies/search", {
        method: "POST",
        body: JSON.stringify({
          segment: segment.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          quantity,
        }),
      });
      saveSearchHistory({ segment: segment.trim(), city: city.trim(), state: state.trim().toUpperCase(), quantity });
      await analyzeAndRank(companies);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível buscar empresas agora.");
    } finally {
      setSearching(false);
    }
  }

  function saveSearchHistory(search: Omit<SearchHistoryItem, "id" | "searchedAt">) {
    const id = `${search.segment.toLowerCase()}|${search.city.toLowerCase()}|${search.state}|${search.quantity}`;
    const item: SearchHistoryItem = { ...search, id, searchedAt: new Date().toISOString() };
    setSearchHistory((current) => {
      const next = [item, ...current.filter((entry) => entry.id !== id)].slice(0, 10);
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function reuseSearch(item: SearchHistoryItem) {
    setSegment(item.segment);
    setCity(item.city);
    setState(item.state);
    setQuantity(item.quantity);
    setShowSearchHistory(false);
    setView("search");
  }

  function clearSearchHistory() {
    window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    setSearchHistory([]);
  }

  const relevantSearchHistory = searchHistory.filter((item) => item.segment.toLocaleLowerCase("pt-BR").includes(segment.trim().toLocaleLowerCase("pt-BR")));

  async function analyzeCompany(company: CompanySearchResult, resultId: string) {
    setError(null);
    setAnalysingId(resultId);

    try {
      const analysis = await authenticatedRequest<LeadAnalysis>("/api/prospecting/leads/analyze", {
        method: "POST",
        body: JSON.stringify(company),
      });
      setResults((current) => {
        if (!current) return null;
        const updated = current.map((item, index) => resultIdFor(item, index) === resultId ? { ...item, analysis } : item);
        return sortByPriority(updated);
      });
      setAnalysisModal({ company, analysis });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível analisar este lead agora.");
    } finally {
      setAnalysingId(null);
    }
  }

  async function analyzeAndRank(initialResults = results) {
    if (!initialResults?.length || rankingProgress !== null) return;

    setError(null);
    const nextResults = [...initialResults];
    setRankingProgress(0);
    setRankingTotal(nextResults.length);

    for (let index = 0; index < nextResults.length; index += 1) {
      const lead = nextResults[index];
      const resultId = resultIdFor(lead, index);
      setRankingProgress(index + 1);
      setAnalysingId(resultId);

      try {
        const analysis = lead.analysis ?? await authenticatedRequest<LeadAnalysis>("/api/prospecting/leads/analyze", {
          method: "POST",
          body: JSON.stringify(lead),
        });
        nextResults[index] = { ...lead, analysis };
      } catch {
        // Um lead com erro fica no fim da lista, sem interromper os outros.
      }
    }

    setResults(sortByPriority(nextResults));
    setAnalysingId(null);
    setRankingProgress(null);
    setRankingTotal(null);
  }

  async function openWhatsAppDecision(company: ProspectingResult, resultId: string) {
    const phoneDigits = company.phone?.replace(/\D/g, "") ?? "";
    const whatsappNumber = phoneDigits.startsWith("55") ? phoneDigits : phoneDigits ? `55${phoneDigits}` : "";
    if (!whatsappNumber) return;

    let resolvedCompany = company;
    let message = company.analysis?.message?.trim();
    if (!message) {
      setError(null);
      setAnalysingId(resultId);
      try {
        const analysis = await authenticatedRequest<LeadAnalysis>("/api/prospecting/leads/analyze", {
          method: "POST",
          body: JSON.stringify(company),
        });
        resolvedCompany = { ...company, analysis };
        message = analysis.message?.trim();
        setResults((current) => current ? current.map((item, index) => resultIdFor(item, index) === resultId ? resolvedCompany : item) : current);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Não foi possível gerar a mensagem do agente agora.");
        return;
      } finally {
        setAnalysingId(null);
      }
    }

    if (!message) {
      setError("O agente não gerou uma mensagem utilizável. Tente analisar o lead novamente.");
      return;
    }

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setWhatsAppDecision({ company: resolvedCompany, url });
  }

  async function finishWhatsAppDecision(markAsProspected: boolean) {
    if (!whatsAppDecision) return;
    if (!markAsProspected) {
      setWhatsAppDecision(null);
      return;
    }

    const company = whatsAppDecision.company;
    setSavingProspectedLead(true);
    try {
      const savedLead = await authenticatedRequest<ProspectedLead>("/api/prospecting/leads/prospected", {
        method: "POST",
        body: JSON.stringify({
          providerPlaceId: company.providerPlaceId,
          name: company.name,
          category: company.category,
          city: company.city,
          state: company.state,
          publicAddress: company.publicAddress,
          website: company.website,
          phone: company.phone,
          sourceUrl: company.sourceUrl,
          priorityScore: company.analysis?.score ?? null,
          openingMessage: company.analysis?.message ?? null,
        }),
      });
      setProspectedLeadKeys((current) => current.includes(leadKeyFor(company)) ? current : [...current, leadKeyFor(company)]);
      setProspectedLeads((current) => current.some((lead) => lead.id === savedLead.id) ? current : [savedLead, ...current]);
      setWhatsAppDecision(null);
      setView("prospected");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível salvar este lead prospectado.");
    } finally {
      setSavingProspectedLead(false);
    }
  }

  async function registerFollowUp(lead: ProspectedLead) {
    setError(null);
    setRegisteringFollowUpId(lead.id);
    try {
      const updatedLead = await authenticatedRequest<ProspectedLead>(`/api/prospecting/leads/prospected/${lead.id}/follow-ups`, {
        method: "POST",
      });
      setProspectedLeads((current) => current.map((item) => item.id === updatedLead.id ? updatedLead : item));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível registrar o follow-up agora.");
    } finally {
      setRegisteringFollowUpId(null);
    }
  }

  async function generateFollowUpMessage(lead: ProspectedLead) {
    setError(null);
    setGeneratingFollowUpId(lead.id);
    try {
      const response = await authenticatedRequest<{ message: string }>(`/api/prospecting/leads/prospected/${lead.id}/follow-up-message`, {
        method: "POST",
      });
      setFollowUpMessages((current) => ({ ...current, [lead.id]: response.message }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível gerar o follow-up com IA agora.");
    } finally {
      setGeneratingFollowUpId(null);
    }
  }

  return (
    <section className="mt-7 space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#efede8] bg-white p-2">
        <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${view === "search" ? "bg-[#20212a] text-white" : "text-[#64636a] hover:bg-[#f4f3f0]"}`} onClick={() => setView("search")} type="button">Pesquisar empresas</button>
        <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${view === "prospected" ? "bg-[#20212a] text-white" : "text-[#64636a] hover:bg-[#f4f3f0]"}`} onClick={() => setView("prospected")} type="button">Prospectados <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5 text-xs">{prospectedLeads.length}</span></button>
      </div>

      {view === "search" ? <>
      <div className="rounded-3xl border border-[#efede8] bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Pesquisa de empresas</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-[#202126]">Encontre potenciais clientes</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#85817a]">Busque negócios públicos por segmento e localização. Os resultados ainda não são salvos na sua carteira.</p>
          </div>
          <span className="w-fit rounded-full bg-[#f3f1ec] px-3 py-1.5 text-xs font-medium text-[#6d6962]">Busca real</span>
        </div>

        <form className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_100px_120px_auto]" onSubmit={searchCompanies}>
          <label className="relative block text-xs font-semibold text-[#666770]">
            <span className="mb-1.5 block">Segmento</span>
            <input className="field" onBlur={() => window.setTimeout(() => setShowSearchHistory(false), 150)} onChange={(event) => { setSegment(event.target.value); setShowSearchHistory(true); }} onFocus={() => setShowSearchHistory(true)} placeholder="Ex.: clínicas médicas" required value={segment} />
            {showSearchHistory && relevantSearchHistory.length ? <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-[#e6e6ee] bg-white p-1 shadow-xl">
              <div className="flex items-center justify-between px-3 py-2"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#858690]">Pesquisas recentes</span><button className="text-[11px] font-semibold text-[#a24949] hover:underline" onMouseDown={(event) => event.preventDefault()} onClick={clearSearchHistory} type="button">Limpar</button></div>
              {relevantSearchHistory.map((item) => <button className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#f3f2ef]" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => reuseSearch(item)} type="button"><span className="block truncate text-sm font-semibold text-[#30313a]">{item.segment}</span><span className="mt-0.5 block text-xs text-[#85817a]">{item.city}/{item.state} · {item.quantity} empresas</span></button>)}
            </div> : null}
          </label>
          <label className="relative block text-xs font-semibold text-[#666770]">
            <span className="mb-1.5 block">Cidade</span>
            <input className="field" onBlur={() => window.setTimeout(() => setShowCitySuggestions(false), 150)} onChange={(event) => { setCity(event.target.value); setShowCitySuggestions(true); }} onFocus={() => setShowCitySuggestions(true)} placeholder="Ex.: Montes Claros" required value={city} />
            {showCitySuggestions && city.trim().length >= 2 ? <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#e6e6ee] bg-white p-1 shadow-xl">
              {loadingCities ? <p className="px-3 py-2 text-xs text-[#85817a]">Buscando cidades...</p> : citySuggestions.length ? citySuggestions.map((suggestion) => <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#3e3e46] transition hover:bg-[#f3f2ef]" key={`${suggestion.city}-${suggestion.label}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setCity(suggestion.city); if (suggestion.state) setState(suggestion.state); setShowCitySuggestions(false); }} type="button"><span className="block font-medium">{suggestion.city}</span><span className="block truncate text-xs text-[#85817a]">{suggestion.label}</span></button>) : <p className="px-3 py-2 text-xs text-[#85817a]">Nenhuma cidade encontrada.</p>}
            </div> : null}
          </label>
          <Field label="UF">
            <select className="field" onChange={(event) => setState(event.target.value)} value={state}>
              {brazilianStates.map(([abbreviation, name]) => <option key={abbreviation} value={abbreviation}>{abbreviation} — {name}</option>)}
            </select>
          </Field>
          <Field label="Quantidade">
            <select className="field" onChange={(event) => setQuantity(Number(event.target.value))} value={quantity}>
              {amounts.map((amount) => <option key={amount} value={amount}>{amount}</option>)}
            </select>
          </Field>
          <button className="h-[42px] self-end rounded-xl bg-[#20212a] px-5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:cursor-not-allowed disabled:opacity-50" disabled={searching} type="submit">
            {rankingProgress !== null ? "Analisando..." : searching ? "Buscando..." : "Buscar empresas"}
          </button>
        </form>
        {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="rounded-3xl border border-[#efede8] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Resultados</p>
            <p className="mt-1 text-sm text-[#85817a]">{rankingProgress !== null ? `Analisando e ordenando ${rankingProgress}/${rankingTotal ?? 0} leads...` : results === null ? "Faça uma busca para ver empresas." : `${results.length} empresa${results.length === 1 ? " encontrada" : "s encontradas"}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {results?.length ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#353640] disabled:cursor-wait disabled:opacity-60" disabled={rankingProgress !== null} onClick={() => analyzeAndRank()} type="button">{rankingProgress !== null ? `Analisando ${rankingProgress}/${results.length}` : "Reanalisar e ordenar"}</button> : null}
            {results !== null ? <span className="rounded-full bg-[#f3f1ec] px-3 py-1.5 text-xs font-medium text-[#6d6962]">{results.length} resultado{results.length === 1 ? "" : "s"}</span> : null}
          </div>
        </div>

        {rankingProgress !== null && results === null ? <AnalysisProgress progress={rankingProgress} total={rankingTotal ?? 0} /> : results === null ? <EmptyState /> : results.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#dcdde6] px-4 py-10 text-center text-sm text-[#85817a]">Nenhuma empresa foi encontrada. Tente outro segmento ou uma cidade próxima.</div> : <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {results.map((company, index) => {
            const resultId = resultIdFor(company, index);
            return <CompanyCard analysing={analysingId === resultId} company={company} index={index} key={resultId} onAnalyze={() => analyzeCompany(company, resultId)} onWhatsApp={() => openWhatsAppDecision(company, resultId)} prospected={prospectedLeadKeys.includes(leadKeyFor(company))} />;
          })}
        </div>}
      </div>
      </> : <ProspectedLeadsPanel followUpMessages={followUpMessages} generatingFollowUpId={generatingFollowUpId} leads={prospectedLeads} onGenerateFollowUpMessage={generateFollowUpMessage} onRegisterFollowUp={registerFollowUp} registeringFollowUpId={registeringFollowUpId} />}

      {analysisModal ? <AnalysisModal onClose={() => setAnalysisModal(null)} state={analysisModal} /> : null}
      {whatsAppDecision ? <WhatsAppDecisionModal companyName={whatsAppDecision.company.name || "este lead"} isSaving={savingProspectedLead} onChoose={finishWhatsAppDecision} onClose={() => setWhatsAppDecision(null)} /> : null}

      <style jsx>{`
        .field { width: 100%; border-radius: 0.75rem; border: 1px solid #e6e6ee; background: #fbfbfe; padding: 0.625rem 0.75rem; font-size: 0.875rem; color: #20212a; outline: none; }
        .field::placeholder { color: #b4b5bf; }
        .field:focus { border-color: #6d6e79; }
      `}</style>
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block text-xs font-semibold text-[#666770]"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function EmptyState() {
  return <div className="mt-5 rounded-2xl border border-dashed border-[#dcdde6] bg-[#fbfbfe] px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-lg text-[#58585d] shadow-sm">⌕</span><p className="mt-4 font-semibold text-[#2a2b31]">Comece uma pesquisa</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#85817a]">Use segmento e cidade para descobrir empresas que podem se tornar clientes.</p></div>;
}

function AnalysisProgress({ progress, total }: { progress: number; total: number }) {
  const percentage = total ? Math.round((progress / total) * 100) : 0;

  return <div className="mt-5 rounded-2xl border border-[#e6e6ee] bg-[#fbfbfd] px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#20212a] text-lg text-white">✦</span><p className="mt-4 font-semibold text-[#2a2b31]">Analisando seus leads</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#85817a]">Estamos avaliando cada empresa e preparando o ranking de prioridade.</p><div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-[#e8e8ed]"><div className="h-full rounded-full bg-[#20212a] transition-all duration-500" style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-xs font-semibold text-[#666770]">{progress} de {total}</p></div>;
}

function resultIdFor(company: CompanySearchResult, index: number) {
  return company.providerPlaceId ?? `${company.name}-${index}`;
}

function leadKeyFor(company: CompanySearchResult) {
  return company.providerPlaceId ?? `${company.name ?? "sem-nome"}-${company.city}-${company.state}-${company.phone ?? "sem-telefone"}`;
}

function sortByPriority(results: ProspectingResult[]) {
  return [...results].sort((first, second) => (second.analysis?.score ?? -1) - (first.analysis?.score ?? -1));
}

function CompanyCard({ analysing, company, index, onAnalyze, onWhatsApp, prospected }: { analysing: boolean; company: ProspectingResult; index: number; onAnalyze: () => void; onWhatsApp: () => void; prospected: boolean }) {
  const name = company.name || "Empresa sem nome informado";
  const initials = name.slice(0, 1).toUpperCase();
  const phoneDigits = company.phone?.replace(/\D/g, "") ?? "";
  const whatsappNumber = phoneDigits.startsWith("55") ? phoneDigits : phoneDigits ? `55${phoneDigits}` : "";
  const canUseWhatsApp = Boolean(whatsappNumber);
  const hasAgentMessage = Boolean(company.analysis?.message?.trim());

  return <article className="rounded-2xl border border-[#eceaf0] bg-[#fafafd] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#20212a] text-sm font-bold text-white">{initials}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-[#202126]">{name}</p>
        <p className="mt-1 truncate text-sm text-[#85817a]">{company.category || "Categoria não informada"}</p>
      </div>
      <span className="rounded-full bg-[#f0efeb] px-2.5 py-1 text-[11px] font-medium text-[#6d6962]">#{index + 1}</span>
    </div>

    <dl className="mt-5 space-y-2 border-t border-[#e8e8ef] pt-4 text-sm">
      <Info label="Localização" value={`${company.city}/${company.state}`} />
      <Info label="Endereço" value={company.publicAddress || "Não informado"} />
      <Info label="Telefone" value={company.phone || "Não informado"} />
    </dl>

    <div className="mt-5 flex flex-wrap gap-2">
      {company.analysis ? <span className="rounded-xl bg-[#dff5e7] px-3 py-2 text-xs font-bold text-[#16703b]">Prioridade {company.analysis.score}/100</span> : null}
      {company.analysis ? <span className="rounded-xl bg-[#edf1fb] px-3 py-2 text-xs font-semibold text-[#40507b]">Pronto para abordagem</span> : null}
      {company.website ? <span className="rounded-xl bg-[#f0eff8] px-3 py-2 text-xs font-semibold text-[#55507c]">Possui site</span> : <span className="rounded-xl bg-[#fff0d8] px-3 py-2 text-xs font-semibold text-[#9a5a00]">Sem site informado</span>}
      {prospected ? <span className="rounded-xl bg-[#e4f7ec] px-3 py-2 text-xs font-semibold text-[#197044]">Prospectado</span> : null}
      <button className="rounded-xl border border-[#20212a] bg-white px-3 py-2 text-xs font-semibold text-[#20212a] transition hover:bg-[#f0f0f4] disabled:cursor-wait disabled:opacity-60" disabled={analysing} onClick={onAnalyze} type="button">{analysing ? "Analisando..." : "Analisar lead"}</button>
      {company.website ? <a className="rounded-xl border border-[#dce0ea] bg-white px-3 py-2 text-xs font-semibold text-[#40507b] transition hover:bg-[#edf1fb]" href={company.website} rel="noreferrer" target="_blank">Abrir site</a> : null}
      {company.sourceUrl ? <a className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#353640]" href={company.sourceUrl} rel="noreferrer" target="_blank">Ver no Maps</a> : null}
      {canUseWhatsApp ? <button className="rounded-xl bg-[#1f9d55] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#178244] disabled:cursor-wait disabled:opacity-60" disabled={analysing} onClick={onWhatsApp} type="button">{analysing ? "Gerando mensagem..." : hasAgentMessage ? "Chamar no WhatsApp" : "Gerar e abrir WhatsApp"}</button> : null}
    </div>
  </article>;
}

function WhatsAppDecisionModal({ companyName, isSaving, onChoose, onClose }: { companyName: string; isSaving: boolean; onChoose: (markAsProspected: boolean) => void; onClose: () => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-[#16161b]/40 p-4 backdrop-blur-sm" onClick={onClose} role="dialog">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e4f7ec] text-lg text-[#197044]">✓</span>
      <h3 className="mt-5 text-xl font-bold text-[#202126]">Marcar como prospectado?</h3>
      <p className="mt-2 text-sm leading-6 text-[#706f76]">O WhatsApp de {companyName} foi aberto. Você realizou a prospecção?</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="rounded-xl border border-[#dfe0e7] px-4 py-2.5 text-sm font-semibold text-[#34343a] transition hover:bg-[#f5f5f7] disabled:opacity-50" disabled={isSaving} onClick={() => onChoose(false)} type="button">Não</button>
        <button className="rounded-xl bg-[#1f9d55] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#178244] disabled:opacity-50" disabled={isSaving} onClick={() => onChoose(true)} type="button">{isSaving ? "Salvando..." : "Sim, salvar prospectado"}</button>
      </div>
    </div>
  </div>;
}

function ProspectedLeadsPanel({ leads, onRegisterFollowUp, registeringFollowUpId, onGenerateFollowUpMessage, generatingFollowUpId, followUpMessages }: {
  leads: ProspectedLead[];
  onRegisterFollowUp: (lead: ProspectedLead) => void;
  registeringFollowUpId: string | null;
  onGenerateFollowUpMessage: (lead: ProspectedLead) => void;
  generatingFollowUpId: string | null;
  followUpMessages: Record<string, string>;
}) {
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);

  async function copyFollowUpMessage(lead: ProspectedLead, message: string) {
    await navigator.clipboard.writeText(message);
    setCopiedLeadId(lead.id);
    window.setTimeout(() => setCopiedLeadId(null), 1800);
  }

  return <section className="rounded-3xl border border-[#efede8] bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Histórico de prospecção</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-[#202126]">Clientes prospectados</h2>
        <p className="mt-1 text-sm text-[#85817a]">Registre seus contatos e siga uma cadência profissional de 7, 15 e 30 dias.</p>
      </div>
      <span className="rounded-full bg-[#e4f7ec] px-3 py-1.5 text-xs font-semibold text-[#197044]">{leads.length} prospectado{leads.length === 1 ? "" : "s"}</span>
    </div>

    <div className="mt-5 rounded-2xl border border-[#e6e7ec] bg-[#fbfbfd] p-3.5 text-sm text-[#64636a] sm:p-4">
      <p className="font-semibold text-[#30313a]">Roteiro sugerido</p>
      <p className="mt-1 leading-6">1º retorno em 7 dias, 2º em 15 dias e último em 30 dias após a prospecção. Depois, retome no máximo uma vez por mês e apenas se houver um motivo relevante.</p>
    </div>

    {leads.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#dcdde6] bg-[#fbfbfe] px-5 py-12 text-center"><p className="font-semibold text-[#2a2b31]">Nenhum cliente prospectado ainda</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#85817a]">Abra o WhatsApp de um lead e confirme “Sim” para criar seu histórico de contatos.</p></div> : <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {leads.map((lead) => {
        const guidance = followUpGuidance(lead);
        const message = followUpMessages[lead.id];
        const isSaving = registeringFollowUpId === lead.id;
        const isGeneratingMessage = generatingFollowUpId === lead.id;
        const phoneDigits = lead.phone?.replace(/\D/g, "") ?? "";
        const whatsappNumber = phoneDigits.startsWith("55") ? phoneDigits : phoneDigits ? `55${phoneDigits}` : "";
        const whatsappUrl = message && whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : null;
        return <article className="rounded-2xl border border-[#eceaf0] bg-[#fafafd] p-4 sm:p-5" key={lead.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1f9d55] text-sm font-bold text-white">{lead.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-bold text-[#202126]">{lead.name}</p><p className="mt-1 truncate text-sm text-[#85817a]">{lead.category || "Segmento não informado"}</p></div>
            </div>
            <span className="w-fit shrink-0 rounded-full bg-[#e4f7ec] px-2.5 py-1 text-[11px] font-semibold text-[#197044] sm:ml-auto">Prospectado</span>
          </div>
          <dl className="mt-5 space-y-2 border-t border-[#e8e8ef] pt-4 text-sm">
            <Info label="Prospectado em" value={formatDateTime(lead.prospectedAt)} />
            <Info label="Localização" value={`${lead.city}/${lead.state}`} />
            <Info label="Telefone" value={lead.phone || "Não informado"} />
            <Info label="Site" value={lead.website || "Não informado"} />
          </dl>
          <div className={`mt-4 rounded-xl border p-3 ${guidance.paused ? "border-[#ece5da] bg-[#f5f2eb]" : "border-[#d8ece0] bg-[#f1faf4]"}`}>
            <p className={`text-xs font-bold ${guidance.paused ? "text-[#786d5f]" : "text-[#197044]"}`}>{guidance.title}</p>
            <p className="mt-1 text-sm leading-5 text-[#575860]">{guidance.description}</p>
            {lead.nextFollowUpDate ? <p className="mt-2 text-xs font-semibold text-[#3b5946]">Próximo contato: {formatDate(lead.nextFollowUpDate)}</p> : null}
          </div>
          {message ? <div className="mt-3 rounded-xl border border-[#e1e2e8] bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#777880]">Mensagem sugerida</p>
            <p className="mt-2 text-sm leading-6 text-[#4e4f57]">{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-lg border border-[#dfe0e7] px-3 py-2 text-xs font-semibold text-[#34343a] transition hover:bg-[#f5f5f7]" onClick={() => copyFollowUpMessage(lead, message)} type="button">{copiedLeadId === lead.id ? "Mensagem copiada" : "Copiar mensagem"}</button>
              {whatsappUrl ? <a className="rounded-lg bg-[#1f9d55] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#178244]" href={whatsappUrl} rel="noreferrer" target="_blank">Abrir no WhatsApp</a> : null}
            </div>
          </div> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {lead.priorityScore !== null ? <p className="text-xs font-semibold text-[#59605e]">Prioridade: {lead.priorityScore}/100</p> : <span />}
            {!guidance.paused ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              {!message ? <button className="w-full rounded-xl border border-[#20212a] bg-white px-3 py-2 text-xs font-semibold text-[#20212a] transition hover:bg-[#f0f0f4] disabled:cursor-wait disabled:opacity-60 sm:w-auto" disabled={isGeneratingMessage} onClick={() => onGenerateFollowUpMessage(lead)} type="button">{isGeneratingMessage ? "Gerando com IA..." : "Gerar mensagem com IA"}</button> : null}
              <button className="w-full rounded-xl bg-[#20212a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#353640] disabled:cursor-wait disabled:opacity-60 sm:w-auto" disabled={isSaving || !message} onClick={() => onRegisterFollowUp(lead)} type="button">{isSaving ? "Registrando..." : "Registrar follow-up"}</button>
            </div> : null}
          </div>
        </article>;
      })}
    </div>}
  </section>;
}

function followUpGuidance(lead: ProspectedLead) {
  if (lead.followUpCount >= 3) {
    return { paused: false, title: "Reativação mensal", description: "A cadência inicial foi concluída. Faça no máximo um contato por mês, somente se tiver uma abordagem nova e relevante." };
  }
  if (!lead.nextFollowUpDate) {
    return { paused: true, title: "Aguardando agendamento", description: "Este lead ainda não possui uma próxima data de follow-up." };
  }

  const stage = lead.followUpCount + 1;
  const descriptions = [
    "1º retorno: uma mensagem curta perguntando se conseguiu ver sua primeira abordagem.",
    "2º retorno: envie uma sugestão mais concreta relacionada à presença digital do negócio.",
    "Último retorno: encerre de forma educada e deixe a porta aberta para falar no futuro.",
  ];
  return { paused: false, title: `${stage}º follow-up recomendado`, description: descriptions[lead.followUpCount] };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function AnalysisModal({ onClose, state }: { onClose: () => void; state: AnalysisModalState }) {
  const [copied, setCopied] = useState(false);
  const { analysis, company } = state;
  const canContact = Boolean(analysis.message);
  const statusLabel = "Pronto para abordagem";
  const confidenceLabel = { HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" }[analysis.confidence];
  const phoneDigits = company.phone?.replace(/\D/g, "") ?? "";
  const whatsappNumber = phoneDigits.startsWith("55") ? phoneDigits : phoneDigits ? `55${phoneDigits}` : "";
  const whatsappUrl = canContact && whatsappNumber && analysis.message ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(analysis.message)}` : null;

  async function copyMessage() {
    if (!analysis.message) return;
    await navigator.clipboard.writeText(analysis.message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-[#16161b]/40 p-4 backdrop-blur-sm" role="dialog">
    <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Análise assistida por IA</p>
          <h3 className="mt-2 text-xl font-bold text-[#202126]">{company.name || "Lead selecionado"}</h3>
          <p className="mt-1 text-sm text-[#85817a]">Revise a sugestão antes de qualquer contato.</p>
        </div>
        <button aria-label="Fechar análise" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f2f1ee] text-lg text-[#5e5d62] transition hover:bg-[#e6e4df]" onClick={onClose} type="button">×</button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="rounded-2xl bg-[#20212a] p-5 text-white">
          <p className="text-xs font-medium text-white/65">Prioridade</p>
          <p className="mt-2 text-4xl font-bold">{analysis.score}<span className="text-lg text-white/60">/100</span></p>
          <p className="mt-4 text-sm font-semibold text-white">{statusLabel}</p>
          <p className="mt-1 text-xs leading-5 text-white/75">Confiança: {confidenceLabel}</p>
        </div>
        <div className="rounded-2xl border border-[#eceaf0] bg-[#fbfbfd] p-5">
          <p className="text-sm font-bold text-[#202126]">Oportunidade</p>
          <p className="mt-2 text-sm leading-6 text-[#605f66]">{analysis.opportunity}</p>
          <p className="mt-4 text-sm font-bold text-[#202126]">Abordagem sugerida</p>
          <p className="mt-2 text-sm leading-6 text-[#605f66]">{analysis.suggestedApproach}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#dfe5ef] bg-[#f8fbff] p-5">
        <p className="text-sm font-bold text-[#202126]">Observação usada pelo agente</p>
        <p className="mt-2 text-sm leading-6 text-[#605f66]">{analysis.observationUsed || "Nenhuma observação pública verificável foi encontrada com os dados atuais."}</p>
        {analysis.openingChosen ? <p className="mt-3 text-xs leading-5 text-[#777780]">Abertura escolhida: {analysis.openingChosen}</p> : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AnalysisList items={analysis.strengths} title="Sinais positivos" tone="positive" />
        <AnalysisList items={analysis.cautions} title="Cuidados" tone="caution" />
      </div>

      {canContact && analysis.message ? <div className="mt-4 rounded-2xl border border-[#e5e4ea] p-5">
        <p className="text-sm font-bold text-[#202126]">Mensagem para primeiro contato</p>
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#f7f7f9] p-4 text-sm leading-6 text-[#55545b]">{analysis.message}</p>
        {analysis.followUp3Days ? <div className="mt-3 rounded-xl border border-[#eceaf0] bg-[#fbfbfd] p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#858690]">Follow-up em 3 dias</p><p className="mt-1 text-sm leading-6 text-[#605f66]">{analysis.followUp3Days}</p></div> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="rounded-xl border border-[#dfe0e7] px-4 py-2.5 text-sm font-semibold text-[#34343a] transition hover:bg-[#f5f5f7]" onClick={copyMessage} type="button">{copied ? "Mensagem copiada" : "Copiar mensagem"}</button>
          {whatsappUrl ? <a className="rounded-xl bg-[#1f9d55] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#178244]" href={whatsappUrl} rel="noreferrer" target="_blank">Abrir no WhatsApp</a> : null}
        </div>
      </div> : <div className="mt-4 rounded-2xl border border-[#e5e4ea] bg-[#fbfbfd] p-5"><p className="text-sm font-bold text-[#202126]">Mensagem indisponível</p><p className="mt-2 text-sm leading-6 text-[#605f66]">Faça uma nova análise deste lead para gerar a abordagem.</p></div>}
    </div>
  </div>;
}

function AnalysisList({ items, title, tone }: { items: string[]; title: string; tone: "positive" | "caution" }) {
  const marker = tone === "positive" ? "bg-[#dff5e7] text-[#16703b]" : "bg-[#fff0d8] text-[#9a5a00]";
  return <div className="rounded-2xl border border-[#eceaf0] p-5"><p className="text-sm font-bold text-[#202126]">{title}</p><ul className="mt-3 space-y-2.5">{items.map((item, index) => <li className="flex gap-2 text-sm leading-5 text-[#65646b]" key={`${title}-${index}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${marker}`} />{item}</li>)}</ul></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 sm:grid-cols-[86px_minmax(0,1fr)]"><dt className="text-xs font-medium text-[#999aa5]">{label}</dt><dd className="min-w-0 break-words text-[#54545d] sm:truncate" title={value}>{value}</dd></div>;
}
