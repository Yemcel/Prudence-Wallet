import React, { useEffect, useState, useCallback } from "react";
import { styles } from "./styles/theme.js";
import { api } from "./lib/api.js";

import CoverageCard from "./components/CoverageCard.jsx";
import SpendingDonut from "./components/SpendingDonut.jsx";
import PendingList from "./components/PendingList.jsx";
import SpectrumBar from "./components/SpectrumBar.jsx";
import SavingsProjection from "./components/SavingsProjection.jsx";
import LearnedRules from "./components/LearnedRules.jsx";
import ConnectionsPanel from "./components/ConnectionsPanel.jsx";
import TransactionList from "./components/TransactionList.jsx";
import CoachModal from "./components/CoachModal.jsx";
import AddManualModal from "./components/AddManualModal.jsx";
import ConnectAccountsModal from "./components/ConnectAccountsModal.jsx";
import NudgeBanner from "./components/NudgeBanner.jsx";
import HomeCurrencySelector from "./components/HomeCurrencySelector.jsx";

export default function App() {
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [ranked, setRanked] = useState([]);
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [activeTx, setActiveTx] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudges, setNudges] = useState([]);
  const [homeCurrency, setHomeCurrency] = useState("USD");

  const refresh = useCallback(async () => {
    try {
      const [summaryData, pendingData, rankedData, rulesData, accountsData, settingsData] = await Promise.all([
        api.getSummary(),
        api.getPending(),
        api.getTransactions(),
        api.getLearnedRules(),
        api.getAccounts(),
        api.getSettings(),
      ]);
      setSummary(summaryData);
      setPending(pendingData);
      setRanked(rankedData);
      setRules(rulesData);
      setAccounts(accountsData);
      setHomeCurrency(settingsData.homeCurrency);
      setLoadError(null);
    } catch (e) {
      setLoadError(`Couldn't reach the backend at the configured API URL. Is it running? (${e.message})`);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNudges = useCallback(async () => {
    try {
      const data = await api.getNudges();
      setNudges(data);
    } catch {
      // nudges are a nice-to-have overlay — a failed poll shouldn't break the rest of the app
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshNudges();
    // Polling stands in for a push channel (websocket/SSE) in this prototype —
    // in production, push new nudges to the client as soon as they're created
    // instead of polling every 15s.
    const interval = setInterval(refreshNudges, 15000);
    return () => clearInterval(interval);
  }, [refresh, refreshNudges]);

  const handleResolved = () => {
    setActiveTx(null);
    refresh();
    refreshNudges();
  };

  const handleManualAdded = (created) => {
    setAddOpen(false);
    refresh();
    refreshNudges();
    // Manual entries always start unranked — go straight into the coaching conversation
    setActiveTx(created);
  };

  const handleOverrideRank = async (id, rank) => {
    await api.setRank(id, rank, "user_override");
    refresh();
  };

  const handleDismissNudge = async (id) => {
    setNudges((n) => n.filter((x) => x.id !== id)); // optimistic
    await api.dismissNudge(id);
  };

  return (
    <div style={styles.page}>
      <header style={{ ...styles.header, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={styles.eyebrow}>Ledger</div>
          <h1 style={styles.title}>Every source, one honest picture</h1>
        </div>
        <HomeCurrencySelector homeCurrency={homeCurrency} onChanged={(c) => { setHomeCurrency(c); refresh(); }} />
      </header>

      {loadError && (
        <div style={{ ...styles.card, marginBottom: 22, color: "#A83B32", fontSize: 13 }}>{loadError}</div>
      )}

      {loading && !loadError && (
        <div style={{ ...styles.card, marginBottom: 22, color: "#6B7280", fontSize: 13 }}>
          Loading your ledger... the free hosting tier can take up to a minute to wake up after being idle.
        </div>
      )}

      <NudgeBanner nudges={nudges} onDismiss={handleDismissNudge} />

      <CoverageCard summary={summary} onAddManual={() => setAddOpen(true)} />
      <SpendingDonut summary={summary} />
      <PendingList pending={pending} onOpenCoach={setActiveTx} />
      <SpectrumBar summary={summary} />
      <SavingsProjection summary={summary} />
      <LearnedRules rules={rules} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={styles.sectionHeading}>Connections</div>
        <button style={styles.addBtn} onClick={() => setConnectOpen(true)}>+ Connect account</button>
      </div>
      <ConnectionsPanel accounts={accounts} />

      <TransactionList transactions={ranked} onOverrideRank={handleOverrideRank} />

      {activeTx && <CoachModal transaction={activeTx} onClose={() => setActiveTx(null)} onResolved={handleResolved} />}
      {addOpen && <AddManualModal onClose={() => setAddOpen(false)} onAdded={handleManualAdded} />}
      {connectOpen && (
        <ConnectAccountsModal
          onClose={() => setConnectOpen(false)}
          onConnected={() => {
            setConnectOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
