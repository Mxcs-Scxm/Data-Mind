import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("DataMind crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter',system-ui,sans-serif", background: "#f4f6fa", padding: 24,
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "#111827" }}>
            DataMind ran into an unexpected error
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
            {this.state.error.message || "Something went wrong while rendering the app."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 13,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
