import { useEffect, useState } from "react";

function App() {
  const [placements, setPlacements] = useState([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    fetch("https://xddnudltegwx2w7wn7zcedgaju0pzzal.lambda-url.ap-south-1.on.aws/")
      .then((res) => res.json())
      .then((data) => {
        const parsed =
          data?.body && typeof data.body === "string"
            ? JSON.parse(data.body)
            : data;

        setPlacements(parsed || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const sorted = [...placements].sort(
    (a, b) => new Date(b.deadline) - new Date(a.deadline)
  );

  const filtered = sorted
    .filter((p) =>
      p.company?.toLowerCase().includes(search.toLowerCase())
    )
    .filter((p) =>
      branchFilter === "All" ? true : p.branch === branchFilter
    );

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>Placement Intelligence System</h1>
        <p style={styles.subtitle}>
          Live placements from email automation pipeline
        </p>
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <input
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.input}
        />

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={styles.select}
        >
          <option value="All">All Branches</option>
          <option value="Computer">Computer</option>
          <option value="IT">IT</option>
          <option value="Mechanical">Mechanical</option>
        </select>
      </div>

      {/* CONTENT */}
      {loading ? (
        <p style={styles.info}>Loading placements...</p>
      ) : filtered.length === 0 ? (
        <p style={styles.info}>No placements found</p>
      ) : (
        <div style={styles.grid}>
          {filtered.map((p) => (
            <div key={p.placement_id} style={styles.card}>
              <div style={styles.cardTop}>
                <h2 style={styles.company}>{p.company}</h2>

                <span style={styles.badge}>
                  ₹ {p.stipend || "N/A"}
                </span>
              </div>

              <p><b>Role:</b> {p.role}</p>
              <p><b>Branch:</b> {p.branch}</p>
              <p><b>Batch:</b> {p.batch}</p>

              <div style={styles.deadline}>
                Deadline: {p.deadline}
              </div>

              {p.registration_link && (
                <a
                  href={p.registration_link}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link}
                >
                  Apply Now →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "Arial",
    background: "#f6f7fb",
    minHeight: "100vh",
    padding: "30px",
  },
  header: {
    textAlign: "center",
    marginBottom: "25px",
  },
  title: {
    margin: 0,
    fontSize: "28px",
  },
  subtitle: {
    margin: "5px 0 0",
    color: "#666",
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "20px",
  },
  input: {
    padding: "10px",
    width: "220px",
    borderRadius: "8px",
    border: "1px solid #ccc",
  },
  select: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ccc",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "15px",
    maxWidth: "1100px",
    margin: "auto",
  },
  card: {
    background: "white",
    padding: "15px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  company: {
    fontSize: "18px",
    margin: 0,
  },
  badge: {
    background: "#e8f5e9",
    color: "#2e7d32",
    padding: "5px 10px",
    borderRadius: "20px",
    fontSize: "12px",
  },
  deadline: {
    marginTop: "10px",
    fontSize: "13px",
    color: "#d32f2f",
    fontWeight: "bold",
  },
  link: {
    display: "inline-block",
    marginTop: "10px",
    color: "#1976d2",
    fontWeight: "bold",
    textDecoration: "none",
  },
  info: {
    textAlign: "center",
    color: "#666",
    marginTop: "40px",
  },
};

export default App;