import { useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./Auth.css";

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleGoogleSignIn() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">₹</div>

        <h1>Welcome to Expense Tracker</h1>

        <p className="auth-description">
          Apne paise ka hisaab aasani se rakhna shuru karo.
        </p>

        {message && <p className="auth-message">{message}</p>}

        <button
          className="auth-submit"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? "Please wait..." : "Continue with Google"}
        </button>

        <p className="auth-footer">
          Google account se securely sign in karo.
        </p>
      </section>
    </main>
  );
}