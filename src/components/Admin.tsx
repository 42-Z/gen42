import React, { useState, useEffect } from "react";

export function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersRes, keysRes, statsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/keys"),
        fetch("/api/admin/stats"),
      ]);

      if (usersRes.ok) setUsers(await usersRes.json());
      if (keysRes.ok) setKeys(await keysRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (error) {
      console.error("Failed to load admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addKey() {
    if (!newKeyName || !newKeyValue) return;

    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, key: newKeyValue }),
      });

      if (res.ok) {
        setNewKeyName("");
        setNewKeyValue("");
        loadData();
      }
    } catch (error) {
      console.error("Failed to add key:", error);
    }
  }

  async function deleteKey(id: string) {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to delete key:", error);
    }
  }

  async function resetKey(id: string) {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "POST" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to reset key:", error);
    }
  }

  async function addCredits() {
    if (!creditUserId || creditAmount === 0) return;

    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: creditUserId, amount: creditAmount }),
      });

      if (res.ok) {
        setCreditUserId("");
        setCreditAmount(0);
        loadData();
      }
    } catch (error) {
      console.error("Failed to add credits:", error);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Admin Panel</h2>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold">Total Generations</h3>
            <p className="text-3xl font-bold">{stats.totalGenerations}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold">Today's Generations</h3>
            <p className="text-3xl font-bold">{stats.todayGenerations}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold">Active Keys</h3>
            <p className="text-3xl font-bold">
              {stats.keyUsage?.filter((k: any) => k.is_active).length || 0}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h3 className="text-lg font-bold mb-4">Users</h3>
        <div className="mb-4 flex gap-4">
          <select
            value={creditUserId}
            onChange={(e) => setCreditUserId(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} (Balance: {u.balance})
              </option>
            ))}
          </select>
          <input
            type="number"
            value={creditAmount}
            onChange={(e) => setCreditAmount(Number(e.target.value))}
            placeholder="Amount (минус = списание)"
            className="px-3 py-2 border rounded-lg"
          />
          <button
            onClick={addCredits}
            className="bg-green-500 text-white px-4 py-2 rounded-lg"
          >
            Add Credits
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-bold mb-4">API Keys</h3>
        <div className="mb-4 flex gap-4">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            type="text"
            value={newKeyValue}
            onChange={(e) => setNewKeyValue(e.target.value)}
            placeholder="hf_... ключ"
            className="px-3 py-2 border rounded-lg flex-1"
          />
          <button
            onClick={addKey}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg"
          >
            Add Key
          </button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Name</th>
              <th className="text-left py-2">Key</th>
              <th className="text-left py-2">Used Today</th>
              <th className="text-left py-2">Limit</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b">
                <td className="py-2">{k.name}</td>
                <td className="py-2">{k.key}</td>
                <td className="py-2">{k.used_today}</td>
                <td className="py-2">{k.daily_limit}</td>
                <td className="py-2">
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      k.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {k.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <button
                    onClick={() => resetKey(k.id)}
                    className="text-blue-500 hover:underline mr-2"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
