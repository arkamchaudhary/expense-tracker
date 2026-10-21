import { useEffect, useState } from "react";
import Auth from "./Auth";
import "./App.css";
import { supabase } from "./lib/supabaseClient";

function emptyForm() {
  return {
    type: "Expense",
    amount: "",
    category: "Grocery",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    payment_method: "",
  };
}

function downloadTransactionsCSV(items, filename) {
  if (items.length === 0) return;
  const rows = [
    ["Date", "Type", "Category", "Amount (INR)", "Payment method", "Notes"],
    ...items.map((transaction) => [
      transaction.date,
      transaction.type,
      transaction.category,
      Number(transaction.amount).toFixed(2),
      transaction.payment_method ?? "",
      transaction.notes ?? "",
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showHome, setShowHome] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [budgets, setBudgets] = useState([]);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("expense-tracker-theme") || "light");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [selectedMonth, setSelectedMonth] = useState("all");
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [reportStartDate, setReportStartDate] = useState(`${todayISO.slice(0, 7)}-01`);
  const [reportEndDate, setReportEndDate] = useState(todayISO);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [budgetForm, setBudgetForm] = useState({
    month: new Date().toISOString().slice(0, 7),
    category: "Grocery",
    amount: "",
  });

  const userId = session?.user?.id;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("expense-tracker-theme", theme);
  }, [theme]);

  useEffect(() => {
    const metadata = session?.user?.user_metadata ?? {};
    const name = metadata.full_name || metadata.name || session?.user?.email || "";
    setDisplayName(name);
    setProfileDraft(name);
    setProfileAvatar(metadata.avatar_url || "");
    setAvatarFile(null);
    setAvatarPreview("");
  }, [session?.user?.id, session?.user?.user_metadata?.full_name, session?.user?.user_metadata?.name, session?.user?.email]);

  // Login session check karo aur login/logout changes suno.
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Session check error:", error);
      setSession(data?.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sirf logged-in user ke transactions Supabase se load karo.
  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setTransactionsLoaded(false);
      return;
    }

    let cancelled = false;

    async function loadTransactions() {
      setTransactionsLoaded(false);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Transactions load error:", error);
        alert(`Transactions load nahi hue: ${error.message}`);
        setTransactions([]);
      } else {
        setTransactions(data ?? []);
      }

      setTransactionsLoaded(true);
    }

    loadTransactions();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBudgets([]);
      return;
    }

    let cancelled = false;

    async function loadBudgets() {
      const { data, error } = await supabase
        .from("category_budgets")
        .select("*")
        .eq("user_id", userId)
        .order("month", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Budgets load error:", error);
        alert(`Budgets load nahi hue: ${error.message}`);
        setBudgets([]);
      } else {
        setBudgets(data ?? []);
      }
    }

    loadBudgets();

    return () => {
      cancelled = true;
    };
  }, [userId]);
  const availableMonths = Array.from(new Set(transactions.map((transaction) => transaction.date?.slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const filteredTransactions = transactions.filter(
    (transaction) => selectedMonth === "all" || transaction.date?.startsWith(selectedMonth)
  );

  const visibleTransactions = filteredTransactions.filter((transaction) => {
    const matchesType = selectedType === "all" || transaction.type === selectedType;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [transaction.category, transaction.date, transaction.type, transaction.amount]
        .some((value) => String(value ?? "").toLowerCase().includes(query));

    return matchesType && matchesSearch;
  });

  const totalIncome = filteredTransactions
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const totalExpense = filteredTransactions
    .filter((transaction) => transaction.type === "Expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const balance = totalIncome - totalExpense;

  const reportRangeValid = reportStartDate <= reportEndDate;
  const reportTransactions = reportRangeValid
    ? transactions.filter(
        (transaction) =>
          transaction.date >= reportStartDate && transaction.date <= reportEndDate
      )
    : [];
  const reportIncome = reportTransactions
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const reportExpense = reportTransactions
    .filter((transaction) => transaction.type === "Expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const reportBalance = reportIncome - reportExpense;

  function handleDownloadDateReport() {
    if (!reportRangeValid || reportTransactions.length === 0) return;

    const rows = [
      ["Date", "Type", "Category", "Amount (INR)", "Payment method", "Notes"],
      ...reportTransactions.map((transaction) => [
        transaction.date,
        transaction.type,
        transaction.category,
        Number(transaction.amount).toFixed(2),
        transaction.payment_method ?? "",
        transaction.notes ?? "",
      ]),
      [],
      ["Report total income", reportIncome.toFixed(2)],
      ["Report total expenses", reportExpense.toFixed(2)],
      ["Report net balance", reportBalance.toFixed(2)],
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expense-report-${reportStartDate}-to-${reportEndDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const expensesByCategory = Object.entries(
    filteredTransactions
      .filter((transaction) => transaction.type === "Expense")
      .reduce((totals, transaction) => {
        const category = transaction.category || "Other";
        totals[category] = (totals[category] || 0) + Number(transaction.amount);
        return totals;
      }, {})
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const budgetsForMonth = budgets
    .filter((budget) => budget.month === budgetForm.month)
    .map((budget) => {
      const spent = transactions
        .filter(
          (transaction) =>
            transaction.type === "Expense" &&
            transaction.category === budget.category &&
            transaction.date?.startsWith(budget.month)
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const percentage = (spent / Number(budget.limit_amount)) * 100;

      return {
        ...budget,
        spent,
        percentage,
        notice:
          percentage >= 100
            ? "Budget limit reached or exceeded"
            : percentage >= 80
              ? "Almost at your budget limit"
              : "You are on track",
      };
    });
  function handleTypeChange(event) {
    const type = event.target.value;

    setFormData({
      ...formData,
      type,
      category: type === "Expense" ? "Grocery" : "Salary",
    });
  }

  function handleOpenAddForm() {
    setEditingId(null);
    setFormData(emptyForm());
    setIsFormOpen(true);
  }

  function handleEditTransaction(transaction) {
    setEditingId(transaction.id);
    setFormData({
      type: transaction.type,
      amount: transaction.amount,
      category: transaction.category,
      date: transaction.date,
      notes: transaction.notes ?? "",
      payment_method: transaction.payment_method ?? "",
    });
    setIsFormOpen(true);
  }

  async function handleDeleteTransaction(id) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Transaction delete error:", error);
      alert(`Transaction delete nahi hua: ${error.message}`);
      return;
    }

    setTransactions((current) =>
      current.filter((transaction) => transaction.id !== id)
    );
  }

  async function handleSaveTransaction(event) {
    event.preventDefault();

    const amount = Number(formData.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Amount zero se zyada hona chahiye.");
      return;
    }

    const transactionData = {
      type: formData.type,
      amount,
      category: formData.category,
      date: formData.date,
      notes: formData.notes.trim() || null,
      payment_method: formData.payment_method || null,
    };

    let savedTransaction;
    let error;

    if (editingId !== null) {
      const result = await supabase
        .from("transactions")
        .update(transactionData)
        .eq("id", editingId)
        .select()
        .single();

      savedTransaction = result.data;
      error = result.error;
    } else {
      // user_id database mein auth.uid() se khud set hoga.
      const result = await supabase
        .from("transactions")
        .insert(transactionData)
        .select()
        .single();

      savedTransaction = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Transaction save error:", error);
      alert(`Transaction save nahi hua: ${error.message}`);
      return;
    }

    if (editingId !== null) {
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === editingId ? savedTransaction : transaction
        )
      );
    } else {
      setTransactions((current) => [savedTransaction, ...current]);
    }

    setIsFormOpen(false);
    setEditingId(null);
    setFormData(emptyForm());
  }

  async function handleSaveBudget(event) {
    event.preventDefault();

    const limitAmount = Number(budgetForm.amount);
    if (!budgetForm.month || !Number.isFinite(limitAmount) || limitAmount <= 0) {
      alert("Month select karo aur budget zero se zyada enter karo.");
      return;
    }

    setBudgetSaving(true);
    const budgetData = {
      user_id: userId,
      month: budgetForm.month,
      category: budgetForm.category,
      limit_amount: limitAmount,
    };

    const { data, error } = await supabase
      .from("category_budgets")
      .upsert(budgetData, { onConflict: "user_id,month,category" })
      .select()
      .single();

    setBudgetSaving(false);

    if (error) {
      console.error("Budget save error:", error);
      alert(`Budget save nahi hua: ${error.message}`);
      return;
    }

    setBudgets((current) => [
      ...current.filter(
        (budget) =>
          !(
            budget.month === data.month &&
            budget.category === data.category &&
            budget.user_id === data.user_id
          )
      ),
      data,
    ]);
    setBudgetForm((current) => ({ ...current, amount: "" }));
  }

  function handleExportCSV() {
    downloadTransactionsCSV(
      visibleTransactions,
      `expense-tracker-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }
  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Image file select karo.");
      event.target.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert("Photo 3 MB se chhoti honi chahiye.");
      event.target.value = "";
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    const name = profileDraft.trim();
    if (!name) {
      alert("Naam khali nahi ho sakta.");
      return;
    }

    setProfileSaving(true);
    const currentMetadata = session?.user?.user_metadata ?? {};
    let avatarUrl = profileAvatar;

    if (avatarFile) {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(`${userId}/profile-avatar`, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
          cacheControl: "0",
        });

      if (uploadError) {
        setProfileSaving(false);
        alert(`Photo upload nahi hui: ${uploadError.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(`${userId}/profile-avatar`);
      avatarUrl = `${publicData.publicUrl}?updated=${Date.now()}`;
    }

    const { data, error } = await supabase.auth.updateUser({
      data: { ...currentMetadata, full_name: name, name, avatar_url: avatarUrl },
    });
    setProfileSaving(false);

    if (error) {
      alert(`Profile save nahi hua: ${error.message}`);
      return;
    }

    setSession((current) => current ? { ...current, user: data.user } : current);
    setDisplayName(name);
    setProfileAvatar(avatarUrl);
    setAvatarFile(null);
    setAvatarPreview("");
    setProfileOpen(false);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(`Logout nahi hua: ${error.message}`);
    }
  }

  if (authLoading) {
    return <p style={styles.loading}>Loading...</p>;
  }

  if (!session) {
    return showHome ? <HomePage onStart={() => setShowHome(false)} /> : <Auth />;
  }

  if (!transactionsLoaded) {
    return <p style={styles.loading}>Loading transactions...</p>;
  }

  return (
    <main className="app-shell" data-theme={theme} style={styles.main}>
      <header style={styles.header}>
        <div className="dashboard-identity">
          {profileAvatar && <img className="dashboard-avatar" src={profileAvatar} alt="Profile" />}
          <div>
            <h1 style={styles.title}>Expense Dashboard</h1>
            <p style={styles.subtitle}>Welcome, {displayName}</p>
            <p className="profile-email">{session.user.email}</p>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "🌙 Dark mode" : "☀️ Light mode"}
          </button>
          <button
            type="button"
            className="profile-toggle"
            onClick={() => {
              setProfileDraft(displayName);
              setAvatarFile(null);
              setAvatarPreview("");
              setProfileOpen((open) => !open);
            }}
            aria-expanded={profileOpen}
          >
            Profile
          </button>
          {!isFormOpen && (
            <button onClick={handleOpenAddForm} style={styles.addButton}>
              + Add Transaction
            </button>
          )}

          <button className="logout-button" onClick={handleLogout} style={styles.logoutButton}>
            Log out
          </button>
        </div>
      </header>

      {profileOpen && (
        <section className="profile-card" aria-labelledby="profile-title">
          <div className="profile-summary">
            <img className="profile-avatar" src={avatarPreview || profileAvatar || "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 96 96%27%3E%3Crect width=%2796%27 height=%2796%27 rx=%2748%27 fill=%27%23e5f5ec%27/%3E%3Ctext x=%2750%25%27 y=%2758%25%27 text-anchor=%27middle%27 font-size=%2738%27 fill=%27%23147d73%27%3E%3F%3C/text%3E%3C/svg%3E"} alt="Profile preview" />
            <div>
              <span className="dashboard-kicker">ACCOUNT SETTINGS</span>
              <h2 id="profile-title">Your profile</h2>
              <p>Naam aur photo dashboard par dikhenge.</p>
            </div>
          </div>
          <form className="profile-form" onSubmit={handleSaveProfile}>
            <label>
              <span>Display name</span>
              <input type="text" maxLength={80} value={profileDraft} onChange={(event) => setProfileDraft(event.target.value)} placeholder="Apna naam" required />
            </label>
            <label className="avatar-picker">
              <span>Profile photo (max 3 MB)</span>
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
            </label>
            <div className="profile-actions">
              <button type="button" className="profile-cancel" onClick={() => { setProfileDraft(displayName); setAvatarFile(null); setAvatarPreview(""); setProfileOpen(false); }}>Cancel</button>
              <button type="submit" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save profile"}</button>
            </div>
          </form>
        </section>
      )}
      <section className="dashboard-tools" aria-label="Dashboard filters">
        <div>
          <span className="dashboard-kicker">YOUR OVERVIEW</span>
          <p className="filter-caption">Choose a month to update your totals and transactions.</p>
        </div>
        <label className="month-filter">
          <span>Show</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            <option value="all">All months</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section style={styles.summaryGrid}>
        <Summary title="Total Income" amount={totalIncome} color="#23845f" />
        <Summary title="Total Expenses" amount={totalExpense} color="#c45b52" />
        <Summary title="Net Balance" amount={balance} color="#147d73" />
      </section>


      <section className="date-report-card" aria-labelledby="date-report-title">
        <div className="date-report-heading">
          <div>
            <span className="dashboard-kicker">CUSTOM REPORT</span>
            <h2 id="date-report-title">Date-range report</h2>
            <p>Select one day, a few days, or a full month.</p>
          </div>
          <button
            type="button"
            className="report-download"
            onClick={handleDownloadDateReport}
            disabled={!reportRangeValid || reportTransactions.length === 0}
          >
            Download report CSV
          </button>
        </div>

        <div className="date-report-filters">
          <label>
            <span>From</span>
            <input
              type="date"
              value={reportStartDate}
              max={reportEndDate}
              onChange={(event) => setReportStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={reportEndDate}
              min={reportStartDate}
              onChange={(event) => setReportEndDate(event.target.value)}
            />
          </label>
        </div>

        {!reportRangeValid ? (
          <p className="report-empty" role="alert">Start date must be before the end date.</p>
        ) : (
          <>
            <p className="report-period">
              {reportStartDate} to {reportEndDate} · {reportTransactions.length} entr{reportTransactions.length === 1 ? "y" : "ies"}
            </p>
            <div className="report-summary-grid">
              <div><span>Income</span><strong className="report-income">₹{reportIncome.toLocaleString("en-IN")}</strong></div>
              <div><span>Expenses</span><strong className="report-expense">₹{reportExpense.toLocaleString("en-IN")}</strong></div>
              <div><span>Net balance</span><strong>₹{reportBalance.toLocaleString("en-IN")}</strong></div>
            </div>
            {reportTransactions.length === 0 ? (
              <p className="report-empty">No transactions in this date range.</p>
            ) : (
              <div className="report-entries">
                {reportTransactions.map((transaction) => (
                  <div className="report-entry" key={`report-${transaction.id}`}>
                    <div>
                      <strong>{transaction.category}</strong>
                      <span>{transaction.date} · {transaction.type}</span>
                    </div>
                    <strong className={transaction.type === "Income" ? "report-income" : "report-expense"}>
                      {transaction.type === "Income" ? "+" : "−"} ₹{Number(transaction.amount).toLocaleString("en-IN")}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="insights-card" aria-labelledby="category-chart-title">
        <div className="insights-heading">
          <div>
            <span className="dashboard-kicker">SPENDING BREAKDOWN</span>
            <h2 id="category-chart-title">Expenses by category</h2>
          </div>
          <span className="insights-total">₹{totalExpense.toLocaleString()} total</span>
        </div>

        {expensesByCategory.length === 0 ? (
          <p className="chart-empty">No expense data for this period yet.</p>
        ) : (
          <div className="category-list">
            {expensesByCategory.map(({ category, amount }) => (
              <div className="category-item" key={category}>
                <div className="category-meta">
                  <span>{category}</span>
                  <strong>₹{amount.toLocaleString()}</strong>
                </div>
                <div className="category-track" aria-label={`${category}: ${Math.round((amount / totalExpense) * 100)} percent of expenses`}>
                  <span style={{ width: `${(amount / totalExpense) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="budget-card" aria-labelledby="budget-title">
        <div className="budget-heading">
          <div>
            <span className="dashboard-kicker">PLAN AHEAD</span>
            <h2 id="budget-title">Monthly category budgets</h2>
            <p>Set a spending limit and get a notice as you approach it.</p>
          </div>
        </div>

        <form className="budget-form" onSubmit={handleSaveBudget}>
          <label>
            <span>Month</span>
            <input
              type="month"
              value={budgetForm.month}
              onChange={(event) =>
                setBudgetForm({ ...budgetForm, month: event.target.value })
              }
              required
            />
          </label>
          <label>
            <span>Category</span>
            <select
              value={budgetForm.category}
              onChange={(event) =>
                setBudgetForm({ ...budgetForm, category: event.target.value })
              }
            >
              <option>Grocery</option><option>Food</option><option>Travel</option><option>Shopping</option><option>Bills</option><option>Health</option><option>Other</option>
            </select>
          </label>
          <label>
            <span>Limit (₹)</span>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 5000"
              value={budgetForm.amount}
              onChange={(event) =>
                setBudgetForm({ ...budgetForm, amount: event.target.value })
              }
              required
            />
          </label>
          <button type="submit" disabled={budgetSaving}>
            {budgetSaving ? "Saving..." : "Save budget"}
          </button>
        </form>

        <div className="budget-list">
          <h3>
            Budgets for {new Date(`${budgetForm.month}-01T00:00:00`).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>
          {budgetsForMonth.length === 0 ? (
            <p className="budget-empty">No budgets set for this month yet.</p>
          ) : (
            budgetsForMonth.map((budget) => (
              <article className="budget-item" key={`${budget.month}-${budget.category}`}>
                <div className="budget-item-top">
                  <div>
                    <strong>{budget.category}</strong>
                    <span>₹{budget.spent.toLocaleString()} of ₹{Number(budget.limit_amount).toLocaleString()}</span>
                  </div>
                  <span
                    className={`budget-notice ${budget.percentage >= 100 ? "over" : budget.percentage >= 80 ? "near" : "safe"}`}
                  >
                    {budget.notice}
                  </span>
                </div>
                <div className="budget-track">
                  <span
                    className={budget.percentage >= 100 ? "over" : budget.percentage >= 80 ? "near" : "safe"}
                    style={{ width: `${Math.min(100, budget.percentage)}%` }}
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      {isFormOpen && (
        <section style={styles.formCard}>
          <div style={styles.formHeader}>
            <h2>{editingId !== null ? "Edit Transaction" : "New Transaction"}</h2>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              style={styles.closeButton}
              aria-label="Close form"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSaveTransaction}>
            <div style={styles.formGrid}>
              <Field label="Type">
                <select
                  value={formData.type}
                  onChange={handleTypeChange}
                  style={styles.input}
                >
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                </select>
              </Field>

              <Field label="Amount (₹)">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 1500"
                  value={formData.amount}
                  onChange={(event) =>
                    setFormData({ ...formData, amount: event.target.value })
                  }
                  required
                  style={styles.input}
                />
              </Field>

              <Field label="Category">
                <select
                  value={formData.category}
                  onChange={(event) =>
                    setFormData({ ...formData, category: event.target.value })
                  }
                  style={styles.input}
                >
                  {formData.type === "Expense" ? (
                    <>
                      <option>Grocery</option><option>Food</option><option>Travel</option>
                      <option>Shopping</option><option>Bills</option><option>Health</option><option>Other</option>
                    </>
                  ) : (
                    <>
                      <option>Salary</option><option>Freelance</option><option>Business</option>
                      <option>Gift</option><option>Other</option>
                    </>
                  )}
                </select>
              </Field>

              <Field label="Date">
                <input
                  type="date"
                  value={formData.date}
                  onChange={(event) =>
                    setFormData({ ...formData, date: event.target.value })
                  }
                  required
                  style={styles.input}
                />
              </Field>

              <Field label="Payment method (optional)">
                <select
                  value={formData.payment_method}
                  onChange={(event) =>
                    setFormData({ ...formData, payment_method: event.target.value })
                  }
                  style={styles.input}
                >
                  <option value="">Choose a method</option>
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Credit card</option>
                  <option>Debit card</option>
                  <option>Bank transfer</option>
                  <option>Other</option>
                </select>
              </Field>

              <Field label="Note (optional)">
                <input
                  type="text"
                  maxLength={200}
                  placeholder="What was this transaction for?"
                  value={formData.notes}
                  onChange={(event) =>
                    setFormData({ ...formData, notes: event.target.value })
                  }
                  style={styles.input}
                />
              </Field>
            </div>

            <div style={styles.formButtons}>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>

              <button type="submit" style={styles.saveButton}>
                {editingId !== null ? "Update Transaction" : "Save Transaction"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section style={styles.transactionsCard}>
        <div style={styles.transactionsHeader}>
          <div className="transactions-title-row">
            <h2>Transactions</h2>
            <button
              type="button"
              className="export-button"
              onClick={handleExportCSV}
              disabled={visibleTransactions.length === 0}
            >
              Download CSV
            </button>
            <span style={styles.mutedText}>
              Showing {visibleTransactions.length} of {filteredTransactions.length}
            </span>
          </div>
          <div className="transaction-filters">
            <label className="transaction-search">
              <span className="sr-only">Search transactions</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search category, date, amount..."
              />
            </label>
            <label className="type-filter">
              <span className="sr-only">Filter by transaction type</span>
              <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                <option value="all">All types</option>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </label>
          </div>
        </div>

        {visibleTransactions.length === 0 ? (
          <p style={styles.emptyState}>
            {transactions.length === 0
              ? "No transactions yet. Add one to begin."
              : "No matching transactions. Try changing your search or filters."}
          </p>
        ) : (
          visibleTransactions.map((transaction) => (
            <div key={transaction.id} style={styles.transactionRow}>
              <div>
                <strong>{transaction.category}</strong>
                <div className="transaction-subtitle">
                  <span>{transaction.date}</span>
                  {transaction.payment_method && (
                    <span className="payment-tag">{transaction.payment_method}</span>
                  )}
                </div>
                {transaction.notes && (
                  <p className="transaction-note">{transaction.notes}</p>
                )}
              </div>

              <div style={styles.rowActions}>
                <strong
                  style={{
                    color:
                      transaction.type === "Income" ? "#23845f" : "#c45b52",
                  }}
                >
                  {transaction.type === "Income" ? "+" : "−"} ₹
                  {Number(transaction.amount).toLocaleString()}
                </strong>

                <button
                  onClick={() => handleEditTransaction(transaction)}
                  style={styles.editButton}
                >
                  Edit
                </button>

                <button
                  onClick={() => handleDeleteTransaction(transaction.id)}
                  style={styles.deleteButton}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function HomePage({ onStart }) {
  return (
    <main className="home-page">
      <nav className="home-nav">
        <a className="brand" href="#home" aria-label="Expense Tracker home">
          <span className="brand-mark">₹</span>
          <span>Expense<span className="brand-light">Tracker</span></span>
        </a>
        <button className="nav-signin" onClick={onStart}>Sign in</button>
      </nav>

      <section className="home-hero" id="home">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> YOUR MONEY, MADE CLEAR</span>
          <h1>Spend smarter.<br /><span>Feel in control.</span></h1>
          <p className="hero-description">
            A simple, private place to track your income and expenses. See where your money goes and keep your finances moving in the right direction.
          </p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={onStart}>Get started <span aria-hidden="true">→</span></button>
            <span className="secure-note"><span aria-hidden="true">🔒</span> Your transactions stay in your account</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a sample expense summary" role="img">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="sample-card">
            <div className="sample-top"><span>Monthly overview</span><span className="sample-period">THIS MONTH⌄</span></div>
            <div className="sample-balance">₹24,580</div>
            <div className="sample-caption">Available balance</div>
            <div className="sample-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="sample-chart-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
            <div className="sample-divider" />
            <div className="sample-activity"><span className="activity-icon income-icon">↙</span><span><b>Income</b><small>This month</small></span><strong className="income-value">+ ₹32,000</strong></div>
            <div className="sample-activity"><span className="activity-icon expense-icon">↗</span><span><b>Expenses</b><small>This month</small></span><strong className="expense-value">− ₹7,420</strong></div>
          </div>
          <div className="floating-chip"><span>✦</span> Every rupee, in view</div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading"><span className="eyebrow">A CLEARER VIEW OF YOUR MONEY</span><h2>Everything you need to stay on track.</h2></div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-icon icon-green">↗</span><h3>Know your numbers</h3><p>See your total income, expenses and balance together in one easy dashboard.</p></article>
          <article className="feature-card"><span className="feature-icon icon-peach">▤</span><h3>Keep every transaction</h3><p>Add, update and remove entries whenever you need. Your list stays easy to understand.</p></article>
          <article className="feature-card"><span className="feature-icon icon-lilac">♧</span><h3>Private to your account</h3><p>Sign in securely and view the transactions saved for your own account.</p></article>
        </div>
      </section>

      <section className="home-bottom-cta">
        <div><span className="eyebrow">A FRESH START</span><h2>Make your money easier to manage.</h2></div>
        <button className="primary-cta" onClick={onStart}>Open your tracker <span aria-hidden="true">→</span></button>
      </section>
      <footer className="home-footer"><span>₹ Expense Tracker</span><span>Simple money tracking, all in one place.</span></footer>
    </main>
  );
}
function Summary({ title, amount, color }) {
  return (
    <article style={styles.summaryCard}>
      <p style={styles.summaryLabel}>{title}</p>
      <h2 style={{ ...styles.summaryAmount, color }}>
        ₹{amount.toLocaleString()}
      </h2>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const styles = {
  main: {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
    padding: 24,
    boxSizing: "border-box",
    color: "#20332f",
  },
  loading: {
    color: "#20332f",
    padding: 24,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 28,
  },
  title: {
    fontSize: "clamp(24px, 4vw, 32px)",
    margin: 0,
    color: "#20332f",
  },
  subtitle: {
    color: "#71817b",
    fontSize: 14,
    marginTop: 6,
  },
  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  addButton: {
    padding: "11px 18px",
    background: "#147d73",
    color: "#fff",
    border: 0,
    borderRadius: 9,
    cursor: "pointer",
    fontWeight: 650,
  },
  logoutButton: {
    padding: "10px 16px",
    background: "#fff",
    color: "#49615a",
    border: "1px solid #dce7e2",
    borderRadius: 9,
    cursor: "pointer",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 26,
  },
  summaryCard: {
    background: "#fff",
    border: "1px solid #e1eae6",
    borderRadius: 14,
    padding: "21px 23px",
    boxShadow: "0 4px 14px rgba(36, 73, 58, 0.04)",
  },
  summaryLabel: {
    margin: 0,
    color: "#71817b",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  summaryAmount: {
    margin: "9px 0 0",
    fontSize: 26,
  },
  formCard: {
    background: "#fff",
    padding: 24,
    borderRadius: 14,
    marginBottom: 26,
    border: "1px solid #e1eae6",
    boxShadow: "0 4px 14px rgba(36, 73, 58, 0.04)",
  },
  formHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    color: "#20332f",
  },
  closeButton: {
    background: "transparent",
    border: 0,
    color: "#71817b",
    cursor: "pointer",
    fontSize: 22,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldLabel: {
    color: "#62756d",
    fontSize: 13,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 11,
    borderRadius: 8,
    border: "1px solid #d9e4df",
    background: "#fbfdfc",
    color: "#20332f",
  },
  formButtons: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
    flexWrap: "wrap",
  },
  cancelButton: {
    padding: "10px 16px",
    background: "#eef3f0",
    color: "#49615a",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
  },
  saveButton: {
    padding: "10px 18px",
    background: "#147d73",
    color: "#fff",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
  },
  transactionsCard: {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e1eae6",
    overflow: "hidden",
    boxShadow: "0 4px 14px rgba(36, 73, 58, 0.04)",
  },
  transactionsHeader: {
    padding: "19px 22px",
    borderBottom: "1px solid #e8efeb",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    color: "#20332f",
  },
  mutedText: {
    color: "#71817b",
    fontSize: 13,
  },
  emptyState: {
    padding: 32,
    textAlign: "center",
    color: "#71817b",
  },
  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 22px",
    borderBottom: "1px solid #edf2ef",
    gap: 16,
    flexWrap: "wrap",
    color: "#20332f",
  },
  dateText: {
    color: "#87958f",
    fontSize: 12,
    marginTop: 4,
  },
  rowActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
    flexWrap: "wrap",
  },
  editButton: {
    padding: "7px 12px",
    background: "#edf5f2",
    color: "#147d73",
    border: "1px solid #d5e8e1",
    borderRadius: 7,
    cursor: "pointer",
  },
  deleteButton: {
    padding: "7px 12px",
    background: "#fff1ef",
    color: "#b84f47",
    border: "1px solid #f2d8d4",
    borderRadius: 7,
    cursor: "pointer",
  },
};

export default App; 