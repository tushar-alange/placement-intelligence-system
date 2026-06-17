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
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial" }}>
        <h2>Loading placements...</h2>
      </div>
    );
  }

  const sortedPlacements = [...placements].sort((a, b) => {
    return new Date(a.deadline) - new Date(b.deadline);
  });

  const filteredPlacements = sortedPlacements
    .filter((p) =>
      p.company?.toLowerCase().includes(search.toLowerCase())
    )
    .filter((p) =>
      branchFilter === "All" ? true : p.branch === branchFilter
    );

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Placement Intelligence Dashboard</h1>

      {/* SEARCH + FILTER */}
      <div style={{ marginBottom: "20px" }}>
        <input
          placeholder="Search company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px",
            marginRight: "10px",
            width: "220px",
          }}
        />

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={{ padding: "8px" }}
        >
          <option value="All">All Branches</option>
          <option value="Computer">Computer</option>
          <option value="IT">IT</option>
          <option value="Mechanical">Mechanical</option>
        </select>
      </div>

      {/* EMPTY STATE */}
      {filteredPlacements.length === 0 ? (
        <div>
          <h2>No placements available</h2>
          <p>Check back later or refresh the page.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredPlacements.map((p) => (
            <div
              key={p.placement_id}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "10px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                background: "#fff",
              }}
            >
              <h2 style={{ marginBottom: "8px" }}>
                {p.company}
              </h2>

              <p><b>Role:</b> {p.role}</p>
              <p><b>Branch:</b> {p.branch}</p>
              <p><b>Batch:</b> {p.batch}</p>
              <p><b>Stipend:</b> {p.stipend}</p>
              <p><b>Deadline:</b> {p.deadline}</p>

              {p.registration_link && (
                <a
                  href={p.registration_link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "blue" }}
                >
                  Apply Here →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;