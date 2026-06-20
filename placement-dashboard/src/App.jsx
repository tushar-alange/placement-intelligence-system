import { useEffect, useState } from "react";
import "./App.css";

const EMPTY_FORM = {
  company: "",
  role: "",
  branch: "Computer",
  deadline: "",
  stipend: "",
  registration_link: "",
};

function App() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("All");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const API_URL =
    "https://zasqht7wudfr3kr5pwog7gqmsi0vmisw.lambda-url.ap-south-1.on.aws/";

  // ---------------- FETCH ----------------
  const fetchPlacements = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_URL);

      if (!res.ok) {
        const text = await res.text();
        console.log("API ERROR:", text);
        setError(`Failed to load placements (${res.status})`);
        setPlacements([]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      console.log("API RESPONSE:", data);

      const list = Array.isArray(data)
        ? data
        : data?.data && Array.isArray(data.data)
        ? data.data
        : [];

      setPlacements(list);
    } catch (err) {
      console.log("FETCH ERROR:", err);
      setError("Could not reach the server. Check your connection.");
      setPlacements([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPlacements();
  }, []);

  // ---------------- ADD (manual entry from dashboard) ----------------
  const handleFormChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(false);
  };

  const handleAddPlacement = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!form.company.trim() || !form.role.trim()) {
      setFormError("Company and Role are required.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // subject/body left blank: the Lambda's extractor only kicks in
        // when those are present, so a direct dashboard add just uses
        // the manual fields as-is.
        body: JSON.stringify({
          company: form.company.trim(),
          role: form.role.trim(),
          branch: form.branch,
          deadline: form.deadline.trim(),
          stipend: form.stipend.trim(),
          registration_link: form.registration_link.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log("ADD ERROR:", text);
        setFormError(`Could not add placement (${res.status}). Try again.`);
        setSubmitting(false);
        return;
      }

      resetForm();
      await fetchPlacements();
    } catch (err) {
      console.log("ADD FETCH ERROR:", err);
      setFormError("Could not reach the server. Check your connection.");
    }

    setSubmitting(false);
  };

  // ---------------- DELETE ----------------
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this placement?")) return;

    console.log("DELETE ID SENT:", id);

    try {
      const res = await fetch(API_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement_id: id }),
      });

      const text = await res.text();
      console.log("RAW DELETE RESPONSE:", text);

      if (!res.ok) {
        alert(`Delete failed (${res.status}). Please try again.`);
        return;
      }

      fetchPlacements();
    } catch (err) {
      console.log("DELETE ERROR:", err);
      alert("Could not delete — check your connection.");
    }
  };

  // ---------------- EDIT ----------------
  const openEdit = (item) => {
    setEditingItem(item);
    setEditError(null);
    setEditForm({
      company: item.company || "",
      role: item.role || "",
      branch: item.branch || "Computer",
      // DynamoDB may hold dates in various string formats from older
      // entries/emails; <input type="date"> only accepts YYYY-MM-DD,
      // so fall back to empty if it doesn't already match that shape.
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || "") ? item.deadline : "",
      stipend: item.stipend || "",
      registration_link: item.registration_link || "",
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm(EMPTY_FORM);
    setEditError(null);
  };

  const handleEditFormChange = (field) => (e) => {
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError(null);

    if (!editForm.company.trim() || !editForm.role.trim()) {
      setEditError("Company and Role are required.");
      return;
    }

    setEditSubmitting(true);

    try {
      const res = await fetch(API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placement_id: editingItem.placement_id,
          company: editForm.company.trim(),
          role: editForm.role.trim(),
          branch: editForm.branch,
          deadline: editForm.deadline,
          stipend: editForm.stipend.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log("EDIT ERROR:", text);
        setEditError(`Update failed (${res.status}). Please try again.`);
        setEditSubmitting(false);
        return;
      }

      closeEdit();
      await fetchPlacements();
    } catch (err) {
      console.log("EDIT FETCH ERROR:", err);
      setEditError("Could not reach the server. Check your connection.");
    }

    setEditSubmitting(false);
  };

  // ---------------- SEARCH + FILTER + SORT ----------------
  const filtered = placements
    .filter((item) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        (item.company || "").toLowerCase().includes(searchText) ||
        (item.role || "").toLowerCase().includes(searchText);

      const matchesBranch =
        branchFilter === "All" || item.branch === branchFilter;

      return matchesSearch && matchesBranch;
    })
    .sort((a, b) => {
      // newest first; falls back gracefully if created_at is missing
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

  if (loading) return <h2 className="status-text">Loading...</h2>;

  return (
    <div className="page">
      <div className="header-row">
        <h1>Placement Dashboard</h1>
        <button
          className="add-btn"
          onClick={() => setShowForm((prev) => !prev)}
        >
          {showForm ? "Cancel" : "+ Add Placement"}
        </button>
      </div>

      {error && (
        <div className="banner banner-error">
          {error}{" "}
          <button onClick={fetchPlacements} className="link-btn">
            Retry
          </button>
        </div>
      )}

      {showForm && (
        <form className="add-form" onSubmit={handleAddPlacement}>
          <div className="form-grid">
            <input
              placeholder="Company *"
              value={form.company}
              onChange={handleFormChange("company")}
              required
            />
            <input
              placeholder="Role *"
              value={form.role}
              onChange={handleFormChange("role")}
              required
            />
            <select value={form.branch} onChange={handleFormChange("branch")}>
              <option value="Computer">Computer</option>
              <option value="IT">IT</option>
              <option value="Mechanical">Mechanical</option>
              <option value="ENTC">ENTC</option>
            </select>
            <input
              type="date"
              placeholder="Deadline"
              value={form.deadline}
              onChange={handleFormChange("deadline")}
            />
            <input
              placeholder="Stipend (e.g. 4.5 LPA)"
              value={form.stipend}
              onChange={handleFormChange("stipend")}
            />
            <input
              placeholder="Registration link"
              value={form.registration_link}
              onChange={handleFormChange("registration_link")}
            />
          </div>

          {formError && <p className="form-error">{formError}</p>}

          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Placement"}
            </button>
            <button type="button" className="link-btn" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <input
          placeholder="Search by company or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="All">All Branches</option>
          <option value="Computer">Computer</option>
          <option value="IT">IT</option>
          <option value="Mechanical">Mechanical</option>
          <option value="ENTC">ENTC</option>
        </select>
      </div>

      {!error && filtered.length === 0 && (
        <p className="status-text">
          No placements found
          {search || branchFilter !== "All" ? " for this search/filter." : " yet."}
        </p>
      )}

      <div className="card-grid">
        {filtered.map((item) => (
          <div key={item.placement_id} className="card">
            <h3>
              {item.role || "Unknown role"} - {item.company || "Unknown company"}
            </h3>

            <p>
              <b>Branch:</b> {item.branch || "—"}
            </p>
            <p>
              <b>Deadline:</b> {item.deadline || "—"}
            </p>
            <p>
              <b>Stipend:</b> {item.stipend || "—"}
            </p>

            <div className="card-actions">
              <button onClick={() => openEdit(item)}>Edit</button>

              <button
                onClick={() => handleDelete(item.placement_id)}
                className="delete-btn"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingItem && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <form
            className="modal-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleEditSubmit}
          >
            <h2>Edit Placement</h2>

            <div className="form-grid">
              <input
                placeholder="Company *"
                value={editForm.company}
                onChange={handleEditFormChange("company")}
                required
              />
              <input
                placeholder="Role *"
                value={editForm.role}
                onChange={handleEditFormChange("role")}
                required
              />
              <select
                value={editForm.branch}
                onChange={handleEditFormChange("branch")}
              >
                <option value="Computer">Computer</option>
                <option value="IT">IT</option>
                <option value="Mechanical">Mechanical</option>
                <option value="ENTC">ENTC</option>
              </select>
              <input
                type="date"
                value={editForm.deadline}
                onChange={handleEditFormChange("deadline")}
              />
              <input
                placeholder="Stipend (e.g. 4.5 LPA)"
                value={editForm.stipend}
                onChange={handleEditFormChange("stipend")}
              />
            </div>

            {editError && <p className="form-error">{editError}</p>}

            <div className="form-actions">
              <button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" className="link-btn" onClick={closeEdit}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;